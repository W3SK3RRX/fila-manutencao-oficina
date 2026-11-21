"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import type { FilaLinha } from "@/hooks/useFila";

interface BotaoPegarProximoProps {
  // Primeira linha de useFila() (topo da fila, já ordenada por score DESC
  // pela própria vw_fila) — usada só como preview; a atribuição em si é
  // decidida no servidor por `pegar_proximo` (Task 17), que pode escolher
  // outra OS se a fila mudar entre o render e o clique.
  proximaOs: FilaLinha | null | undefined;
}

// Botão de largura total da tela principal do mecânico (Task 25), exibido
// quando ele não tem nenhuma OS `em_execucao`. Ao tocar, chama
// POST /api/os/pegar-proximo (Task 17):
// - 200 + OS: atribuição bem-sucedida — invalida ["mecanico-atual"] (o card
//   principal troca para a OS atribuída imediatamente, sem esperar o
//   próximo poll de 5s) e ["fila"] (a OS atribuída saiu da fila).
// - 204 (corpo vazio, `apiFetch` resolve com `undefined`): fila vazia.
// - 409 (`ApiError` com codigo TRANSICAO_INVALIDA): mecânico já tem uma OS
//   em_execucao — invalida ["mecanico-atual"] para que o card principal
//   mostre essa OS existente em vez do botão.
//
// Mensagens de feedback: state local (`mensagem`) renderizado inline, não
// uma lib de toast — mesma escolha deliberada já feita em
// components/balcao/FormularioNovaOs.tsx (sem lib de toast instalada neste
// projeto).
export function BotaoPegarProximo({ proximaOs }: BotaoPegarProximoProps) {
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function aoClicar() {
    setEnviando(true);
    setMensagem(null);
    try {
      const resultado = await apiFetch<unknown>("/api/os/pegar-proximo", {
        method: "POST",
      });

      if (resultado === undefined) {
        // 204: fila vazia.
        setMensagem("Fila vazia no momento.");
        return;
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] }),
        queryClient.invalidateQueries({ queryKey: ["fila"] }),
      ]);
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setMensagem("Você já tem uma OS em execução.");
        await queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
        return;
      }
      setMensagem("Não foi possível pegar a próxima OS. Tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  const numero = proximaOs?.numero as number | undefined;
  const placa = proximaOs?.placa as string | undefined;
  const modeloMoto = proximaOs?.modeloMoto as string | undefined;

  return (
    <div className="flex w-full flex-col gap-3">
      <Button
        type="button"
        disabled={enviando}
        onClick={aoClicar}
        className="min-h-14 w-full text-lg font-medium"
      >
        Pegar próximo
      </Button>

      {proximaOs ? (
        <p className="text-center text-sm text-muted-foreground">
          Próxima: OS #{numero} — {placa} — {modeloMoto} — {proximaOs.tipoServicoNome}
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Nenhuma OS na fila no momento.
        </p>
      )}

      {mensagem && (
        <p role="status" className="text-center text-sm text-destructive">
          {mensagem}
        </p>
      )}
    </div>
  );
}
