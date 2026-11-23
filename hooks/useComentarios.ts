import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface ComentarioOs {
  id: string;
  autorTipo: string;
  autorNome: string | null;
  texto: string;
  criadoEm: string;
}

export function useComentarios(osId: string | null) {
  return useQuery({
    queryKey: ["comentarios", osId],
    queryFn: () => apiFetch<ComentarioOs[]>(`/api/os/${osId}/comentarios`),
    enabled: Boolean(osId),
  });
}
