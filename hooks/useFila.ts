import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// Formato de cada linha de GET /api/fila: `vw_fila` já camelCased por
// `linhaParaCamelCase` (ver app/api/fila/route.ts) — todas as colunas de
// ordens_servico mais o breakdown do score (tipoServicoNome, pontosTipo,
// pontosEspera, pontosPrazo, score). Deixamos aberto com index signature
// para não duplicar o shape inteiro de ordens_servico aqui.
export interface FilaLinha {
  id: string;
  tipoServicoNome: string;
  pontosTipo: number;
  pontosEspera: number;
  pontosPrazo: number;
  score: number;
  [chave: string]: unknown;
}

// Polling de 60s como rede de segurança (Task 31): a freshness no dia a dia
// vem de hooks/useEventosSSE.ts, que invalida esta query a cada evento SSE.
// refetchOnWindowFocus/refetchOnReconnect continuam true — uma aba
// adormecida que volta a ter foco, ou uma rede que reconecta, ainda deve
// refazer o fetch na hora em vez de esperar até 60s.
export function useFila() {
  return useQuery({
    queryKey: ["fila"],
    queryFn: () => apiFetch<FilaLinha[]>("/api/fila"),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
