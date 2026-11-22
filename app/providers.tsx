"use client";

import { useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { useEventosSSE } from "@/hooks/useEventosSSE";
import { ApiError } from "@/lib/api-client";

// I3 (revisão final de branch): nenhuma query/mutação tratava um 401 de
// sessão expirada/ausente de forma diferente de qualquer outro erro — o
// usuário ficava preso numa tela cheia de erros genéricos sem nenhum caminho
// de volta para o login (agravado pelo C1: antes do fix do service worker, a
// casca da página autenticada nem chegava a sumir do cache). Só o código
// NAO_AUTENTICADO (ausência/expiração de sessão — ver lib/auth.ts e todo
// route handler autenticado) dispara o redirecionamento: os códigos de
// login recusado (SENHA_INVALIDA, PIN_INVALIDO, BLOQUEADO_TEMPORARIAMENTE)
// também respondem 401, mas são erros que os próprios formulários de login
// já tratam inline — redirecionar nesses casos criaria um loop (o próprio
// POST de login "falhando" dispararia uma navegação para a página de login
// em que o usuário já está).
function aoErroDeQuery(erro: unknown): void {
  if (typeof window === "undefined") return;
  if (!(erro instanceof ApiError) || erro.codigo !== "NAO_AUTENTICADO") return;

  const destino = window.location.pathname.startsWith("/mecanico")
    ? "/mecanico/login"
    : "/balcao/login";

  if (window.location.pathname === destino) return;
  window.location.href = destino;
}

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
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: aoErroDeQuery }),
        mutationCache: new MutationCache({ onError: aoErroDeQuery }),
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MontadorEventosSSE />
      {children}
    </QueryClientProvider>
  );
}
