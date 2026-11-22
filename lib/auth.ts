import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, timingSafeEqual } from "node:crypto";

// JWT de sessão (jose + HS256), guardado em cookie httpOnly. Sem NextAuth.
// Dois perfis possíveis: balcão (sessão curta, sem identificação de usuário)
// e mecânico (sessão longa, identificada por mecanicoId).

export const NOME_COOKIE_SESSAO = "sessao";

// Comparação em tempo constante para segredos compartilhados comparados
// diretamente em texto puro (hoje só BALCAO_SENHA — PINs de mecânico já são
// comparados via `bcrypt.compare`, que é constant-time por construção).
// Revisão final de branch (I5, rodada de correção de segurança apontada por
// review automatizado, Task 12 já tinha isso como gap de baixa prioridade):
// `dados.data.senha !== process.env.BALCAO_SENHA` compara strings
// JavaScript que fazem short-circuit no primeiro caractere diferente —
// teoricamente permite um ataque de timing para descobrir a senha
// caractere a caractere. `crypto.timingSafeEqual` exige buffers do MESMO
// TAMANHO ou lança — em vez de preencher as strings originais (complexidade
// extra e ainda vaza o tamanho pelo preenchimento), fazemos hash SHA-256 de
// cada lado primeiro: o digest tem sempre 32 bytes fixos independente do
// tamanho da entrada, então nunca lança, e a comparação dos digests em
// tempo constante não vaza nada sobre onde as strings originais divergem.
export function compararComTempoConstante(a: string, b: string): boolean {
  const hashA = createHash("sha256").update(a, "utf8").digest();
  const hashB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(hashA, hashB);
}

// Exportadas para que route handlers que gravem o cookie diretamente via
// NextResponse.cookies (em vez de gravarCookieSessao) usem o mesmo maxAge.
export const DURACAO_SESSAO_BALCAO_SEGUNDOS = 60 * 60 * 12; // 12h
export const DURACAO_SESSAO_MECANICO_SEGUNDOS = 60 * 60 * 24 * 30; // 30d

export type SessaoBalcao = { perfil: "balcao" };
export type SessaoMecanico = { perfil: "mecanico"; mecanicoId: string };

function obterSegredo(): Uint8Array {
  const segredo = process.env.JWT_SECRET;
  if (!segredo) {
    throw new Error("JWT_SECRET não definido");
  }
  return new TextEncoder().encode(segredo);
}

async function assinarSessao(
  payload: SessaoBalcao | SessaoMecanico,
  duracaoSegundos: number,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + duracaoSegundos)
    .sign(obterSegredo());
}

export async function assinarSessaoBalcao(): Promise<string> {
  return assinarSessao({ perfil: "balcao" }, DURACAO_SESSAO_BALCAO_SEGUNDOS);
}

export async function assinarSessaoMecanico(mecanicoId: string): Promise<string> {
  return assinarSessao(
    { perfil: "mecanico", mecanicoId },
    DURACAO_SESSAO_MECANICO_SEGUNDOS,
  );
}

function ehSessaoValida(payload: unknown): payload is SessaoBalcao | SessaoMecanico {
  if (typeof payload !== "object" || payload === null || !("perfil" in payload)) {
    return false;
  }

  const registro = payload as Record<string, unknown>;

  if (registro.perfil === "balcao") {
    return true;
  }

  if (registro.perfil === "mecanico") {
    return typeof registro.mecanicoId === "string";
  }

  return false;
}

export async function verificarSessao(
  token: string,
): Promise<SessaoBalcao | SessaoMecanico | null> {
  try {
    const { payload } = await jwtVerify(token, obterSegredo(), {
      algorithms: ["HS256"],
    });

    if (!ehSessaoValida(payload)) {
      return null;
    }

    if (payload.perfil === "balcao") {
      return { perfil: "balcao" };
    }

    return { perfil: "mecanico", mecanicoId: payload.mecanicoId };
  } catch {
    return null;
  }
}

export async function gravarCookieSessao(
  token: string,
  maxAgeSeconds: number,
): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: maxAgeSeconds,
    path: "/",
  });
}

export async function lerSessao(): Promise<SessaoBalcao | SessaoMecanico | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(NOME_COOKIE_SESSAO)?.value;

  if (!token) {
    return null;
  }

  return verificarSessao(token);
}

export async function removerCookieSessao(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(NOME_COOKIE_SESSAO);
}
