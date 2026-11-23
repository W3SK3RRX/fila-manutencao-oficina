import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linhaParaCamelCase } from "@/lib/api-utils";

// GET /api/mecanico/realizadas — rota exclusiva do mecânico autenticado;
// lista as OS que ELE concluiu hoje, usando a mesma regra de fuso horário
// de "hoje" que app/api/os/route.ts usa para `concluidas_hoje` (ver
// comentário lá: `AT TIME ZONE 'America/Fortaleza'` nos dois lados antes do
// `::date`, nunca um cast direto que cairia no TimeZone UTC da sessão).
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

  const linhas = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT os.*, ts.nome AS tipo_servico_nome
    FROM ordens_servico os
    JOIN tipos_servico ts ON ts.id = os.tipo_servico_id
    WHERE os.status = 'concluida'
      AND os.mecanico_id = ${sessao.mecanicoId}::uuid
      AND (os.concluido_em AT TIME ZONE 'America/Fortaleza')::date
        = (now() AT TIME ZONE 'America/Fortaleza')::date
    ORDER BY os.concluido_em DESC
  `;

  return NextResponse.json(linhas.map((linha) => linhaParaCamelCase(linha)));
}
