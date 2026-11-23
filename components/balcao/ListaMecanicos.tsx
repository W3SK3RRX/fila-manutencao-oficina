"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

interface Mecanico {
  id: string;
  nome: string;
}

// Lista de mecânicos cadastrados (Task 10), mesma query key e fetch de
// SeletorMecanico (["mecanicos"], GET /api/mecanicos) — a invalidação feita
// por FormularioNovoMecanico ao cadastrar atualiza as duas telas.
export function ListaMecanicos() {
  const { data: mecanicos, isLoading, isError } = useQuery({
    queryKey: ["mecanicos"],
    queryFn: () => apiFetch<Mecanico[]>("/api/mecanicos"),
  });

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar os mecânicos. Tente novamente em instantes.
      </p>
    );
  }

  if (!mecanicos || mecanicos.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nenhum mecânico cadastrado.</p>;
  }

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {mecanicos.map((mecanico) => (
        <li key={mecanico.id} className="rounded-md bg-secondary px-3 py-2 font-medium">
          {mecanico.nome}
        </li>
      ))}
    </ul>
  );
}
