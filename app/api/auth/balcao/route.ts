import { NextResponse } from "next/server";
import { loginBalcaoSchema } from "@/lib/schemas";
import { assinarSessaoBalcao, NOME_COOKIE_SESSAO, DURACAO_SESSAO_BALCAO_SEGUNDOS } from "@/lib/auth";
import { reservarTentativa, desfazerTentativa } from "@/lib/pin-lockout";

// I5 (revisão final de branch): diferente da rota de PIN do mecânico
// (app/api/auth/mecanico/route.ts), esta rota não tinha nenhum limite de
// tentativas — uma senha curta (BALCAO_SENHA, ex.: 4 dígitos) exposta num
// domínio público podia ser força-bruteada em minutos. Reaproveita
// lib/pin-lockout.ts (mesmo reserve/undo síncrono que fecha a corrida TOCTOU
// documentada lá) em vez de duplicar a lógica de bloqueio. Só existe uma
// senha de balcão (não por usuário), então uma identidade constante é
// suficiente como chave — o Map de pin-lockout.ts já é por-chave, então isso
// não interfere no bloqueio por mecanicoId usado pela outra rota.
const IDENTIDADE_BALCAO = "balcao";

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

  const idDaReserva = reservarTentativa(IDENTIDADE_BALCAO);
  if (idDaReserva === null) {
    return NextResponse.json(
      {
        erro: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        codigo: "BLOQUEADO_TEMPORARIAMENTE",
      },
      { status: 429 },
    );
  }

  if (dados.data.senha !== process.env.BALCAO_SENHA) {
    return NextResponse.json({ erro: "Senha inválida", codigo: "SENHA_INVALIDA" }, { status: 401 });
  }

  // Senha correta: desfaz a reserva para não contar um login válido como
  // tentativa falha (mesmo padrão de app/api/auth/mecanico/route.ts).
  desfazerTentativa(IDENTIDADE_BALCAO, idDaReserva);

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
