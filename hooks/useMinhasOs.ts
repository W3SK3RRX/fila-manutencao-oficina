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
  // Adicionado via `include` na rota (ver app/api/mecanico/atual/route.ts):
  // nome legível do tipo de serviço, para exibição direta sem precisar
  // resolver `tipoServicoId` contra GET /api/tipos-servico.
  tipoServico?: { nome: string } | null;
  [chave: string]: unknown;
}

export interface MinhasOsResposta {
  emExecucao: OsMecanico | null;
  pausadas: OsMecanico[];
  // Adicionado em app/api/mecanico/atual/route.ts (I3, revisão final de
  // branch) para alimentar o cabeçalho da tela do mecânico (nome +
  // indicador de conexão, conforme spec) sem precisar de uma rota própria.
  mecanico: { nome: string } | null;
}

// Polling de 60s como rede de segurança (Task 31): a freshness no dia a dia
// vem de hooks/useEventosSSE.ts, que invalida esta query a cada evento SSE.
// refetchOnWindowFocus/refetchOnReconnect continuam true, mesmo motivo
// documentado em hooks/useFila.ts. hooks/useOs.ts (useOsPorStatus) fica fora
// do escopo desta task e continua com refetchInterval de 5s.
export function useMinhasOs() {
  return useQuery({
    queryKey: ["mecanico-atual"],
    queryFn: () => apiFetch<MinhasOsResposta>("/api/mecanico/atual"),
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
