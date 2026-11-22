// @vitest-environment jsdom
//
// Review final de branch (feat/balcao-home-charts): achado Important —
// `.filter((seg) => data[seg.chave] > 0)` removia o segmento "concluídas
// hoje" do DOM quando sua contagem é 0, o que recria a adjacência
// laranja/âmbar que a validação de cores rejeitou (ver
// docs/superpowers/specs/2026-11-22-balcao-home-charts-design.md) sempre que
// "concluídas hoje" é 0 e tanto "em execução" quanto "pausadas" são > 0 — o
// estado mais comum de uma manhã, antes da primeira OS ser concluída. Este
// teste reproduz exatamente esse cenário e trava que os 4 segmentos (mesmo
// os de contagem 0) continuam no DOM, preservando o espaçamento (`gap`) que
// garante a separação visual entre laranja e âmbar.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarraStatusFila } from "@/components/balcao/BarraStatusFila";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("BarraStatusFila", () => {
  it("mantém os 4 segmentos no DOM mesmo quando 'concluídas hoje' é 0 (laranja e âmbar nunca ficam adjacentes)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("status=em_andamento")) {
        return new Response(
          JSON.stringify([
            { id: "1", status: "em_execucao" },
            { id: "2", status: "pausada" },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("status=concluidas_hoje")) {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify([
          { id: "3", criadoEm: new Date().toISOString(), tipoServicoNome: "x", pontosTipo: 0, pontosEspera: 0, pontosPrazo: 0, score: 0 },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Wrapper>
        <BarraStatusFila />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("segmento-status")).toHaveLength(4);
    });
  });
});
