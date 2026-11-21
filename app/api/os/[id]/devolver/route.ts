import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { devolverOs, TransicaoInvalidaError } from "@/lib/os-service";

// POST /api/os/:id/devolver — única rota desta task que não é exclusiva de
// um único perfil: tanto o mecânico dono da OS quanto o balcão podem
// devolver uma OS `pausada` à fila. A identidade do chamador repassada a
// `devolverOs` (ver lib/os-service.ts) é `sessao.mecanicoId` para um
// mecânico ou o literal `"balcao"` para o balcão — `devolverOs` decide com
// base nesse valor se exige `AND mecanico_id = $2` no UPDATE condicional.
// Qualquer outro perfil (não deveria existir hoje, mas por via das dúvidas)
// recebe 403. Mismatch de posse (mecânico tentando devolver OS de outro)
// surge como o mesmo 409 de `TransicaoInvalidaError`, sem gravar evento.
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

  const chamador = sessao.perfil === "balcao" ? "balcao" : sessao.mecanicoId;

  const { id } = await params;

  try {
    const os = await devolverOs(id, chamador);
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
