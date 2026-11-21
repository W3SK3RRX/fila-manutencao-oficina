"use client";

import { useOsPorStatus } from "@/hooks/useOs";
import { formatarDataHora } from "@/lib/format";

// Aba "Concluídas hoje" do painel do balcão (Task 21): lista OS com status
// 'concluida' cujo concluido_em cai no calendário de hoje em
// America/Fortaleza (filtro de timezone já aplicado no servidor, ver
// app/api/os/route.ts — não refazemos esse filtro aqui). `concluidoEm` é
// exibido com `formatarDataHora`, que usa Intl.DateTimeFormat com
// timeZone: "America/Fortaleza" explícito.
export function AbaConcluidasHoje() {
  const { data, isLoading, isError } = useOsPorStatus("concluidas_hoje");

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar as OS concluídas hoje. Tente novamente em instantes.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhuma OS concluída hoje ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-2 font-medium">Número</th>
            <th className="px-2 py-2 font-medium">Placa</th>
            <th className="px-2 py-2 font-medium">Modelo</th>
            <th className="px-2 py-2 font-medium">Mecânico</th>
            <th className="px-2 py-2 font-medium">Concluído em</th>
          </tr>
        </thead>
        <tbody>
          {data.map((os) => (
            <tr key={os.id} className="border-b border-border/60 text-sm">
              <td className="px-2 py-2 tabular-nums">{os.numero as number}</td>
              <td className="px-2 py-2 font-medium">{os.placa as string}</td>
              <td className="px-2 py-2">{os.modeloMoto as string}</td>
              <td className="px-2 py-2">{(os.mecanicoNome as string | null) ?? "—"}</td>
              <td className="px-2 py-2 tabular-nums">
                {formatarDataHora(os.concluidoEm as string | null)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
