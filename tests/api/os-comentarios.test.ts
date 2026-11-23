import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

function buildRequest(
  path: string,
  options: { cookieValue?: string; method?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {};
  if (options.cookieValue) headers.cookie = `${NOME_COOKIE_SESSAO}=${options.cookieValue}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(
    new Request(`http://localhost${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }),
  );
}

const criadas: { tipoIds: string[]; mecanicoIds: string[]; osIds: string[] } = {
  tipoIds: [], mecanicoIds: [], osIds: [],
};

afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osComentario.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.mecanicoIds.length) {
    await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = []; criadas.mecanicoIds = []; criadas.osIds = [];
});

async function criarTipo() {
  const tipo = await prisma.tipoServico.create({ data: { nome: `Teste comentarios ${randomUUID()}`, peso: 50 } });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico(nome = "Mecânico Teste Comentários") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

async function criarOsDireta(tipoId: string, mecanicoId?: string) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste comentarios",
      tipoServicoId: tipoId,
      status: "em_execucao",
      mecanicoId: mecanicoId ?? null,
      iniciadoEm: new Date(),
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

describe("GET /api/os/[id]/comentarios", () => {
  it("sem sessão: retorna 401", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id);
    const { GET } = await import("@/app/api/os/[id]/comentarios/route");
    const response = await GET(buildRequest(`/api/os/${os.id}/comentarios`), { params: Promise.resolve({ id: os.id }) });
    expect(response.status).toBe(401);
  });

  it("OS inexistente: retorna 404", async () => {
    const { GET } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(
      buildRequest(`/api/os/${randomUUID()}/comentarios`, { cookieValue: token }),
      { params: Promise.resolve({ id: randomUUID() }) },
    );
    expect(response.status).toBe(404);
  });

  it("mecânico dono: retorna 200 com os comentários em ordem cronológica", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, mecanico.id);
    await prisma.osComentario.create({ data: { osId: os.id, autorTipo: "mecanico", autorNome: mecanico.nome, texto: "Primeiro" } });
    await prisma.osComentario.create({ data: { osId: os.id, autorTipo: "mecanico", autorNome: mecanico.nome, texto: "Segundo" } });

    const { GET } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest(`/api/os/${os.id}/comentarios`, { cookieValue: token }), { params: Promise.resolve({ id: os.id }) });
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(corpo.map((c: { texto: string }) => c.texto)).toEqual(["Primeiro", "Segundo"]);
  });

  it("mecânico que não é dono: retorna 403", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Dono A");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, donoA.id);

    const { GET } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await GET(buildRequest(`/api/os/${os.id}/comentarios`, { cookieValue: token }), { params: Promise.resolve({ id: os.id }) });
    expect(response.status).toBe(403);
  });

  it("balcão: retorna 200 independente de qual mecânico é dono", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, mecanico.id);

    const { GET } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest(`/api/os/${os.id}/comentarios`, { cookieValue: token }), { params: Promise.resolve({ id: os.id }) });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/os/[id]/comentarios", () => {
  it("sessão de balcão: retorna 403 (só mecânico escreve)", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, mecanico.id);

    const { POST } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(
      buildRequest(`/api/os/${os.id}/comentarios`, { method: "POST", cookieValue: token, body: { texto: "oi" } }),
      { params: Promise.resolve({ id: os.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("texto vazio: retorna 400", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, mecanico.id);

    const { POST } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/comentarios`, { method: "POST", cookieValue: token, body: { texto: "" } }),
      { params: Promise.resolve({ id: os.id }) },
    );
    expect(response.status).toBe(400);
  });

  it("mecânico dono: cria o comentário e retorna 201 com autorNome preenchido", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico("Fulano de Tal");
    const os = await criarOsDireta(tipo.id, mecanico.id);

    const { POST } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/comentarios`, { method: "POST", cookieValue: token, body: { texto: "Aguardando peça X" } }),
      { params: Promise.resolve({ id: os.id }) },
    );
    const corpo = await response.json();

    expect(response.status).toBe(201);
    expect(corpo.texto).toBe("Aguardando peça X");
    expect(corpo.autorTipo).toBe("mecanico");
    expect(corpo.autorNome).toBe("Fulano de Tal");
  });

  it("mecânico que não é dono: retorna 403 e não cria linha", async () => {
    const tipo = await criarTipo();
    const donoA = await criarMecanico("Dono A");
    const mecanicoB = await criarMecanico("Mecânico B");
    const os = await criarOsDireta(tipo.id, donoA.id);

    const { POST } = await import("@/app/api/os/[id]/comentarios/route");
    const token = await assinarSessaoMecanico(mecanicoB.id);
    const response = await POST(
      buildRequest(`/api/os/${os.id}/comentarios`, { method: "POST", cookieValue: token, body: { texto: "oi" } }),
      { params: Promise.resolve({ id: os.id }) },
    );
    expect(response.status).toBe(403);

    const count = await prisma.osComentario.count({ where: { osId: os.id } });
    expect(count).toBe(0);
  });
});
