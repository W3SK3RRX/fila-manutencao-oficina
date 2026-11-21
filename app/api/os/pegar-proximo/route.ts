import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { pegarProximo, TransicaoInvalidaError } from "@/lib/os-service";

// POST /api/os/pegar-proximo — rota exclusiva do mecânico: atribui a si
// próprio a próxima OS da fila (`pegarProximo`, ver lib/os-service.ts, que
// delega a escolha à função SQL `pegar_proximo`). 200 + a OS quando há uma
// disponível, 204 quando a fila está vazia (`pegarProximo` retorna `null`).
// Se o mecânico já tiver uma OS `em_execucao` (unique constraint parcial
// `ux_ordens_servico_mecanico_em_execucao`), `pegarProximo` traduz a
// violação para `TransicaoInvalidaError`, traduzido para 409 abaixo.
//
// Ver nota em app/api/fila/route.ts sobre por que lemos o cookie via
// `request.cookies.get` + `verificarSessao` em vez de `lerSessao()`.
export async function POST(request: NextRequest) {
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

  try {
    const os = await pegarProximo(sessao.mecanicoId);
    if (!os) {
      return new NextResponse(null, { status: 204 });
    }
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
