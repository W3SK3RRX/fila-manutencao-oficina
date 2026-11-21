import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Janela de "conectado": sob saúde normal, useFila/useMinhasOs fazem poll a
// cada 5s (refetchInterval fixo de Fase 1), então 15s dá uma folga de ~2
// polls perdidos antes de acender o indicador de desconexão.
const JANELA_CONECTADO_MS = 15000;

// Intervalo de recomputação: precisa ser mais curto que a janela acima para
// que a transição true -> false aconteça mesmo sem nenhum evento novo no
// cache (ex.: rede caiu de vez e nenhum poll mais termina com sucesso).
const INTERVALO_VERIFICACAO_MS = 1000;

export interface Conexao {
  conectado: boolean;
}

// Hook puramente client-side (sem rota própria): observa o cache do
// QueryClient já usado pelos hooks de polling da aplicação e expõe
// `conectado: true` enquanto alguma query do app tiver tido sucesso há
// menos de 15s. Não assume nenhum hook específico — escuta o cache inteiro
// via `queryCache.subscribe`, então qualquer query ativa (atual ou futura)
// mantém o indicador vivo.
export function useConexao(): Conexao {
  const queryClient = useQueryClient();
  const ultimoSucessoRef = useRef<number | null>(null);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    function recalcular() {
      const ultimoSucesso = ultimoSucessoRef.current;
      const agoraConectado =
        ultimoSucesso !== null && Date.now() - ultimoSucesso < JANELA_CONECTADO_MS;
      setConectado(agoraConectado);
    }

    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((evento) => {
      if (evento.type === "updated" && evento.action.type === "success") {
        ultimoSucessoRef.current = Date.now();
        recalcular();
      }
    });

    const intervalo = setInterval(recalcular, INTERVALO_VERIFICACAO_MS);

    return () => {
      unsubscribe();
      clearInterval(intervalo);
    };
  }, [queryClient]);

  return { conectado };
}
