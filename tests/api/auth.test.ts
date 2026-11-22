import { describe, it, expect, afterAll, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { NOME_COOKIE_SESSAO } from "@/lib/auth";
import { __resetTentativasParaTestes } from "@/lib/pin-lockout";

// Mesma identidade usada internamente por app/api/auth/balcao/route.ts (I5,
// revisão final de branch, com a correção de segurança pós-fix-wave de
// bloqueio por IP do cliente) — precisa bater exatamente para o reset de
// teste (__resetTentativasParaTestes) ter efeito. Requisições de teste sem
// header `x-forwarded-for` (como as deste arquivo, por padrão) caem no
// bucket "desconhecido".
const IDENTIDADE_BALCAO_IP_PADRAO = "balcao:ip:desconhecido";

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
  beforeEach(() => {
    __resetTentativasParaTestes(IDENTIDADE_BALCAO_IP_PADRAO);
  });

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

  // I5 (revisão final de branch): diferente da rota de PIN do mecânico, esta
  // rota não tinha nenhum limite de tentativas — uma senha curta exposta num
  // domínio público podia ser força-bruteada. Mesma garantia de
  // tests/lib/pin-lockout.test.ts e do bloco "bloqueio" de
  // POST /api/auth/mecanico abaixo, mas por IP do cliente (ver correção de
  // segurança pós-fix-wave logo abaixo — a identidade não é mais constante).
  it("bloqueio: a 6ª tentativa errada do mesmo IP na janela de 10min retorna 429, mesmo com a senha correta", async () => {
    const { POST } = await import("@/app/api/auth/balcao/route");
    const tentar = async (senha: string, ip = "203.0.113.1") => {
      const request = new Request("http://localhost/api/auth/balcao", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ senha }),
      });
      return POST(request as never);
    };

    for (let i = 0; i < 5; i++) {
      const resposta = await tentar("senha-errada-com-certeza");
      expect(resposta.status).toBe(401);
      const corpo = await resposta.json();
      expect(corpo.codigo).toBe("SENHA_INVALIDA");
    }

    const sexta = await tentar(SENHA_BALCAO_CORRETA);
    const corpoSexta = await sexta.json();

    expect(sexta.status).toBe(429);
    expect(corpoSexta).toMatchObject({ codigo: "BLOQUEADO_TEMPORARIAMENTE" });
    expect(corpoSexta.erro).toBeTruthy();
    expect(getSetCookie(sexta)).toHaveLength(0);

    __resetTentativasParaTestes("balcao:ip:203.0.113.1");
  });

  // CORREÇÃO DE SEGURANÇA pós-fix-wave (apontada por review automatizado):
  // a primeira versão deste fix usava uma identidade CONSTANTE para toda
  // tentativa, então qualquer um na internet podia mandar 5 senhas erradas
  // de QUALQUER IP e travar o balcão de verdade pela janela inteira — um DoS
  // trivial e não autenticado, pior que o buraco original (força bruta sem
  // limite). Este teste prova que um atacante de um IP não consegue mais
  // bloquear o balcão de verdade conectando de outro IP.
  it("um IP bloqueado não impede outro IP de logar normalmente (sem DoS cruzado)", async () => {
    const { POST } = await import("@/app/api/auth/balcao/route");
    const tentar = async (senha: string, ip: string) => {
      const request = new Request("http://localhost/api/auth/balcao", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ senha }),
      });
      return POST(request as never);
    };

    const ipAtacante = "198.51.100.66";
    const ipBalcaoReal = "203.0.113.200";

    // Atacante esgota as 5 tentativas do próprio IP.
    for (let i = 0; i < 5; i++) {
      const resposta = await tentar("senha-errada-com-certeza", ipAtacante);
      expect(resposta.status).toBe(401);
    }
    // 6ª tentativa do atacante: bloqueada (seu próprio IP).
    const tentativaAtacanteBloqueada = await tentar(SENHA_BALCAO_CORRETA, ipAtacante);
    expect(tentativaAtacanteBloqueada.status).toBe(429);

    // O balcão de verdade, de outro IP, continua conseguindo logar
    // normalmente — o IP do atacante não contaminou nenhum outro bucket.
    const loginReal = await tentar(SENHA_BALCAO_CORRETA, ipBalcaoReal);
    expect(loginReal.status).toBe(200);
    expect(getSetCookie(loginReal).some((c) => c.startsWith(`${NOME_COOKIE_SESSAO}=`))).toBe(true);

    __resetTentativasParaTestes(`balcao:ip:${ipAtacante}`);
    __resetTentativasParaTestes(`balcao:ip:${ipBalcaoReal}`);
  });

  // CORREÇÃO DE SEGURANÇA pós-fix-wave, 2ª rodada (apontada por review
  // automatizado): uma versão anterior deste fix tinha, ADEMAIS do bloqueio
  // por IP acima, um bucket GLOBAL de "defesa em profundidade" com um teto
  // mais alto — mas um bucket que recusa com 429 mesmo quando a senha está
  // CORRETA é a mesma classe de DoS do bug original, só que exigindo um
  // atacante distribuído por mais IPs em vez de um único. Esse bucket foi
  // removido por completo (ver app/api/auth/balcao/route.ts). Este teste
  // prova que mesmo um ataque distribuído por muitos IPs (nenhum deles
  // individualmente bloqueado) nunca impede uma senha CORRETA de um IP
  // qualquer, inclusive um nunca visto antes, de autenticar — não existe
  // mais nenhum caminho nesta rota em que uma credencial correta seja
  // recusada por causa de tentativas de terceiros.
  it("força bruta distribuída por muitos IPs não bloqueia uma senha correta de nenhum IP (sem disjuntor global)", async () => {
    const { POST } = await import("@/app/api/auth/balcao/route");
    const tentar = async (senha: string, ip: string) => {
      const request = new Request("http://localhost/api/auth/balcao", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: JSON.stringify({ senha }),
      });
      return POST(request as never);
    };

    const ipsUsados: string[] = [];
    // 50 IPs distintos, 1 tentativa errada cada — bem abaixo do limite
    // por-IP (5) em todos, simulando um ataque distribuído que o bloqueio
    // por IP sozinho não detectaria (de propósito: é exatamente o cenário
    // em que um disjuntor global teria disparado na versão anterior).
    for (let i = 0; i < 50; i++) {
      const ip = `198.51.100.${i}`;
      ipsUsados.push(ip);
      const resposta = await tentar("senha-errada-com-certeza", ip);
      expect(resposta.status).toBe(401);
    }

    // Um IP totalmente novo, nunca visto antes, com a senha CORRETA: deve
    // sempre autenticar com sucesso, independente de quantas tentativas
    // erradas vieram de outros IPs.
    const ipNovo = "198.51.100.254";
    const respostaFinal = await tentar(SENHA_BALCAO_CORRETA, ipNovo);

    expect(respostaFinal.status).toBe(200);
    expect(
      getSetCookie(respostaFinal).some((c) => c.startsWith(`${NOME_COOKIE_SESSAO}=`)),
    ).toBe(true);

    for (const ip of ipsUsados) {
      __resetTentativasParaTestes(`balcao:ip:${ip}`);
    }
    __resetTentativasParaTestes(`balcao:ip:${ipNovo}`);
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

  it("mecânico inativo: PIN correto retorna 401 PIN_INVALIDO (mesmo tratamento de 'não encontrado')", async () => {
    const pinHash = await bcrypt.hash(pin, 10);
    const mecanico = await prisma.mecanico.create({
      data: { nome: `Mecanico Teste Inativo ${randomUUID()}`, pinHash, ativo: false },
    });
    mecanicoIds.push(mecanico.id);

    const { POST } = await import("@/app/api/auth/mecanico/route");
    const request = new Request("http://localhost/api/auth/mecanico", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mecanicoId: mecanico.id, pin }),
    });

    const response = await POST(request as never);
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo).toMatchObject({ codigo: "PIN_INVALIDO" });
    expect(corpo.erro).toBeTruthy();
    expect(getSetCookie(response)).toHaveLength(0);
  });

  it("bloqueio concorrente: uma rajada de tentativas erradas simultâneas bloqueia mesmo o PIN correto em seguida", async () => {
    const pinHash = await bcrypt.hash(pin, 10);
    const mecanico = await prisma.mecanico.create({
      data: { nome: `Mecanico Teste Bloqueio Concorrente ${randomUUID()}`, pinHash },
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

    // 10 tentativas erradas disparadas concorrentemente (Promise.all): se a
    // reserva da tentativa não for síncrona/atômica antes do bcrypt/DB, uma
    // rajada como esta poderia deixar mais de 5 tentativas "passarem" pela
    // checagem de bloqueio antes de qualquer uma ser registrada.
    const respostas = await Promise.all(Array.from({ length: 10 }, () => tentar("0000")));
    for (const resposta of respostas) {
      expect([401, 429]).toContain(resposta.status);
    }

    // Prova indireta de que o bloqueio já engatou a partir da rajada
    // concorrente (não apenas de tentativas sequenciais): mesmo com o PIN
    // CORRETO logo em seguida, a resposta deve ser 429 BLOQUEADO_TEMPORARIAMENTE.
    const seguinte = await tentar(pin);
    const corpoSeguinte = await seguinte.json();

    expect(seguinte.status).toBe(429);
    expect(corpoSeguinte).toMatchObject({ codigo: "BLOQUEADO_TEMPORARIAMENTE" });
    expect(corpoSeguinte.erro).toBeTruthy();
    expect(getSetCookie(seguinte)).toHaveLength(0);
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
