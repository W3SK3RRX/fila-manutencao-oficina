"use client";

import { useResumoBalcao } from "@/hooks/useResumoBalcao";

// Ordem e cores validadas em docs/superpowers/specs/2026-11-22-balcao-home-charts-design.md
// (script de validação de contraste/daltonismo rodado contra a superfície
// escura real deste app, --card: #19191C) — NÃO reordenar: laranja e âmbar
// adjacentes falham a validação em qualquer combinação de luminosidade
// testada; só passam com âmbar no outro extremo da sequência.
const SEGMENTOS = [
  { chave: "naFila", cor: "var(--chart-status-queue)", rotulo: "Na fila" },
  { chave: "emExecucao", cor: "var(--chart-status-running)", rotulo: "Em execução" },
  { chave: "concluidasHoje", cor: "var(--chart-status-done)", rotulo: "Concluídas hoje" },
  { chave: "pausadas", cor: "var(--chart-status-paused)", rotulo: "Pausadas" },
] as const;

export function BarraStatusFila() {
  const { data, isLoading, isError } = useResumoBalcao();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o resumo. Tente novamente em instantes.
      </p>
    );
  }

  const total = SEGMENTOS.reduce((soma, seg) => soma + data[seg.chave], 0);

  if (total === 0) {
    return <div className="h-2 w-full rounded-full bg-muted" title="Nenhuma OS registrada hoje" />;
  }

  return (
    <div className="flex h-2 w-full gap-0.5">
      {SEGMENTOS.filter((seg) => data[seg.chave] > 0).map((seg) => {
        const quantidade = data[seg.chave];
        const porcentagem = Math.round((quantidade / total) * 100);
        return (
          <div
            key={seg.chave}
            className="h-full rounded-full"
            style={{ backgroundColor: seg.cor, flexGrow: quantidade }}
            title={`${seg.rotulo}: ${quantidade} (${porcentagem}%)`}
          />
        );
      })}
    </div>
  );
}
