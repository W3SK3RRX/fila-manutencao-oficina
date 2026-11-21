"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEventosSSE } from "@/hooks/useEventosSSE";

// Monta a assinatura SSE (Task 31) uma única vez por sessão do navegador.
// Precisa ser um componente filho de <QueryClientProvider>, não uma chamada
// de hook direto dentro de Providers: os hooks de um componente rodam no
// contexto estabelecido por seus ANCESTRAIS, não pelo <QueryClientProvider>
// que ele mesmo está prestes a renderizar como saída própria — então
// useQueryClient() chamado direto em Providers não enxergaria o client
// criado logo abaixo. Não renderiza nada (retorna null): existe só para ter
// seu próprio ciclo de vida de hooks dentro da árvore do provider.
function MontadorEventosSSE() {
  useEventosSSE();
  return null;
}

// Client component raiz para o TanStack Query (único state manager do
// front-end — constraint global, sem Redux/Zustand/etc). `useState` com
// inicializador garante uma única instância de QueryClient por sessão do
// navegador, recriada apenas se o componente remontar (padrão recomendado
// pela doc do TanStack Query para App Router, evitando recriar o client a
// cada render).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <MontadorEventosSSE />
      {children}
    </QueryClientProvider>
  );
}
