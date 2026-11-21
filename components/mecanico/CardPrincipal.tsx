"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMinhasOs } from "@/hooks/useMinhasOs";
import { useFila } from "@/hooks/useFila";
import { formatarTempoEspera } from "@/lib/format";
import { BotaoPegarProximo } from "@/components/mecanico/BotaoPegarProximo";

// Card principal da tela do mecânico (app/mecanico/page.tsx, Task 25):
// - Se useMinhasOs() tiver uma OS `em_execucao` (no máximo uma, por causa da
//   unique constraint parcial `ux_ordens_servico_mecanico_em_execucao`):
//   mostra número, placa, modelo, tipo, descrição e tempo decorrido desde
//   `iniciadoEm`, com os botões Pausar e Concluir.
// - Senão: delega para BotaoPegarProximo (botão de largura total + preview
//   do topo da fila).
//
// Os botões Pausar/Concluir aqui são apenas visuais (sem `onClick` real): a
// Task 26 (ainda não construída) é dona do diálogo de Pausar (3 motivos +
// "outro") e do diálogo de confirmação genérico reusado por Concluir — não
// chamamos POST /api/os/:id/pausar|concluir direto sem essa UI de
// confirmação/motivo.
export function CardPrincipal() {
  const { data, isLoading, isError } = useMinhasOs();
  const { data: fila } = useFila();

  const emExecucao = data?.emExecucao ?? null;
  // Ruling 2 (brief): `iniciado_em` é sempre preenchido para uma OS
  // em_execucao (`pegar_proximo` faz `iniciado_em = COALESCE(iniciado_em,
  // now())` na atribuição) — o tipo gerado pelo Prisma ainda permite null,
  // mas os dados não serão null aqui na prática.
  const iniciadoEm = emExecucao?.iniciadoEm as string | null | undefined;

  // `formatarTempoEspera` é um cálculo puro (não "tickeia" sozinho) — o
  // efeito abaixo só incrementa um contador a cada segundo dentro do
  // callback do `setInterval` (nunca síncrono no corpo do efeito, para não
  // disparar o lint react-hooks/set-state-in-effect) só para forçar o
  // re-render; o valor exibido é recomputado puramente a cada render a
  // partir de `iniciadoEm` + `Date.now()`. Um segundo é granularidade
  // suficiente para um display em minutos/horas.
  const [, forcarRecalculo] = useState(0);

  useEffect(() => {
    if (!iniciadoEm) {
      return;
    }
    const intervalo = setInterval(() => forcarRecalculo((n) => n + 1), 1000);
    return () => clearInterval(intervalo);
  }, [iniciadoEm]);

  const tempoDecorrido = iniciadoEm ? formatarTempoEspera(iniciadoEm) : "";

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar sua OS atual. Tente novamente em instantes.
      </p>
    );
  }

  if (!emExecucao) {
    return <BotaoPegarProximo proximaOs={fila?.[0]} />;
  }

  const numero = emExecucao.numero as number;
  const placa = emExecucao.placa as string;
  const modeloMoto = emExecucao.modeloMoto as string;
  const descricao = emExecucao.descricao as string;
  const tipoServicoNome = emExecucao.tipoServico?.nome ?? "—";

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>OS #{numero}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Placa:</dt>
            <dd className="font-medium">{placa}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Modelo:</dt>
            <dd>{modeloMoto}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Tipo:</dt>
            <dd>{tipoServicoNome}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Descrição:</dt>
            <dd>{descricao}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Tempo decorrido:</dt>
            <dd className="tabular-nums">{tempoDecorrido}</dd>
          </div>
        </dl>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 flex-1 text-base"
            // Task 26 wires this up: diálogo de motivo de pausa (3 opções +
            // "outro").
          >
            Pausar
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1 text-base"
            // Task 26 wires this up: diálogo de confirmação genérico.
          >
            Concluir
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
