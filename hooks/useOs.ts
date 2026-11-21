import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export type StatusConsultaOs = "em_andamento" | "concluidas_hoje";

// Formato de cada linha de GET /api/os?status=...: ordens_servico
// camelCased, com `mecanicoNome` (join com mecanicos) além das colunas
// nativas como motivoPausa (ver app/api/os/route.ts).
export interface OsLinha {
  id: string;
  status: string;
  mecanicoNome?: string | null;
  [chave: string]: unknown;
}

// Mesma config de polling de useFila (constraint global de Fase 1).
export function useOsPorStatus(status: StatusConsultaOs) {
  return useQuery({
    queryKey: ["os", status],
    queryFn: () => apiFetch<OsLinha[]>(`/api/os?status=${status}`),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
