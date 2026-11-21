import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Backoff com teto para reconexão do EventSource: o EventSource nativo já
// reconecta sozinho em qualquer erro (por padrão a cada ~3s, ou no intervalo
// dado por um campo `retry:` do servidor — não usado por
// app/api/eventos/route.ts/Task 30). Isso cobre uma falha isolada, mas sob
// falha repetida (servidor fora do ar, rede instável) reabriria em loop
// apertado sem limite. Por isso assumimos o controle no `onerror`: fechamos
// a conexão nativa e reabrimos nós mesmos após um delay crescente, dobrando
// a cada tentativa até um teto — sequência simples 1s/2s/4s/8s/16s/30s
// (teto), sem jitter nem outros refinamentos: escopo de protótipo (Marco 6),
// não uma lib de reliability. O contador de falhas zera no próximo `onopen`
// bem-sucedido.
const BACKOFF_INICIAL_MS = 1000;
const BACKOFF_TETO_MS = 30000;

// Abre um único EventSource para GET /api/eventos (SSE da Task 30) e, a cada
// mensagem recebida, invalida as duas queries cujo frescor passa a depender
// de tempo real: a fila do mecânico (["fila"]) e a OS em
// execução/pausadas dele (["mecanico-atual"]). Não inspecionamos o payload
// da mensagem (id/status da OS alterada) — qualquer mudança em
// ordens_servico pode afetar qualquer uma das duas queries, então
// invalidamos ambas incondicionalmente a cada evento, deixando o TanStack
// Query decidir se há alguém inscrito para de fato refazer o fetch.
//
// hooks/useOs.ts (useOsPorStatus, chave ["os", status]) fica de fora de
// propósito — não faz parte do escopo desta task (ver task-31-brief.md) e
// continua só com o polling de 5s.
export function useEventosSSE() {
  const queryClient = useQueryClient();
  const falhasRef = useRef(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const eventSourceRef = useRef<EventSource | undefined>(undefined);
  const ativoRef = useRef(true);

  useEffect(() => {
    ativoRef.current = true;

    function conectar() {
      if (!ativoRef.current) return;

      const eventSource = new EventSource("/api/eventos");
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        falhasRef.current = 0;
      };

      eventSource.onmessage = () => {
        queryClient.invalidateQueries({ queryKey: ["fila"] });
        queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
      };

      eventSource.onerror = () => {
        // onerror dispara tanto para uma falha transitória (que o
        // EventSource nativo já reconectaria sozinho) quanto para o estado
        // CLOSED definitivo. Em ambos os casos fechamos explicitamente e
        // assumimos nós mesmos o reagendamento, para impor o teto de
        // backoff — senão o reconnect nativo correria em paralelo com o
        // nosso, duplicando conexões.
        eventSource.close();
        if (eventSourceRef.current === eventSource) {
          eventSourceRef.current = undefined;
        }
        if (!ativoRef.current) return;

        const tentativa = falhasRef.current;
        falhasRef.current += 1;
        const delay = Math.min(BACKOFF_INICIAL_MS * 2 ** tentativa, BACKOFF_TETO_MS);
        timeoutRef.current = setTimeout(conectar, delay);
      };
    }

    conectar();

    return () => {
      ativoRef.current = false;
      if (timeoutRef.current !== undefined) clearTimeout(timeoutRef.current);
      eventSourceRef.current?.close();
    };
  }, [queryClient]);
}
