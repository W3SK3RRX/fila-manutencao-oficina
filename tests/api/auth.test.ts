import { describe, it, expect, afterAll } from "vitest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste para route handlers do App Router: importar a função
// exportada (POST/GET) diretamente e invocá-la com um Request/NextRequest de
// verdade, em vez de subir um servidor. Isso evita um servidor Next rodando,
// mas tem uma implicação: `next/headers`'s `cookies()` (usada por
// gravarCookieSessao/removerCookieSessao em lib/auth.ts) depende de um
// AsyncLocalStorage de escopo de requisição que só existe quando o próprio
// Next.js invoca o handler através do seu roteamento interno — chamar a
// função exportada diretamente, como fazemos aqui, não cria esse escopo e
// `cookies()` lança "called outside a request scope" (verificado
// empiricamente). Por isso os route handlers desta task leem/escrevem o
// cookie de sessão via `NextResponse.cookies` (que não depende desse
// contexto), e não via gravarCookieSessao/removerCookieSessao.

function getSetCookie(response: Response): string[] {
  // Headers padrão expõe getSetCookie() para múltiplos Set-Cookie; fazemos
  // fallback para get() (um único cookie) caso o runtime não suporte.
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  const valor = response.headers.get("set-cookie");
  return valor ? [valor] : [];
}

const SENHA_BALCAO_CORRETA = process.env.BALCAO_SENHA!;

describe("POST /api/auth/balcao", () => {
  it("senha correta: retorna 200 e grava cookie de sessão", async () => {
    const { POST } = await import("@/app/api/auth/balcao/route");
    const request = new Request("http://localhost/api/auth/balcao", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ senha: SENHA_BALCAO_CORRETA }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    const cookies = getSetCookie(response);
    expect(cookies.some((c) => c.startsWith(`${NOME_COOKIE_SESSAO}=`))).toBe(true);
    expect(cookies.some((c) => /httponly/i.test(c))).toBe(true);
  });

  it("senha errada: retorna 401 com codigo SENHA_INVALIDA", async () => {
    const { POST } = await import("@/app/api/auth/balcao/route");
    const request = new Request("http://localhost/api/auth/balcao", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ senha: "senha-errada-com-certeza" }),
    });

    const response = await POST(request as never);
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo).toMatchObject({ codigo: "SENHA_INVALIDA" });
    expect(corpo.erro).toBeTruthy();
    expect(getSetCookie(response)).toHaveLength(0);
  });
});

describe("POST /api/auth/mecanico", () => {
  const pin = "1234";
  const mecanicoIds: string[] = [];

  afterAll(async () => {
    if (mecanicoIds.length) {
      await prisma.mecanico.deleteMany({ where: { id: { in: mecanicoIds } } });
    }
  });

  it("PIN correto: retorna 200 e grava cookie de sessão", async () => {
    const pinHash = await bcrypt.hash(pin, 10);
    const mecanico = await prisma.mecanico.create({
      data: { nome: `Mecanico Teste PIN OK ${randomUUID()}`, pinHash },
    });
    mecanicoIds.push(mecanico.id);

    const { POST } = await import("@/app/api/auth/mecanico/route");
    const request = new Request("http://localhost/api/auth/mecanico", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mecanicoId: mecanico.id, pin }),
    });

    const response = await POST(request as never);

    expect(response.status).toBe(200);
    const cookies = getSetCookie(response);
    expect(cookies.some((c) => c.startsWith(`${NOME_COOKIE_SESSAO}=`))).toBe(true);
  });

  it("PIN errado: retorna 401 com codigo PIN_INVALIDO", async () => {
    const pinHash = await bcrypt.hash(pin, 10);
    const mecanico = await prisma.mecanico.create({
      data: { nome: `Mecanico Teste PIN Errado ${randomUUID()}`, pinHash },
    });
    mecanicoIds.push(mecanico.id);

    const { POST } = await import("@/app/api/auth/mecanico/route");
    const request = new Request("http://localhost/api/auth/mecanico", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mecanicoId: mecanico.id, pin: "0000" }),
    });

    const response = await POST(request as never);
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo).toMatchObject({ codigo: "PIN_INVALIDO" });
    expect(corpo.erro).toBeTruthy();
  });

  it("bloqueio: a 6ª tentativa errada na janela de 10min retorna 429, mesmo com o PIN correto", async () => {
    const pinHash = await bcrypt.hash(pin, 10);
    const mecanico = await prisma.mecanico.create({
      data: { nome: `Mecanico Teste Bloqueio ${randomUUID()}`, pinHash },
    });
    mecanicoIds.push(mecanico.id);

    const { POST } = await import("@/app/api/auth/mecanico/route");
    const tentar = async (pinTentado: string) => {
      const request = new Request("http://localhost/api/auth/mecanico", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mecanicoId: mecanico.id, pin: pinTentado }),
      });
      return POST(request as never);
    };

    // 5 tentativas erradas: todas devolvem 401 PIN_INVALIDO (nenhuma bloqueada ainda).
    for (let i = 0; i < 5; i++) {
      const resposta = await tentar("0000");
      expect(resposta.status).toBe(401);
      const corpo = await resposta.json();
      expect(corpo.codigo).toBe("PIN_INVALIDO");
    }

    // 6ª tentativa, agora com o PIN CORRETO: deve ser recusada por bloqueio.
    const sexta = await tentar(pin);
    const corpoSexta = await sexta.json();

    expect(sexta.status).toBe(429);
    expect(corpoSexta).toMatchObject({ codigo: "BLOQUEADO_TEMPORARIAMENTE" });
    expect(corpoSexta.erro).toBeTruthy();
    expect(getSetCookie(sexta)).toHaveLength(0);
  });
});

describe("POST /api/auth/logout", () => {
  it("retorna 204 e remove o cookie de sessão", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");

    const response = await POST();

    expect(response.status).toBe(204);
    const cookies = getSetCookie(response);
    expect(cookies.some((c) => c.startsWith(`${NOME_COOKIE_SESSAO}=`))).toBe(true);
    expect(cookies.some((c) => /max-age=0/i.test(c) || /expires=/i.test(c))).toBe(true);
  });
});

describe("GET /api/mecanicos", () => {
  const mecanicoIds: string[] = [];

  afterAll(async () => {
    if (mecanicoIds.length) {
      await prisma.mecanico.deleteMany({ where: { id: { in: mecanicoIds } } });
    }
  });

  it("retorna apenas mecânicos ativos, com id e nome, sem pinHash", async () => {
    const ativo = await prisma.mecanico.create({
      data: { nome: `Mecanico Ativo Teste ${randomUUID()}`, pinHash: "hash-irrelevante", ativo: true },
    });
    const inativo = await prisma.mecanico.create({
      data: { nome: `Mecanico Inativo Teste ${randomUUID()}`, pinHash: "hash-irrelevante", ativo: false },
    });
    mecanicoIds.push(ativo.id, inativo.id);

    const { GET } = await import("@/app/api/mecanicos/route");
    const response = await GET();
    const corpo = await response.json();

    expect(response.status).toBe(200);
    expect(Array.isArray(corpo)).toBe(true);

    const idsRetornados = corpo.map((m: { id: string }) => m.id);
    expect(idsRetornados).toContain(ativo.id);
    expect(idsRetornados).not.toContain(inativo.id);

    const registroAtivo = corpo.find((m: { id: string }) => m.id === ativo.id);
    expect(registroAtivo).toMatchObject({ id: ativo.id, nome: ativo.nome });
    expect(registroAtivo).not.toHaveProperty("pinHash");
    expect(registroAtivo).not.toHaveProperty("pin_hash");
  });
});
