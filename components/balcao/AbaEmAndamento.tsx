"use client";

import { useOsPorStatus } from "@/hooks/useOs";
import { Badge } from "@/components/ui/badge";

// Aba "Em andamento" do painel do balcão (Task 21): lista OS com status
// 'em_execucao' ou 'pausada' (ver app/api/os/route.ts), já incluindo
// `mecanicoNome` (join) e `motivoPausa` (coluna nativa, só relevante para
// linhas pausadas). Nenhum fluxo de mecânico foi construído ainda nesta
// fase do plano, então em um ambiente novo esta aba normalmente aparece
// vazia — isso é esperado, não um erro.
export function AbaEmAndamento() {
  const { data, isLoading, isError } = useOsPorStatus("em_andamento");

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar as OS em andamento. Tente novamente em instantes.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Nenhuma OS em andamento no momento.
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
            <th className="px-2 py-2 font-medium">Status</th>
            <th className="px-2 py-2 font-medium">Motivo da pausa</th>
          </tr>
        </thead>
        <tbody>
          {data.map((os) => {
            const status = os.status as string;
            const pausada = status === "pausada";
            return (
              <tr key={os.id} className="border-b border-border/60 text-sm">
                <td className="px-2 py-2 tabular-nums">{os.numero as number}</td>
                <td className="px-2 py-2 font-medium">{os.placa as string}</td>
                <td className="px-2 py-2">{os.modeloMoto as string}</td>
                <td className="px-2 py-2">{(os.mecanicoNome as string | null) ?? "—"}</td>
                <td className="px-2 py-2">
                  <Badge variant={pausada ? "secondary" : "default"}>
                    {pausada ? "Pausada" : "Em execução"}
                  </Badge>
                </td>
                <td className="px-2 py-2">
                  {pausada ? ((os.motivoPausa as string | null) ?? "—") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
