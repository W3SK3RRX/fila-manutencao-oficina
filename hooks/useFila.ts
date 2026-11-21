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

// Polling fixo de Fase 1 (constraint global): refetchInterval de 5s e
// refetch em foco/reconexão, sem nenhum state manager além do TanStack
// Query.
export function useFila() {
  return useQuery({
    queryKey: ["fila"],
    queryFn: () => apiFetch<FilaLinha[]>("/api/fila"),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
