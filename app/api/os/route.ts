import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { linhaParaCamelCase } from "@/lib/api-utils";

// GET /api/os?status=em_andamento|concluidas_hoje — rota exclusiva do
// balcão (lista de acompanhamento de OS em andamento/concluídas hoje, usada
// na tela de balcão). Mecânico autenticado recebe 403; sem sessão, 401.
//
// Ver nota em app/api/fila/route.ts sobre por que lemos o cookie via
// `request.cookies.get` + `verificarSessao` em vez de `lerSessao()`.
const STATUS_VALIDOS = ["em_andamento", "concluidas_hoje"] as const;
type StatusConsulta = (typeof STATUS_VALIDOS)[number];

function ehStatusValido(valor: string | null): valor is StatusConsulta {
  return valor !== null && (STATUS_VALIDOS as readonly string[]).includes(valor);
}

export async function GET(request: NextRequest) {
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

  const status = request.nextUrl.searchParams.get("status");
  if (!ehStatusValido(status)) {
    return NextResponse.json(
      { erro: "Parâmetro status inválido ou ausente", codigo: "STATUS_INVALIDO" },
      { status: 400 },
    );
  }

  // Em ambos os casos juntamos `mecanicos` para expor o nome do mecânico
  // responsável (mecanico_nome); `motivo_pausa` já é uma coluna nativa de
  // ordens_servico, não precisa de join.
  const linhas =
    status === "em_andamento"
      ? await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT os.*, m.nome AS mecanico_nome
          FROM ordens_servico os
          LEFT JOIN mecanicos m ON m.id = os.mecanico_id
          WHERE os.status IN ('em_execucao', 'pausada')
          ORDER BY os.criado_em ASC
        `
      : // concluidas_hoje: "hoje" é sempre o calendário local de
        // America/Fortaleza (ver constraint global de fuso horário de
        // exibição), não a data UTC nem o TimeZone padrão da sessão do
        // Postgres. IMPORTANTE: `os.concluido_em::date` (cast direto, sem
        // `AT TIME ZONE`) usaria o TimeZone da sessão do Postgres para
        // truncar — que é Etc/UTC neste ambiente (confirmado via `SHOW
        // TIMEZONE`), não America/Fortaleza. Por isso aplicamos
        // `AT TIME ZONE 'America/Fortaleza'` explicitamente nos DOIS lados
        // da comparação antes do `::date`, não só no lado do `now()`:
        // comparar um lado convertido com o outro cru misturaria data UTC
        // com data local e reintroduziria exatamente o bug que esta regra
        // deveria evitar (ver tests/api/fila.test.ts, teste que teria
        // falhado com o cast direto `os.concluido_em::date`).
        await prisma.$queryRaw<Record<string, unknown>[]>`
          SELECT os.*, m.nome AS mecanico_nome
          FROM ordens_servico os
          LEFT JOIN mecanicos m ON m.id = os.mecanico_id
          WHERE os.status = 'concluida'
            AND (os.concluido_em AT TIME ZONE 'America/Fortaleza')::date
              = (now() AT TIME ZONE 'America/Fortaleza')::date
          ORDER BY os.concluido_em DESC
        `;

  return NextResponse.json(linhas.map((linha) => linhaParaCamelCase(linha)));
}
