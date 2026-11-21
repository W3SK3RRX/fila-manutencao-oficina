import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// Formato de cada OS retornada por GET /api/mecanico/atual: objeto do
// Prisma Client (ordens_servico), já camelCase nativamente — a rota não
// precisa do mapeamento manual de lib/api-utils.ts usado por /api/fila e
// /api/os (que leem via SQL bruto; ver app/api/mecanico/atual/route.ts).
// Mesma política de hooks/useFila.ts e hooks/useOs.ts: index signature em
// vez de importar o tipo gerado do Prisma para dentro do bundle do cliente.
export interface OsMecanico {
  id: string;
  status: string;
  [chave: string]: unknown;
}

export interface MinhasOsResposta {
  emExecucao: OsMecanico | null;
  pausadas: OsMecanico[];
}

// Mesma config de polling fixo de Fase 1 (constraint global) usada por
// useFila/useOsPorStatus: refetchInterval de 5s e refetch em foco/reconexão.
export function useMinhasOs() {
  return useQuery({
    queryKey: ["mecanico-atual"],
    queryFn: () => apiFetch<MinhasOsResposta>("/api/mecanico/atual"),
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
