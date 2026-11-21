import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

// Formato de cada linha de GET /api/tipos-servico (ver
// app/api/tipos-servico/route.ts, Task 20): usado para popular o <select>
// de tipo_servico do formulário de nova OS.
export interface TipoServicoLinha {
  id: string;
  nome: string;
  peso: number;
}

// Sem polling: tipos de serviço raramente mudam durante uma sessão do
// balcão, diferente de useFila/useOsPorStatus (que seguem a constraint
// global de polling de 5s para dados que mudam o tempo todo).
export function useTiposServico() {
  return useQuery({
    queryKey: ["tipos-servico"],
    queryFn: () => apiFetch<TipoServicoLinha[]>("/api/tipos-servico"),
  });
}
