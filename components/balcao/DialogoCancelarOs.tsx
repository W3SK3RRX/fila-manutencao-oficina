"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface OsParaCancelar {
  id: string;
  placa: string;
}

export interface DialogoCancelarOsProps {
  os: OsParaCancelar;
}

// Diálogo de cancelamento de uma OS (Task 22), usado tanto por AbaFila
// (linhas 'na_fila') quanto por AbaEmAndamento (linhas 'pausada') — ambos os
// status que `cancelarOs` (lib/os-service.ts) aceita. Motivo é um texto
// livre opcional (POST /api/os/:id/cancelar não valida esse campo com um
// schema zod dedicado, ver nota em app/api/os/[id]/cancelar/route.ts); o
// próprio shadcn `AlertDialog` já serve como a confirmação pedida pelo
// brief antes de enviar — não há uma segunda confirmação em cima dele.
//
// Em sucesso: fecha o diálogo e invalida ["fila"] e ["os","em_andamento"]
// (a OS cancelada pode ter vindo de qualquer um dos dois status cobertos
// por essas queries; "concluidas_hoje" nunca é afetado por um cancelamento,
// já que uma OS concluída não pode mais ser cancelada). Em 409
// (`TRANSICAO_INVALIDA` — a OS não está mais em um status cancelável,
// ex.: um mecânico a pegou entre o carregamento da tela e o clique):
// mostra "A OS mudou de estado, atualize a tela." inline dentro do próprio
// diálogo, sem lib de toast instalada (mesmo padrão de
// FormularioNovaOs/Task 20).
export function DialogoCancelarOs({ os }: DialogoCancelarOsProps) {
  const queryClient = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  function aoMudarAberto(valor: boolean) {
    setAberto(valor);
    if (valor) {
      setMotivo("");
      setErroEnvio(null);
    }
  }

  async function confirmarCancelamento() {
    setEnviando(true);
    setErroEnvio(null);
    try {
      await apiFetch(`/api/os/${os.id}/cancelar`, {
        method: "POST",
        body: JSON.stringify(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["fila"] }),
        queryClient.invalidateQueries({ queryKey: ["os", "em_andamento"] }),
      ]);
      setAberto(false);
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setErroEnvio("A OS mudou de estado, atualize a tela.");
        return;
      }
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível cancelar a OS. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível cancelar a OS. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAberto}>
      <AlertDialogTrigger
        render={
          <Button
            variant="destructive"
            size="sm"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        Cancelar
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar OS — {os.placa}</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação não pode ser desfeita. A OS sairá da fila/acompanhamento e será marcada
            como cancelada.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cancelar-motivo">Motivo (opcional)</Label>
          <Textarea
            id="cancelar-motivo"
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>

        {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Voltar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={enviando}
            onClick={confirmarCancelamento}
          >
            Confirmar cancelamento
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
