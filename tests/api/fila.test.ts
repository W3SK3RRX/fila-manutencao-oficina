import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste de route handler (ver tests/api/auth.test.ts e
// tests/proxy.test.ts): importar a função exportada (GET) diretamente e
// invocá-la com um NextRequest de verdade. As três rotas desta task recebem
// `request: NextRequest` e leem o cookie de sessão via
// `request.cookies.get(...)` + `verificarSessao(token)` — não via
// `lerSessao()` de lib/auth.ts, que depende do AsyncLocalStorage de
// `next/headers`'s `cookies()` e lança "called outside a request scope"
// quando o handler é invocado diretamente (verificado empiricamente, mesma
// razão documentada em tests/api/auth.test.ts para os handlers de login). O
// mesmo padrão de proxy.ts (`request.cookies.get` + `verificarSessao`) é
// reaproveitado aqui.
function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) {
    headers.cookie = `${NOME_COOKIE_SESSAO}=${cookieValue}`;
  }
  return new NextRequest(new Request(`http://localhost${path}`, { headers }));
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
    data: { nome: `Teste fila-api ${randomUUID()}`, peso },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico(nome = "Mecânico Teste Fila API") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

async function criarOsDireta(
  tipoId: string,
  status: "na_fila" | "em_execucao" | "pausada" | "concluida",
  opts: { mecanicoId?: string; motivoPausa?: string } = {},
) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste fila-api",
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

describe("GET /api/fila", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/fila/route");
    const response = await GET(buildRequest("/api/fila"));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 200 com o breakdown do score da vw_fila", async () => {
    const tipo = await criarTipo(70);
    const os = await criarOsDireta(tipo.id, "na_fila");

    const { GET } = await import("@/app/api/fila/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/fila", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(corpo)).toBe(true);
    const linha = corpo.find((l: { id: string }) => l.id === os.id);
    expect(linha).toBeTruthy();
    expect(linha).toMatchObject({
      id: os.id,
      tipoServicoNome: tipo.nome,
      pontosTipo: tipo.peso,
    });
    expect(typeof linha.pontosEspera).toBe("number");
    expect(typeof linha.pontosPrazo).toBe("number");
    expect(typeof linha.score).toBe("number");
    expect(linha.score).toBe(tipo.peso + linha.pontosEspera + linha.pontosPrazo);
    // Garante o mapeamento para camelCase (não deve sobrar nenhuma chave snake_case).
    expect(Object.keys(linha).some((k) => k.includes("_"))).toBe(false);
  });

  it("sessão de mecânico: também retorna 200 (qualquer perfil autenticado pode ver a fila)", async () => {
    const mecanico = await criarMecanico();

    const { GET } = await import("@/app/api/fila/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/fila", token));

    expect(response.status).toBe(200);
  });

  it("não inclui OS que não estão na_fila", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "concluida");

    const { GET } = await import("@/app/api/fila/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/fila", token));
    const corpo = await response.json();

    expect(corpo.find((l: { id: string }) => l.id === os.id)).toBeUndefined();
  });
});

describe("GET /api/os", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/os/route");
    const response = await GET(buildRequest("/api/os?status=em_andamento"));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de mecânico: retorna 403 (rota exclusiva do balcão)", async () => {
    const mecanico = await criarMecanico();

    const { GET } = await import("@/app/api/os/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/os?status=em_andamento", token));
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão sem status (ou status inválido): retorna 400", async () => {
    const { GET } = await import("@/app/api/os/route");
    const token = await assinarSessaoBalcao();

    const semStatus = await GET(buildRequest("/api/os", token));
    expect(semStatus.status).toBe(400);

    const statusInvalido = await GET(buildRequest("/api/os?status=qualquer_coisa", token));
    expect(statusInvalido.status).toBe(400);
  });

  it("status=em_andamento: retorna OS em_execucao e pausada, com nome do mecânico e motivo_pausa", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico("Fulano da Silva");
    const emExecucao = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });
    const pausada = await criarOsDireta(tipo.id, "pausada", {
      mecanicoId: mecanico.id,
      motivoPausa: "aguardando_peca",
    });
    const naFila = await criarOsDireta(tipo.id, "na_fila");

    const { GET } = await import("@/app/api/os/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/os?status=em_andamento", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    const ids = corpo.map((l: { id: string }) => l.id);
    expect(ids).toContain(emExecucao.id);
    expect(ids).toContain(pausada.id);
    expect(ids).not.toContain(naFila.id);

    const linhaPausada = corpo.find((l: { id: string }) => l.id === pausada.id);
    expect(linhaPausada).toMatchObject({
      mecanicoNome: mecanico.nome,
      motivoPausa: "aguardando_peca",
    });
  });

  it("status=concluidas_hoje: usa a data local America/Fortaleza, não a data UTC nem a do servidor", async () => {
    const tipo = await criarTipo();
    const osHojeFortaleza = await criarOsDireta(tipo.id, "concluida");
    const osOntemFortaleza = await criarOsDireta(tipo.id, "concluida");
    const osEmExecucao = await criarOsDireta(tipo.id, "em_execucao");

    // 23:30 no calendário de "hoje" em America/Fortaleza (UTC-3, sem horário
    // de verão) corresponde a 02:30 UTC do dia SEGUINTE — ou seja, a data em
    // UTC já é "amanhã" enquanto a data local ainda é "hoje". Se o filtro da
    // rota comparasse `concluido_em::date` sem converter para
    // 'America/Fortaleza' (usando UTC, ou o TimeZone padrão da sessão do
    // Postgres, que é Etc/UTC neste ambiente — confirmado via `SHOW
    // TIMEZONE`), esta linha cairia fora de "hoje" e o teste falharia.
    await prisma.$executeRaw`
      UPDATE ordens_servico
      SET concluido_em = (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '23 hours 30 minutes') AT TIME ZONE 'America/Fortaleza'
      WHERE id = ${osHojeFortaleza.id}::uuid
    `;
    // Controle negativo: 23:30 no calendário de "ontem" em America/Fortaleza
    // — claramente fora da janela de "hoje" em qualquer interpretação de
    // fuso horário razoável.
    await prisma.$executeRaw`
      UPDATE ordens_servico
      SET concluido_em = (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '23 hours 30 minutes' - interval '1 day') AT TIME ZONE 'America/Fortaleza'
      WHERE id = ${osOntemFortaleza.id}::uuid
    `;

    const { GET } = await import("@/app/api/os/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/os?status=concluidas_hoje", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    const ids = corpo.map((l: { id: string }) => l.id);
    expect(ids).toContain(osHojeFortaleza.id);
    expect(ids).not.toContain(osOntemFortaleza.id);
    expect(ids).not.toContain(osEmExecucao.id);
  });
});

describe("GET /api/mecanico/atual", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/mecanico/atual/route");
    const response = await GET(buildRequest("/api/mecanico/atual"));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 403 (rota exclusiva do mecânico)", async () => {
    const { GET } = await import("@/app/api/mecanico/atual/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/mecanico/atual", token));
    const corpo = await response.json();

    expect(response.status).toBe(403);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de mecânico: retorna sua OS em_execucao e todas as suas OS pausadas", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const outroMecanico = await criarMecanico("Outro Mecânico");

    const emExecucao = await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: mecanico.id });
    const pausada1 = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });
    const pausada2 = await criarOsDireta(tipo.id, "pausada", { mecanicoId: mecanico.id });
    // De outro mecânico: não deve aparecer.
    await criarOsDireta(tipo.id, "em_execucao", { mecanicoId: outroMecanico.id });

    const { GET } = await import("@/app/api/mecanico/atual/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/mecanico/atual", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.emExecucao).toMatchObject({ id: emExecucao.id });
    const idsPausadas = corpo.pausadas.map((os: { id: string }) => os.id);
    expect(idsPausadas.sort()).toEqual([pausada1.id, pausada2.id].sort());
    // I3 (revisão final de branch): nome do mecânico logado, para o
    // cabeçalho da tela do mecânico.
    expect(corpo.mecanico).toMatchObject({ nome: mecanico.nome });
  });

  it("sessão de mecânico sem OS em_execucao: emExecucao é null", async () => {
    const mecanico = await criarMecanico();

    const { GET } = await import("@/app/api/mecanico/atual/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/mecanico/atual", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.emExecucao).toBeNull();
    expect(corpo.pausadas).toEqual([]);
    expect(corpo.mecanico).toMatchObject({ nome: mecanico.nome });
  });
});
