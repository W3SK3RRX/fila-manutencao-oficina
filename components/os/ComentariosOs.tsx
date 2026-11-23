"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useComentarios } from "@/hooks/useComentarios";
import { apiFetch, ApiError } from "@/lib/api-client";
import { formatarDataHora } from "@/lib/format";

export interface ComentariosOsProps {
  osId: string;
  podeComentar: boolean;
}

// Thread de comentários de uma OS (Task 7): lida tanto pelo mecânico dono
// (CardPrincipal, podeComentar=true) quanto, somente leitura, pelo balcão
// (AbaEmAndamento, Task 9, podeComentar=false) — a API já restringe quem
// pode postar (app/api/os/:id/comentarios/route.ts), então `podeComentar`
// aqui só controla se o formulário é renderizado.
export function ComentariosOs({ osId, podeComentar }: ComentariosOsProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useComentarios(osId);
  const [texto, setTexto] = useState("");
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar() {
    const textoAparado = texto.trim();
    if (!textoAparado) return;

    setErroEnvio(null);
    setEnviando(true);
    try {
      await apiFetch(`/api/os/${osId}/comentarios`, {
        method: "POST",
        body: JSON.stringify({ texto: textoAparado }),
      });
      await queryClient.invalidateQueries({ queryKey: ["comentarios", osId] });
      setTexto("");
    } catch (erro) {
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível enviar o comentário. Tente novamente.");
      } else {
        setErroEnvio("Não foi possível enviar o comentário. Tente novamente.");
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando comentários...</p>}

      {isError && (
        <p className="p-4 text-sm text-destructive">
          Não foi possível carregar os comentários. Tente novamente em instantes.
        </p>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <p className="p-4 text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="flex flex-col gap-3 text-sm">
          {data.map((comentario) => (
            <li key={comentario.id} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{comentario.autorNome ?? "Balcão"}</span>
                <span>{formatarDataHora(comentario.criadoEm)}</span>
              </div>
              <p>{comentario.texto}</p>
            </li>
          ))}
        </ul>
      )}

      {podeComentar && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={3}
            placeholder="Adicionar comentário..."
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
          {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}
          <Button
            type="button"
            disabled={!texto.trim() || enviando}
            onClick={aoEnviar}
            className="self-end"
          >
            Comentar
          </Button>
        </div>
      )}
    </div>
  );
}
