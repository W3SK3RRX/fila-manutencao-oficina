import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/tipos-servico — lista os tipos de serviço ativos, usada para
// popular o <select> de tipo_servico do formulário de nova OS (balcão).
// Qualquer perfil autenticado pode ver (balcão ou mecânico), igual
// app/api/fila/route.ts — não há checagem de perfil além de "tem sessão
// válida". Rota não prevista na tabela original de API do spec, adicionada
// na Task 20 porque o formulário precisa dela.
//
// Nota sobre cookies: lemos o cookie de sessão via `request.cookies.get(...)`
// + `verificarSessao(token)` em vez de `lerSessao()` de lib/auth.ts — mesmo
// motivo documentado em app/api/fila/route.ts e app/api/os/route.ts.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  const tipos = await prisma.tipoServico.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, peso: true },
    orderBy: { peso: "desc" },
  });

  return NextResponse.json(tipos);
}
