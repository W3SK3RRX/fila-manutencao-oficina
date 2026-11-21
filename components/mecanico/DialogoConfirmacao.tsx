"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DialogoConfirmacaoProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  titulo: string;
  descricao: string;
  rotuloConfirmar: string;
  // Ação a executar quando o mecânico confirma (ex.: POST /api/os/:id/concluir
  // ou /devolver + as invalidações de query específicas de cada ação) — este
  // componente não sabe qual rota chamar nem o que invalidar, só trata
  // enviando/erro/fechamento em torno dela.
  aoConfirmar: () => Promise<void>;
}

// Diálogo de confirmação genérico da tela do mecânico (Task 26), reusado por
// Concluir (CardPrincipal, controlado pelo botão Concluir do card) e por
// Devolver à fila (SecaoMinhasPausadas, um por linha pausada). Sempre
// totalmente controlado via `open`/`onOpenChange` — sem trigger próprio —
// porque em ambos os usos o botão que abre o diálogo já existe fora deste
// componente.
//
// Em sucesso: fecha o diálogo (quem chama já cuidou de invalidar as queries
// certas dentro de `aoConfirmar`). Em 409 (`TRANSICAO_INVALIDA` — a OS mudou
// de estado entre o carregamento da tela e a confirmação): mostra erro
// inline, mesmo padrão sem lib de toast já usado por
// DialogoCancelarOs/DialogoEditarOs/BotaoPegarProximo.
export function DialogoConfirmacao({
  open,
  onOpenChange,
  titulo,
  descricao,
  rotuloConfirmar,
  aoConfirmar,
}: DialogoConfirmacaoProps) {
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  function aoMudarAberto(valor: boolean) {
    onOpenChange(valor);
    if (valor) {
      setErroEnvio(null);
    }
  }

  async function confirmar() {
    setEnviando(true);
    setErroEnvio(null);
    try {
      await aoConfirmar();
      onOpenChange(false);
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setErroEnvio("A OS mudou de estado, atualize a tela.");
        return;
      }
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível concluir a ação. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível concluir a ação. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={aoMudarAberto}>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>

        {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando} className="min-h-12 text-base">
            Voltar
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando}
            onClick={confirmar}
            className="min-h-12 text-base"
          >
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
