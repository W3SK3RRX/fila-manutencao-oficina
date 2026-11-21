"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Client component raiz para o TanStack Query (único state manager do
// front-end — constraint global, sem Redux/Zustand/etc). `useState` com
// inicializador garante uma única instância de QueryClient por sessão do
// navegador, recriada apenas se o componente remontar (padrão recomendado
// pela doc do TanStack Query para App Router, evitando recriar o client a
// cada render).
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
