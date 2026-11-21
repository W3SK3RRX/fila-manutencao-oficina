import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { pausarSchema } from "@/lib/schemas";
import { pausarOs, TransicaoInvalidaError } from "@/lib/os-service";

// POST /api/os/:id/pausar — rota exclusiva do mecânico dono da OS. Só é
// permitido pausar uma OS `em_execucao` pertencente ao mecânico autenticado
// (ver lib/os-service.ts: o UPDATE condicional inclui
// `AND mecanico_id = $2`, então uma OS de outro mecânico — ou em qualquer
// outro status — nunca é afetada e `pausarOs` lança `TransicaoInvalidaError`,
// traduzido para 409 abaixo, sem gravar nenhum evento). Não há checagem de
// posse em TypeScript aqui: o isolamento entre mecânicos é garantido pela
// SQL de lib/os-service.ts.
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

  const corpo = await request.json().catch(() => null);
  const dados = pausarSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      { erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" },
      { status: 400 },
    );
  }

  const { id } = await params;

  try {
    const os = await pausarOs(id, sessao.mecanicoId, dados.data.motivo, dados.data.motivoTexto);
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
