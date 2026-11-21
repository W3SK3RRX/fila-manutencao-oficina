// @vitest-environment jsdom
//
// Componente/hook test (não de DB/API): precisa de DOM (jsdom), igual a
// tests/hooks/useFila.test.tsx — ver o comentário lá sobre o docblock acima.
//
// useConexao não tem rota própria: observa o cache do QueryClient. Para
// exercitar o comportamento real (sem mockar o hook nem o cache), rodamos
// uma query de verdade (queryFn resolvendo com sucesso) sob fake timers, e
// avançamos o relógio para checar a transição conectado -> desconectado
// depois de 15s sem nenhum sucesso novo no cache.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useConexao } from "@/hooks/useConexao";

// Mesmo motivo do useFila.test.tsx: auto-cleanup da RTL não se registra
// sozinho neste projeto (sem test.globals/setupFiles no vitest.config.mts).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function ConexaoDeTeste() {
  const { conectado } = useConexao();
  // Query dummy só para gerar um evento de sucesso real no cache
  // compartilhado — useConexao não deve depender de nenhum hook específico.
  useQuery({
    queryKey: ["dummy-sucesso"],
    queryFn: () => Promise.resolve("ok"),
  });

  return <div>{conectado ? "conectado" : "desconectado"}</div>;
}

describe("useConexao", () => {
  it("fica desconectado 15s depois do último sucesso no cache de queries", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ConexaoDeTeste />
      </QueryClientProvider>,
    );

    // Flush da promise resolvida da queryFn + do agendamento interno do
    // TanStack Query (notifyManager usa setTimeout(0)), ambos sob fake
    // timers.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByText("conectado")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(screen.getByText("desconectado")).toBeInTheDocument();
  });
});
