"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { useMinhasOs } from "@/hooks/useMinhasOs";
import { useFila } from "@/hooks/useFila";
import { formatarTempoEspera } from "@/lib/format";
import { BotaoPegarProximo } from "@/components/mecanico/BotaoPegarProximo";
import { DialogoPausar } from "@/components/mecanico/DialogoPausar";
import { DialogoConfirmacao } from "@/components/mecanico/DialogoConfirmacao";
import { ComentariosOs } from "@/components/os/ComentariosOs";

// Card principal da tela do mecânico (app/mecanico/page.tsx, Task 25):
// - Se useMinhasOs() tiver uma OS `em_execucao` (no máximo uma, por causa da
//   unique constraint parcial `ux_ordens_servico_mecanico_em_execucao`):
//   mostra número, placa, modelo, tipo, descrição e tempo decorrido desde
//   `iniciadoEm`, com os botões Pausar e Concluir.
// - Senão: delega para BotaoPegarProximo (botão de largura total + preview
//   do topo da fila).
//
// Pausar/Concluir (Task 26) só abrem seus diálogos (`DialogoPausar`/
// `DialogoConfirmacao`, totalmente controlados via `open`/`onOpenChange`) —
// o POST em si (/api/os/:id/pausar|concluir) e a invalidação de
// ["mecanico-atual"] acontecem dentro desses diálogos, nunca direto no
// clique do botão, para garantir o motivo (Pausar) e a confirmação
// (Concluir) exigidos pelo brief.
export function CardPrincipal() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, isFetching: atualizandoMinhasOs } = useMinhasOs();
  const { data: fila, isFetching: atualizandoFila } = useFila();
  const [pausarAberto, setPausarAberto] = useState(false);
  const [concluirAberto, setConcluirAberto] = useState(false);

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
    // I2 (revisão final de branch): desabilita o botão durante um refetch de
    // qualquer uma das duas queries (ex.: `refetchOnWindowFocus` ao voltar
    // do segundo plano) para não deixar "Pegar próximo" clicável com uma
    // prévia de fila potencialmente desatualizada.
    return (
      <BotaoPegarProximo
        proximaOs={fila?.[0]}
        atualizando={atualizandoMinhasOs || atualizandoFila}
      />
    );
  }

  const osId = emExecucao.id;
  const numero = emExecucao.numero as number;
  const placa = emExecucao.placa as string;
  const modeloMoto = emExecucao.modeloMoto as string;
  const descricao = emExecucao.descricao as string;
  const tipoServicoNome = emExecucao.tipoServico?.nome ?? "—";

  async function aoConfirmarConcluir() {
    await apiFetch(`/api/os/${osId}/concluir`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
    await queryClient.invalidateQueries({ queryKey: ["mecanico-realizadas"] });
  }

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
            onClick={() => setPausarAberto(true)}
          >
            Pausar
          </Button>
          <Button
            type="button"
            className="min-h-12 flex-1 text-base"
            onClick={() => setConcluirAberto(true)}
          >
            Concluir
          </Button>
        </div>

        <ComentariosOs osId={osId} podeComentar={true} />
      </CardContent>

      <DialogoPausar osId={osId} open={pausarAberto} onOpenChange={setPausarAberto} />
      <DialogoConfirmacao
        open={concluirAberto}
        onOpenChange={setConcluirAberto}
        titulo={`Concluir OS #${numero}`}
        descricao="A OS será marcada como concluída e sairá do seu painel."
        rotuloConfirmar="Confirmar conclusão"
        aoConfirmar={aoConfirmarConcluir}
      />
    </Card>
  );
}
