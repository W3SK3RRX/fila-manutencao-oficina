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

  return (
    <div className="flex flex-col gap-3">
      {total === 0 ? (
        <div className="h-2 w-full rounded-full" style={{ backgroundColor: "var(--input)" }} />
      ) : (
        // Revisão final de branch (feat/balcao-home-charts, achado Important):
        // todos os 4 segmentos ficam no DOM mesmo com quantidade 0 — nunca
        // filtramos os de contagem 0. Um segmento a 0 ocupa largura ~0 (via
        // flexGrow), mas o `gap-0.5` do container ainda insere espaço antes e
        // depois dele. Isso garante que laranja ("em execução") e âmbar
        // ("pausadas") nunca ficam encostados, mesmo quando "concluídas hoje"
        // (o segmento entre eles na ordem validada) está zerado — o estado
        // mais comum de uma manhã, antes da primeira OS ser concluída.
        <div className="flex h-2 w-full gap-0.5">
          {SEGMENTOS.map((seg) => {
            const quantidade = data[seg.chave];
            return (
              <div
                key={seg.chave}
                data-testid="segmento-status"
                className="h-full rounded-full"
                style={{ backgroundColor: seg.cor, flexGrow: quantidade }}
              />
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {SEGMENTOS.map((seg) => {
          const quantidade = data[seg.chave];
          const porcentagem = total > 0 ? Math.round((quantidade / total) * 100) : 0;
          return (
            <span key={seg.chave} className="flex items-center gap-1.5">
              <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: seg.cor }} />
              {seg.rotulo}:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {quantidade}
                {total > 0 ? ` (${porcentagem}%)` : ""}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
