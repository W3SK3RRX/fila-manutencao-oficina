import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

function buildRequest(path: string, options: { cookieValue?: string; method?: string; body?: unknown } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (options.cookieValue) headers.cookie = `${NOME_COOKIE_SESSAO}=${options.cookieValue}`;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(new Request(`http://localhost${path}`, {
    method: options.method ?? "GET", headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  }));
}

const criados: string[] = [];
afterEach(async () => {
  if (criados.length) await prisma.mecanico.deleteMany({ where: { id: { in: criados } } });
  criados.length = 0;
});

describe("POST /api/mecanicos", () => {
  it("sem sessão: retorna 401", async () => {
    const { POST } = await import("@/app/api/mecanicos/route");
    const response = await POST(buildRequest("/api/mecanicos", { method: "POST", body: { nome: "Fulano", pin: "1234" } }));
    expect(response.status).toBe(401);
  });

  it("sessão de mecânico: retorna 403 (rota exclusiva do balcão)", async () => {
    const mecanico = await prisma.mecanico.create({ data: { nome: "Existente", pinHash: "hash" } });
    criados.push(mecanico.id);

    const { POST } = await import("@/app/api/mecanicos/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await POST(buildRequest("/api/mecanicos", { method: "POST", cookieValue: token, body: { nome: "Fulano", pin: "1234" } }));
    expect(response.status).toBe(403);
  });

  it("PIN inválido: retorna 400", async () => {
    const { POST } = await import("@/app/api/mecanicos/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(buildRequest("/api/mecanicos", { method: "POST", cookieValue: token, body: { nome: "Fulano", pin: "12" } }));
    expect(response.status).toBe(400);
  });

  it("dados válidos: cria o mecânico, retorna 201 sem pinHash, e o PIN fica hasheado no banco", async () => {
    const { POST } = await import("@/app/api/mecanicos/route");
    const token = await assinarSessaoBalcao();
    const response = await POST(buildRequest("/api/mecanicos", { method: "POST", cookieValue: token, body: { nome: "Novo Mecânico", pin: "5678" } }));
    const corpo = await response.json();

    expect(response.status).toBe(201);
    expect(corpo.nome).toBe("Novo Mecânico");
    expect(corpo.pinHash).toBeUndefined();

    criados.push(corpo.id);
    const noBanco = await prisma.mecanico.findUniqueOrThrow({ where: { id: corpo.id } });
    expect(noBanco.pinHash).not.toBe("5678");
  });
});
