import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste de route handler (ver tests/api/fila.test.ts): importar a
// função exportada diretamente e invocá-la com um NextRequest de verdade. As
// três rotas desta task recebem `request: NextRequest` e leem o cookie de
// sessão via `request.cookies.get(...)` + `verificarSessao(token)` — não via
// `lerSessao()` de lib/auth.ts, que depende do AsyncLocalStorage de
// `next/headers`'s `cookies()` e lança "called outside a request scope"
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
    data: { nome: `Teste os-balcao-api ${randomUUID()}`, peso },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico(nome = "Mecânico Teste OS Balcão API") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

async function criarOsDireta(
  tipoId: string,
  status: "na_fila" | "em_execucao" | "pausada" | "concluida" | "cancelada",
  opts: { mecanicoId?: string } = {},
) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste os-balcao-api",
      tipoServicoId: tipoId,
      status,
      mecanicoId: opts.mecanicoId ?? null,
      iniciadoEm: status === "na_fila" ? null : new Date(),
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

function dadosValidos(tipoId: string) {
  return {
    placa: `TST${Math.floor(Math.random() * 100000)}`,
    modeloMoto: "Honda CG 160",
    clienteNome: "Cliente Teste",
    clienteTelefone: "11999999999",
    descricao: "Troca de óleo",
    tipoServicoId: tipoId,
  };
}

describe("POST /api/os", () => {
  it("sem sessão: retorna 401", async () => {
    const { POST } = await import("@/app/api/os/route");
    const response = await POST(buildRequest("/api/os", { method: "POST", body: {} }));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de mecânico: retorna 403 (rota exclusiva do balcão)", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();

    const { POST } = await import("@/app/api/os/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest("/api/os", { method: "POST", cookieValue: token, body: dadosValidos(tipo.id) }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("dados inválidos: retorna 400", async () => {
    const { POST } = await import("@/app/api/os/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest("/api/os", { method: "POST", cookieValue: token, body: {} }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(400);
    expect(corpo.codigo).toBeTruthy();
  });

  it("dados válidos + sessão de balcão: cria a OS e retorna 201", async () => {
    const tipo = await criarTipo();

    const { POST } = await import("@/app/api/os/route");
    const token = await assinarSessaoBalcao();
    const dados = dadosValidos(tipo.id);
    const response = await POST(
      buildRequest("/api/os", { method: "POST", cookieValue: token, body: dados }),
    );
    const corpo = await response.json();

    expect(response.status).toBe(201);
    expect(corpo.status).toBe("na_fila");
    expect(corpo.placa).toBe(dados.placa.toUpperCase());
    criadas.osIds.push(corpo.id);

    const evento = await prisma.osEvento.findFirst({ where: { osId: corpo.id } });
    expect(evento).toMatchObject({ deStatus: null, paraStatus: "na_fila", origem: "balcao" });
  });
});

describe("PATCH /api/os/[id]", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { PATCH } = await import("@/app/api/os/[id]/route");
    const response = await PATCH(buildRequest(`/api/os/${os.id}`, { method: "PATCH", body: {} }), {
      params: Promise.resolve({ id: os.id }),
    });
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de mecânico: retorna 403 (rota exclusiva do balcão)", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { PATCH } = await import("@/app/api/os/[id]/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await PATCH(
      buildRequest(`/api/os/${os.id}`, {
        method: "PATCH",
        cookieValue: token,
        body: dadosValidos(tipo.id),
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("OS na_fila: edita e retorna 200", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");
    const novoTipo = await criarTipo();

    const { PATCH } = await import("@/app/api/os/[id]/route");
    const token = await assinarSessaoBalcao();
    const dados = { ...dadosValidos(novoTipo.id), clienteNome: "Cliente Editado" };
    const response = await PATCH(
      buildRequest(`/api/os/${os.id}`, { method: "PATCH", cookieValue: token, body: dados }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.clienteNome).toBe("Cliente Editado");
  });

  it("OS em_execucao: retorna 409 e não altera a OS", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const { PATCH } = await import("@/app/api/os/[id]/route");
    const token = await assinarSessaoBalcao();
    const response = await PATCH(
      buildRequest(`/api/os/${os.id}`, {
        method: "PATCH",
        cookieValue: token,
        body: dadosValidos(tipo.id),
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("em_execucao");
  });
});

describe("POST /api/os/[id]/cancelar", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { POST } = await import("@/app/api/os/[id]/cancelar/route");
    const response = await POST(
      buildRequest(`/api/os/${os.id}/cancelar`, { method: "POST", body: {} }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de mecânico: retorna 403 (rota exclusiva do balcão)", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { POST } = await import("@/app/api/os/[id]/cancelar/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/cancelar`, { method: "POST", cookieValue: token, body: {} }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("OS pausada: cancela e retorna 200", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });

    const { POST } = await import("@/app/api/os/[id]/cancelar/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/cancelar`, {
        method: "POST",
        cookieValue: token,
        body: { motivo: "Cliente desistiu" },
      }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.status).toBe("cancelada");

    const evento = await prisma.osEvento.findFirst({
      where: { osId: os.id, paraStatus: "cancelada" },
    });
    expect(evento).toMatchObject({ deStatus: "pausada", motivo: "Cliente desistiu" });
  });

  it("OS em_execucao: retorna 409 e não grava novo evento em os_eventos", async () => {
    const mecanico = await criarMecanico();
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });

    const eventosAntes = await prisma.osEvento.count({ where: { osId: os.id } });

    const { POST } = await import("@/app/api/os/[id]/cancelar/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/cancelar`, { method: "POST", cookieValue: token, body: {} }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(409);
    expect(corpo.codigo).toBe("TRANSICAO_INVALIDA");

    const eventosDepois = await prisma.osEvento.count({ where: { osId: os.id } });
    expect(eventosDepois).toBe(eventosAntes);

    const osAtual = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAtual.status).toBe("em_execucao");
  });
});
