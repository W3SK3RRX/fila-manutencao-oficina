import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { concluirOs, TransicaoInvalidaError } from "@/lib/os-service";

// POST /api/os/:id/concluir — rota exclusiva do mecânico dono da OS. Só é
// permitido concluir uma OS `em_execucao` pertencente ao mecânico
// autenticado (ver lib/os-service.ts: `AND mecanico_id = $2` no UPDATE
// condicional). Fora disso (OS de outro mecânico, ou em qualquer outro
// status), `concluirOs` lança `TransicaoInvalidaError`, traduzido para 409
// abaixo, sem gravar nenhum evento. Não há checagem de posse em TypeScript
// aqui: o isolamento entre mecânicos é garantido pela SQL de
// lib/os-service.ts.
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

  if (sessao.perfil !== "mecanico") {
    return NextResponse.json(
      { erro: "Acesso restrito ao mecânico", codigo: "PERFIL_NAO_AUTORIZADO" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const os = await concluirOs(id, sessao.mecanicoId);
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
