import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/mecanico/atual — rota exclusiva do mecânico: devolve a OS que ele
// está executando agora (`em_execucao`, no máximo uma, por causa da unique
// constraint parcial `ux_ordens_servico_mecanico_em_execucao`) e todas as
// suas OS `pausada`. Balcão autenticado recebe 403; sem sessão, 401.
//
// Diferente de /api/fila e /api/os, esta rota não precisa de SQL bruto: as
// condições são um simples filtro por `mecanicoId` + `status` sobre
// `ordens_servico`, totalmente representável pelo client tipado do Prisma —
// que já devolve os campos em camelCase (via `@map` no schema), sem precisar
// do mapeamento manual de lib/api-utils.ts usado nas outras duas rotas.
//
// Ver nota em app/api/fila/route.ts sobre por que lemos o cookie via
// `request.cookies.get` + `verificarSessao` em vez de `lerSessao()`.
export async function GET(request: NextRequest) {
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

  const [emExecucao, pausadas] = await Promise.all([
    prisma.ordemServico.findFirst({
      where: { mecanicoId: sessao.mecanicoId, status: "em_execucao" },
      include: { tipoServico: { select: { nome: true } } },
    }),
    prisma.ordemServico.findMany({
      where: { mecanicoId: sessao.mecanicoId, status: "pausada" },
      orderBy: { criadoEm: "asc" },
      include: { tipoServico: { select: { nome: true } } },
    }),
  ]);

  return NextResponse.json({ emExecucao, pausadas });
}
