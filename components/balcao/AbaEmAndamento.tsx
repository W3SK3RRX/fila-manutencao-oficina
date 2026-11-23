"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOsPorStatus, type OsLinha } from "@/hooks/useOs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogoCancelarOs } from "@/components/balcao/DialogoCancelarOs";
import { ComentariosOs } from "@/components/os/ComentariosOs";
import { apiFetch, ApiError } from "@/lib/api-client";

// Aba "Em andamento" do painel do balcão (Task 21): lista OS com status
// 'em_execucao' ou 'pausada' (ver app/api/os/route.ts), já incluindo
// `mecanicoNome` (join) e `motivoPausa` (coluna nativa, só relevante para
// linhas pausadas). Nenhum fluxo de mecânico foi construído ainda nesta
// fase do plano, então em um ambiente novo esta aba normalmente aparece
// vazia — isso é esperado, não um erro.
//
// Coluna "Ações" (Task 22): devolver/cancelar, exibidos SOMENTE para linhas
// 'pausada'. Uma linha 'em_execucao' não recebe nenhum botão aqui —
// `devolverOs` (lib/os-service.ts) só aceita OS 'pausada' como origem, e não
// há ação de balcão definida para uma OS em execução nesta task.
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
            <th className="px-2 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {data.map((os) => (
            <LinhaEmAndamento key={os.id} os={os} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface LinhaEmAndamentoProps {
  os: OsLinha;
}

// Linha expansível da tabela "Em andamento" (Task 9): clicar na linha mostra
// a thread de comentários da OS (ComentariosOs, somente leitura — o balcão
// não escreve comentários, ver Global Constraints do plano), mesmo padrão de
// expand/recolhe de LinhaOsExpandivel (aba Fila). A célula "Ações" mantém
// `onClick={stopPropagation}` pelo mesmo motivo: sem isso, clicar em
// Devolver/Cancelar também alternaria a linha.
function LinhaEmAndamento({ os }: LinhaEmAndamentoProps) {
  const [aberta, setAberta] = useState(false);

  const status = os.status;
  const pausada = status === "pausada";

  return (
    <>
      <tr
        onClick={() => setAberta((valor) => !valor)}
        aria-expanded={aberta}
        className="cursor-pointer border-b border-border/60 text-sm transition-colors hover:bg-muted/50"
      >
        <td className="px-2 py-2 tabular-nums">{os.numero as number}</td>
        <td className="px-2 py-2 font-medium">{os.placa as string}</td>
        <td className="px-2 py-2">{os.modeloMoto as string}</td>
        <td className="px-2 py-2">{(os.mecanicoNome as string | null) ?? "—"}</td>
        <td className="px-2 py-2">
          <Badge variant={pausada ? "warning" : "default"}>
            {pausada ? "Pausada" : "Em execução"}
          </Badge>
        </td>
        <td className="px-2 py-2">
          {pausada ? ((os.motivoPausa as string | null) ?? "—") : "—"}
        </td>
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          {pausada ? (
            <div className="flex gap-2">
              <BotaoDevolverOs id={os.id} />
              <DialogoCancelarOs os={{ id: os.id, placa: os.placa as string }} />
            </div>
          ) : (
            "—"
          )}
        </td>
      </tr>
      {aberta && (
        <tr className="border-b border-border/60 bg-muted/30 text-sm">
          <td colSpan={7} className="px-4 py-3">
            <ComentariosOs osId={os.id} podeComentar={false} />
          </td>
        </tr>
      )}
    </>
  );
}

interface BotaoDevolverOsProps {
  id: string;
}

// Botão "Devolver" de uma OS 'pausada' (Task 22): devolve a OS à fila via
// POST /api/os/:id/devolver (balcão pode devolver qualquer OS pausada em
// nome do mecânico, ver nota em app/api/os/[id]/devolver/route.ts — sem
// restrição de posse). Diferente do cancelamento, o brief não pede
// confirmação aqui, então o clique dispara a chamada direto. Em sucesso:
// invalida ["fila"] (a OS volta a aparecer lá) e ["os","em_andamento"] (a
// linha some daqui). Em 409 (`TRANSICAO_INVALIDA` — a OS não está mais
// 'pausada', ex.: o mecânico já retomou): mostra "A OS mudou de estado,
// atualize a tela." inline abaixo do botão.
function BotaoDevolverOs({ id }: BotaoDevolverOsProps) {
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function devolver() {
    setEnviando(true);
    setErro(null);
    try {
      await apiFetch(`/api/os/${id}/devolver`, { method: "POST" });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fila"] }),
        queryClient.invalidateQueries({ queryKey: ["os", "em_andamento"] }),
      ]);
    } catch (e) {
      if (e instanceof ApiError && e.codigo === "TRANSICAO_INVALIDA") {
        setErro("A OS mudou de estado, atualize a tela.");
        return;
      }
      setErro("Não foi possível devolver a OS. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button variant="outline" size="sm" disabled={enviando} onClick={devolver}>
        Devolver
      </Button>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
