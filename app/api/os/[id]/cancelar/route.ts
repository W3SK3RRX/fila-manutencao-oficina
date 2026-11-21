import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { cancelarOs, TransicaoInvalidaError } from "@/lib/os-service";

// POST /api/os/:id/cancelar — cancela uma OS. Só é permitido enquanto a OS
// está 'na_fila' ou 'pausada' (ver lib/os-service.ts); fora disso (p. ex.
// 'em_execucao', 'concluida' ou já 'cancelada'), `cancelarOs` lança
// `TransicaoInvalidaError`, traduzido para 409 abaixo, sem gravar nenhum
// novo evento em os_eventos. Rota exclusiva do balcão: mesma checagem de
// sessão/perfil das demais rotas de /api/os.
//
// Ver nota em app/api/fila/route.ts sobre por que lemos o cookie via
// `request.cookies.get` + `verificarSessao` em vez de `lerSessao()`.
export async function POST(
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

  // Corpo é opcional: `{}`, ausente ou `{ motivo }`. Diferente de
  // POST /api/os e PATCH /api/os/:id, não há schema zod dedicado em
  // lib/schemas.ts para este corpo (motivo é um texto livre opcional, sem
  // regras de validação a aplicar) — extraímos o campo manualmente.
  const corpo = await request.json().catch(() => null);
  const motivo =
    corpo && typeof corpo === "object" && typeof (corpo as Record<string, unknown>).motivo === "string"
      ? ((corpo as Record<string, unknown>).motivo as string)
      : undefined;

  const { id } = await params;

  try {
    const os = await cancelarOs(id, motivo);
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
