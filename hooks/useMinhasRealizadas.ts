import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface OsRealizada {
  id: string;
  numero: number;
  placa: string;
  modeloMoto: string;
  tipoServicoNome: string;
  concluidoEm: string;
  [chave: string]: unknown;
}

export function useMinhasRealizadas() {
  return useQuery({
    queryKey: ["mecanico-realizadas"],
    queryFn: () => apiFetch<OsRealizada[]>("/api/mecanico/realizadas"),
    refetchOnWindowFocus: true,
  });
}
