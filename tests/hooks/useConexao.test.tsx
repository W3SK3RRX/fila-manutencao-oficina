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
import { useConexao, registrarSucessoConexao, __resetConexaoParaTestes } from "@/hooks/useConexao";

// Mesmo motivo do useFila.test.tsx: auto-cleanup da RTL não se registra
// sozinho neste projeto (sem test.globals/setupFiles no vitest.config.mts).
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  // `ultimoSucesso` (hooks/useConexao.ts) é estado de módulo compartilhado
  // de propósito (ver comentário lá) — sem resetar aqui, o sucesso
  // registrado por um teste vazaria para o próximo dentro deste arquivo.
  __resetConexaoParaTestes();
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

  // Regressão para o finding I1 da revisão final de branch: pós-Task 31, o
  // polling caiu para 60s, então uma loja parada (nenhuma query do app tendo
  // sucesso por até 60s) acendia o indicador vermelho a maior parte do
  // tempo mesmo com a conexão saudável. O fix trata qualquer sinal de vida
  // do SSE (heartbeat/onmessage/onopen, via `registrarSucessoConexao` em
  // hooks/useEventosSSE.ts) como sucesso de conexão também — sem depender de
  // nenhuma query do TanStack Query ter rodado.
  it("permanece conectado enquanto registrarSucessoConexao for chamado, mesmo sem nenhuma query ter sucesso", async () => {
    vi.useFakeTimers();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function ApenasIndicador() {
      const { conectado } = useConexao();
      return <div>{conectado ? "conectado" : "desconectado"}</div>;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ApenasIndicador />
      </QueryClientProvider>,
    );

    // Sem nenhuma query no cache, começa desconectado (sem heartbeat ainda).
    expect(screen.getByText("desconectado")).toBeInTheDocument();

    // `registrarSucessoConexao` só atualiza o timestamp em escopo de módulo;
    // precisa de pelo menos um tick do `setInterval` de recomputação (a cada
    // 1s, INTERVALO_VERIFICACAO_MS) depois dela para o componente
    // re-renderizar refletindo o novo estado.
    await act(async () => {
      registrarSucessoConexao();
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(screen.getByText("conectado")).toBeInTheDocument();

    // Simula heartbeats a cada 10s (app/api/eventos/route.ts) chegando antes
    // da janela de 15s expirar — permanece conectado indefinidamente. Cada
    // iteração: avança quase até a marca dos 10s (ainda conectado, dentro da
    // janela de 15s do sucesso anterior), depois registra o próximo
    // heartbeat e avança mais 1s para o tick de recomputação aplicá-lo.
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(9000);
      });
      expect(screen.getByText("conectado")).toBeInTheDocument();

      await act(async () => {
        registrarSucessoConexao();
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByText("conectado")).toBeInTheDocument();
    }

    // Heartbeats param (conexão caiu de vez): 15s depois do último sinal,
    // o indicador acende vermelho.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(screen.getByText("desconectado")).toBeInTheDocument();
  });
});
