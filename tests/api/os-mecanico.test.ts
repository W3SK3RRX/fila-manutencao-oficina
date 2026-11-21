import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste de route handler (ver tests/api/os-balcao.test.ts e
// tests/api/fila.test.ts): importar a função exportada diretamente e
// invocá-la com um NextRequest de verdade. Todas as rotas desta task recebem
// `request: NextRequest` e leem o cookie de sessão via
// `request.cookies.get(...)` + `verificarSessao(token)` — não via
// `lerSessao()` de lib/auth.ts, que lança "called outside a request scope"
// quando o handler é invocado diretamente.
function buildRequest(
  path: string,
  options: { cookieValue?: string; method?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.cookieValue) {
    headers.cookie = `${NOME_COOKIE_SESSAO}=${options.cookieValue}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  return new NextRequest(
    new Request(`http://localhost${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }),
  );
}

const criadas: { tipoIds: string[]; mecanicoIds: string[]; osIds: string[] } = {
  tipoIds: [],
  mecanicoIds: [],
  osIds: [],
};

afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.mecanicoIds.length) {
    await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = [];
  criadas.mecanicoIds = [];
  criadas.osIds = [];
});

async function criarTipo(peso = 50) {
  const tipo = await prisma.tipoServico.create({
    data: { nome: `Teste os-mecanico-api ${randomUUID()}`, peso },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico(nome = "Mecânico Teste OS Mecânico API") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

async function criarOsDireta(
  tipoId: string,
  status: "na_fila" | "em_execucao" | "pausada" | "concluida" | "cancelada",
  opts: { mecanicoId?: string; motivoPausa?: string } = {},
) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste os-mecanico-api",
      tipoServicoId: tipoId,
      status,
      mecanicoId: opts.mecanicoId ?? null,
      motivoPausa: opts.motivoPausa ?? null,
      iniciadoEm: status === "na_fila" ? null : new Date(),
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

async function contarEventos(osId: string) {
  return prisma.osEvento.count({ where: { osId } });
}

describe("POST /api/os/pegar-proximo", () => {
  it("sem sessão: retorna 401", async () => {
    const { POST } = await import("@/app/api/os/pegar-proximo/route");
    const response = await POST(buildRequest("/api/os/pegar-proximo", { method: "POST" }));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 403 (rota exclusiva do mecânico)", async () => {
    const { POST } = await import("@/app/api/os/pegar-proximo/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest("/api/os/pegar-proximo", { method: "POST", cookieValue: token }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("fila vazia: retorna 204", async () => {
    const mecanico = await criarMecanico();

    const { POST } = await import("@/app/api/os/pegar-proximo/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest("/api/os/pegar-proximo", { method: "POST", cookieValue: token }),
    );

    expect(response.status).toBe(204);
  });

  it("fila com OS: atribui ao mecânico e retorna 200 + a OS", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { POST } = await import("@/app/api/os/pegar-proximo/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest("/api/os/pegar-proximo", { method: "POST", cookieValue: token }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.id).toBe(os.id);
    expect(corpo.status).toBe("em_execucao");
  });

  it("mecânico já com OS em_execucao: retorna 409", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });
    await criarOsDireta(tipo.id, "na_fila");

    const { POST } = await import("@/app/api/os/pegar-proximo/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest("/api/os/pegar-proximo", { method: "POST", cookieValue: token }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");
  });
});

describe("POST /api/os/[id]/pausar", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/pausar/route");
    const response = await POST(
      buildRequest(`/api/os/${os.id}/pausar`, { method: "POST", body: { motivo: "outro", motivoTexto: "x" } }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 403 (rota exclusiva do mecânico)", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/pausar/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/pausar`, {
        method: "POST",
        cookieValue: token,
        body: { motivo: "aguardando_peca" },
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("dados inválidos: retorna 400", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/pausar/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/pausar`, {
        method: "POST",
        cookieValue: token,
        body: { motivo: "outro" },
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(400);
    expect(corpo.codigo).toBeTruthy();
  });

  it("mecânico dono: pausa e retorna 200", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/pausar/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/pausar`, {
        method: "POST",
        cookieValue: token,
        body: { motivo: "aguardando_peca" },
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("pausada");
  });

  it("isolamento entre mecânicos: mecânico B não pode pausar OS do mecânico A (409, sem mutação, sem evento)", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Mecânico A (dono)");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: donoA.id });

    const eventosAntes = await contarEventos(os.id);

    const { POST } = await import("@/app/api/os/[id]/pausar/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/pausar`, {
        method: "POST",
        cookieValue: token,
        body: { motivo: "aguardando_peca" },
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("em_execucao");
    expect(osAtual.mecanicoId).toBe(donoA.id);

    const eventosDepois = await contarEventos(os.id);
    expect(eventosDepois).toBe(eventosAntes);
  });
});

describe("POST /api/os/[id]/retomar", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/retomar/route");
    const response = await POST(
      buildRequest(`/api/os/${os.id}/retomar`, { method: "POST" }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 403 (rota exclusiva do mecânico)", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/retomar/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/retomar`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("mecânico dono: retoma e retorna 200", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/retomar/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/retomar`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("em_execucao");
  });

  it("mecânico já com outra OS em_execucao: retorna 409", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });
    const pausada = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/retomar/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${pausada.id}/retomar`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: pausada.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");
  });

  it("isolamento entre mecânicos: mecânico B não pode retomar OS do mecânico A (409, sem mutação, sem evento)", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Mecânico A (dono)");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: donoA.id });

    const eventosAntes = await contarEventos(os.id);

    const { POST } = await import("@/app/api/os/[id]/retomar/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/retomar`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("pausada");
    expect(osAtual.mecanicoId).toBe(donoA.id);

    const eventosDepois = await contarEventos(os.id);
    expect(eventosDepois).toBe(eventosAntes);
  });
});

describe("POST /api/os/[id]/devolver", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/devolver/route");
    const response = await POST(
      buildRequest(`/api/os/${os.id}/devolver`, { method: "POST" }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("mecânico dono: devolve e retorna 200", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/devolver/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/devolver`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("na_fila");
    expect(corpo.mecanicoId).toBeNull();
  });

  it("balcão: também pode devolver (qualquer OS pausada) e retorna 200", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/devolver/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/devolver`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("na_fila");
    expect(corpo.mecanicoId).toBeNull();

    const evento = await prisma.osEvento.findFirst({
      where: { osId: os.id, paraStatus: "na_fila" },
    });
    expect(evento?.origem).toBe("balcao");
  });

  it("isolamento entre mecânicos: mecânico B não pode devolver OS do mecânico A (409, sem mutação, sem evento)", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Mecânico A (dono)");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: donoA.id });

    const eventosAntes = await contarEventos(os.id);

    const { POST } = await import("@/app/api/os/[id]/devolver/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/devolver`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("pausada");
    expect(osAtual.mecanicoId).toBe(donoA.id);

    const eventosDepois = await contarEventos(os.id);
    expect(eventosDepois).toBe(eventosAntes);
  });
});

describe("POST /api/os/[id]/concluir", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/concluir/route");
    const response = await POST(
      buildRequest(`/api/os/${os.id}/concluir`, { method: "POST" }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 403 (rota exclusiva do mecânico)", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/concluir/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/concluir`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("mecânico dono: conclui e retorna 200", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/concluir/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/concluir`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("concluida");
  });

  it("isolamento entre mecânicos: mecânico B não pode concluir OS do mecânico A (409, sem mutação, sem evento)", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Mecânico A (dono)");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: donoA.id });

    const eventosAntes = await contarEventos(os.id);

    const { POST } = await import("@/app/api/os/[id]/concluir/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/concluir`, { method: "POST", cookieValue: token }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("em_execucao");
    expect(osAtual.mecanicoId).toBe(donoA.id);

    const eventosDepois = await contarEventos(os.id);
    expect(eventosDepois).toBe(eventosAntes);
  });
});
