"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { TecladoPin } from "@/components/mecanico/TecladoPin";

// Formato de cada item de GET /api/mecanicos (Task 12): só `id` e `nome` dos
// mecânicos ativos — a rota nunca expõe `pinHash`. Esta rota não exige
// sessão (ver app/api/mecanicos/route.ts): tem que ser assim, porque é
// justamente a lista usada para o mecânico se identificar *antes* de ter
// qualquer sessão (fluxo de duas etapas: escolher nome → digitar PIN).
interface Mecanico {
  id: string;
  nome: string;
}

// Fluxo de login do mecânico (Task 23), em duas etapas:
//   1) escolher o próprio nome numa lista de botões grandes;
//   2) digitar o PIN de 4 dígitos no teclado numérico (TecladoPin).
// Nenhum gerenciador de estado além do React local + TanStack Query (mesmo
// padrão de hooks/useFila.ts): não há necessidade de persistir a seleção de
// nome entre reloads, já que trocar de mecânico é só "voltar" para a etapa 1.
export function SeletorMecanico() {
  const [mecanicoSelecionado, setMecanicoSelecionado] = useState<Mecanico | null>(null);

  const { data: mecanicos, isLoading, isError } = useQuery({
    queryKey: ["mecanicos"],
    queryFn: () => apiFetch<Mecanico[]>("/api/mecanicos"),
  });

  if (mecanicoSelecionado) {
    return (
      <TecladoPin
        mecanicoId={mecanicoSelecionado.id}
        mecanicoNome={mecanicoSelecionado.nome}
        onVoltar={() => setMecanicoSelecionado(null)}
      />
    );
  }

  if (isLoading) {
    return <p className="p-4 text-center text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-center text-sm text-destructive">
        Não foi possível carregar a lista de mecânicos. Tente novamente em instantes.
      </p>
    );
  }

  if (!mecanicos || mecanicos.length === 0) {
    return (
      <p className="p-4 text-center text-sm text-muted-foreground">
        Nenhum mecânico cadastrado no momento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-muted-foreground">Quem é você?</p>
      {mecanicos.map((mecanico) => (
        <button
          key={mecanico.id}
          type="button"
          onClick={() => setMecanicoSelecionado(mecanico)}
          className="min-h-14 w-full rounded-lg bg-secondary px-4 text-lg font-medium text-secondary-foreground transition-colors active:bg-muted"
        >
          {mecanico.nome}
        </button>
      ))}
    </div>
  );
}
