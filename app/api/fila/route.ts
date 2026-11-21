import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linhaParaCamelCase } from "@/lib/api-utils";

// GET /api/fila: fila de atendimento (OS com status 'na_fila'), com o
// breakdown do score vindo de `vw_fila` (ver prisma/migrations/*_vw_fila).
// Qualquer perfil autenticado (balcão ou mecânico) pode ver a fila — não há
// checagem de perfil além de "tem sessão válida".
//
// Nota sobre cookies: lemos o cookie de sessão via `request.cookies.get(...)`
// + `verificarSessao(token)` em vez de `lerSessao()` de lib/auth.ts.
// `lerSessao()` depende do AsyncLocalStorage de escopo de requisição de
// `next/headers`'s `cookies()`, que só existe quando o próprio Next.js invoca
// o route handler através do seu roteamento interno; chamar a função
// exportada diretamente (como os testes fazem, seguindo o padrão de
// tests/api/auth.test.ts) não cria esse escopo e `cookies()` lança "called
// outside a request scope" (mesmo problema documentado em
// app/api/auth/balcao/route.ts e resolvido em proxy.ts da mesma forma).
export async function GET(request: NextRequest) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT * FROM vw_fila`;

  return NextResponse.json(linhas.map((linha) => linhaParaCamelCase(linha)));
}
