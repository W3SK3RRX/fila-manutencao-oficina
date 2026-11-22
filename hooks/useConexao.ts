import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Janela de "conectado": sob saúde normal, useFila/useMinhasOs fazem poll a
// cada 5s (refetchInterval fixo de Fase 1), então 15s dá uma folga de ~2
// polls perdidos antes de acender o indicador de desconexão.
//
// Pós-Task 31 (I1 da revisão final de branch): o polling de Fase 1 saiu de
// 5s para 60s (hooks/useFila.ts, hooks/useMinhasOs.ts), então uma loja
// parada (nenhuma OS mudando de status) não gerava sucesso de query nenhum
// por até 60s — o indicador ficava vermelho ~45 dos 60 segundos mesmo com a
// conexão perfeitamente saudável. A janela continua em 15s, mas agora o
// heartbeat do SSE (hooks/useEventosSSE.ts, a cada 10s — ver
// app/api/eventos/route.ts) também conta como sucesso via
// `registrarSucessoConexao`, então uma conexão saudável e ociosa permanece
// verde o tempo todo (10s < 15s), sem depender do polling de 60s.
const JANELA_CONECTADO_MS = 15000;

// Intervalo de recomputação: precisa ser mais curto que a janela acima para
// que a transição true -> false aconteça mesmo sem nenhum evento novo no
// cache (ex.: rede caiu de vez e nenhum poll mais termina com sucesso).
const INTERVALO_VERIFICACAO_MS = 1000;

// Singleton em escopo de módulo (não um `useRef` por instância do hook):
// `registrarSucessoConexao` precisa ser chamável de fora de qualquer
// componente que use `useConexao` — em particular por
// hooks/useEventosSSE.ts, que não renderiza `useConexao` e roda uma única
// vez por sessão do navegador (ver app/providers.tsx). Como só existe um
// EventSource por sessão, um único timestamp compartilhado é suficiente;
// não precisa de pub/sub, porque `useConexao` já reavalia via
// `setInterval` a cada 1s independente de qualquer notificação.
let ultimoSucesso: number | null = null;

export function registrarSucessoConexao(): void {
  ultimoSucesso = Date.now();
}

// Exportado só para os testes (tests/hooks/useConexao.test.tsx) poderem
// isolar cada `it()` entre si — `ultimoSucesso` é estado de módulo
// compartilhado entre instâncias do hook de propósito (ver comentário
// acima), então persiste entre testes no mesmo arquivo a menos que seja
// resetado explicitamente no `afterEach`. Não deve ser importado fora de
// testes.
export function __resetConexaoParaTestes(): void {
  ultimoSucesso = null;
}

export interface Conexao {
  conectado: boolean;
}

// Hook puramente client-side (sem rota própria): expõe `conectado: true`
// enquanto alguma query do app tiver tido sucesso, ou o SSE tiver dado sinal
// de vida (heartbeat/evento/abertura de conexão via
// `registrarSucessoConexao`), há menos de 15s. Continua escutando o cache
// inteiro do QueryClient via `queryCache.subscribe` (qualquer query ativa,
// atual ou futura, mantém o indicador vivo), além da fonte SSE.
export function useConexao(): Conexao {
  const queryClient = useQueryClient();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    function recalcular() {
      const agoraConectado =
        ultimoSucesso !== null && Date.now() - ultimoSucesso < JANELA_CONECTADO_MS;
      setConectado(agoraConectado);
    }

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((evento) => {
      if (evento.type === "updated" && evento.action.type === "success") {
        registrarSucessoConexao();
        recalcular();
      }
    });

    const intervalo = setInterval(recalcular, INTERVALO_VERIFICACAO_MS);
    recalcular();

    return () => {
      unsubscribe();
      clearInterval(intervalo);
    };
  }, [queryClient]);

  return { conectado };
}
