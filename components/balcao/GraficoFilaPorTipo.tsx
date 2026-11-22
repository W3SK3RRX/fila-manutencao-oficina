"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useFila } from "@/hooks/useFila";
import { useTiposServico } from "@/hooks/useTiposServico";
import { agruparFilaPorTipo } from "@/lib/fila-por-tipo";

export function GraficoFilaPorTipo() {
  const { data: fila, isLoading: carregandoFila, isError: erroFila } = useFila();
  const { data: tipos, isLoading: carregandoTipos, isError: erroTipos } = useTiposServico();

  if (carregandoFila || carregandoTipos) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (erroFila || erroTipos || !fila || !tipos) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar a fila por tipo. Tente novamente em instantes.
      </p>
    );
  }

  const dados = agruparFilaPorTipo(fila, tipos);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="tipo"
          width={170}
          tick={{ fill: "var(--foreground)", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "var(--popover-foreground)" }}
          itemStyle={{ color: "var(--popover-foreground)" }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="quantidade" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
