import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste de route handler (ver tests/api/fila.test.ts): importar a
// função exportada (GET) diretamente e invocá-la com um NextRequest de
// verdade, lendo o cookie de sessão via `request.cookies.get(...)` +
// `verificarSessao(token)` — não via `lerSessao()` (ver nota em
// app/api/fila/route.ts).
function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) {
    headers.cookie = `${NOME_COOKIE_SESSAO}=${cookieValue}`;
  }
  return new NextRequest(new Request(`http://localhost${path}`, { headers }));
}

const criadas: { tipoIds: string[]; mecanicoIds: string[] } = {
  tipoIds: [],
  mecanicoIds: [],
};

afterEach(async () => {
  if (criadas.mecanicoIds.length) {
    await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = [];
  criadas.mecanicoIds = [];
});

async function criarTipo(opts: { nome?: string; peso?: number; ativo?: boolean } = {}) {
  const tipo = await prisma.tipoServico.create({
    data: {
      nome: opts.nome ?? `Teste tipos-servico-api ${randomUUID()}`,
      peso: opts.peso ?? 50,
      ativo: opts.ativo ?? true,
    },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico() {
  const mecanico = await prisma.mecanico.create({
    data: { nome: "Mecânico Teste Tipos Serviço API", pinHash: "hash" },
  });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

describe("GET /api/tipos-servico", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/tipos-servico/route");
    const response = await GET(buildRequest("/api/tipos-servico"));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it("sessão de balcão: retorna 200 com apenas tipos ativos, no formato {id, nome, peso}", async () => {
    const ativo = await criarTipo({ peso: 70 });
    const inativo = await criarTipo({ ativo: false });

    const { GET } = await import("@/app/api/tipos-servico/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/tipos-servico", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(corpo)).toBe(true);

    const linha = corpo.find((l: { id: string }) => l.id === ativo.id);
    expect(linha).toMatchObject({ id: ativo.id, nome: ativo.nome, peso: ativo.peso });
    expect(Object.keys(linha).sort()).toEqual(["id", "nome", "peso"]);

    expect(corpo.find((l: { id: string }) => l.id === inativo.id)).toBeUndefined();
  });

  it("sessão de mecânico: também retorna 200 (qualquer perfil autenticado pode ver)", async () => {
    const mecanico = await criarMecanico();

    const { GET } = await import("@/app/api/tipos-servico/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/tipos-servico", token));

    expect(response.status).toBe(200);
  });
});
