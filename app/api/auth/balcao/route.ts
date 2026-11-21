import { NextResponse } from "next/server";
import { loginBalcaoSchema } from "@/lib/schemas";
import { assinarSessaoBalcao, NOME_COOKIE_SESSAO, DURACAO_SESSAO_BALCAO_SEGUNDOS } from "@/lib/auth";

// Nota sobre cookies: este handler grava o cookie de sessão via
// `NextResponse.cookies` em vez de `gravarCookieSessao` (lib/auth.ts), que
// usa `next/headers`'s `cookies()`. Essa função exige um AsyncLocalStorage de
// escopo de requisição que só existe quando o próprio Next.js invoca o route
// handler através do seu roteamento interno; chamar a função exportada
// diretamente (como os testes fazem) não cria esse escopo e `cookies()`
// lança "called outside a request scope". `NextResponse.cookies` não depende
// desse contexto e funciona de forma idêntica em testes e em produção.
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = loginBalcaoSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" }, { status: 400 });
  }

  if (dados.data.senha !== process.env.BALCAO_SENHA) {
    return NextResponse.json({ erro: "Senha inválida", codigo: "SENHA_INVALIDA" }, { status: 401 });
  }

  const token = await assinarSessaoBalcao();
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DURACAO_SESSAO_BALCAO_SEGUNDOS,
    path: "/",
  });
  return resposta;
}
