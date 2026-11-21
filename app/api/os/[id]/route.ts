import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { osEditSchema } from "@/lib/schemas";
import { editarOs, TransicaoInvalidaError } from "@/lib/os-service";

// PATCH /api/os/:id — edita os dados de uma OS. Só é permitido enquanto a OS
// está 'na_fila' (ver lib/os-service.ts); fora disso, `editarOs` lança
// `TransicaoInvalidaError`, traduzido para 409 abaixo. Rota exclusiva do
// balcão: mesma checagem de sessão/perfil das demais rotas de /api/os.
//
// Ver nota em app/api/fila/route.ts sobre por que lemos o cookie via
// `request.cookies.get` + `verificarSessao` em vez de `lerSessao()`.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  if (sessao.perfil !== "balcao") {
    return NextResponse.json(
      { erro: "Acesso restrito ao balcão", codigo: "PERFIL_NAO_AUTORIZADO" },
      { status: 403 },
    );
  }

  const corpo = await request.json().catch(() => null);
  const dados = osEditSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      { erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const os = await editarOs(id, dados.data);
    return NextResponse.json(os);
  } catch (err) {
    if (err instanceof TransicaoInvalidaError) {
      return NextResponse.json(
        { erro: err.message, codigo: "TRANSICAO_INVALIDA" },
        { status: 409 },
      );
    }
    throw err;
  }
}
