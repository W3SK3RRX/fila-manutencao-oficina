// @vitest-environment jsdom
//
// Componente/hook test (não de DB/API): precisa de um DOM (jsdom) para
// renderizar hooks do React, diferente dos demais testes do projeto, que
// rodam em ambiente "node" (ver vitest.config.mts). O docblock acima troca o
// ambiente só para este arquivo, via o mecanismo de override por arquivo do
// Vitest — não altera o ambiente global, que continua "node" para os testes
// de DB/API (tests/db/*, tests/api/*, tests/lib/*, tests/proxy.test.ts).
//
// Mock de fetch: usamos `vi.fn()` + `vi.stubGlobal("fetch", ...)` em vez de
// MSW — para um único hook consumindo uma única rota GET, um mock direto de
// fetch é mais simples e com menos overhead de setup do que configurar
// handlers MSW.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResumoBalcao } from "@/hooks/useResumoBalcao";

// @testing-library/react's auto-cleanup only self-registers when the bare
// `afterEach` exists on globalThis (it checks `typeof afterEach === "function"`
// against the real global object). Como este projeto não usa `test.globals: true`
// nem `setupFiles` no vitest.config.mts, o `afterEach` do Vitest só existe como
// import explícito — então o auto-cleanup da RTL nunca dispara sozinho. Por
// isso chamamos `cleanup()` manualmente aqui; sem esta linha, componentes
// renderizados por um `it()` continuam montados (e suas inscrições, como o
// polling de `useFila`, continuam ativas) no próximo `it()` do arquivo. Copie
// esta linha para todo novo arquivo de teste jsdom deste projeto.
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

describe("useResumoBalcao", () => {
  it("combina fila, em_andamento e concluidas_hoje nos números do resumo", async () => {
    const agora = Date.now();
    const filaRows = [
      { id: "1", criadoEm: new Date(agora - 130 * 60000).toISOString(), tipoServicoNome: "x", pontosTipo: 0, pontosEspera: 0, pontosPrazo: 0, score: 0 },
      { id: "2", criadoEm: new Date(agora - 20 * 60000).toISOString(), tipoServicoNome: "x", pontosTipo: 0, pontosEspera: 0, pontosPrazo: 0, score: 0 },
    ];
    const emAndamentoRows = [
      { id: "3", status: "em_execucao" },
      { id: "4", status: "em_execucao" },
      { id: "5", status: "pausada" },
    ];
    const concluidasRows = [{ id: "6", status: "concluida" }];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("status=em_andamento")) {
        return new Response(JSON.stringify(emAndamentoRows), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("status=concluidas_hoje")) {
        return new Response(JSON.stringify(concluidasRows), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(filaRows), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    function ResumoDeTeste() {
      const { data, isLoading } = useResumoBalcao();
      if (isLoading || !data) return <div>carregando</div>;
      return (
        <ul>
          <li>naFila:{data.naFila}</li>
          <li>emExecucao:{data.emExecucao}</li>
          <li>pausadas:{data.pausadas}</li>
          <li>concluidasHoje:{data.concluidasHoje}</li>
          <li>esperaMaisAntiga:{data.esperaMaisAntiga}</li>
        </ul>
      );
    }

    render(<Wrapper><ResumoDeTeste /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("naFila:2")).toBeInTheDocument();
      expect(screen.getByText("emExecucao:2")).toBeInTheDocument();
      expect(screen.getByText("pausadas:1")).toBeInTheDocument();
      expect(screen.getByText("concluidasHoje:1")).toBeInTheDocument();
      expect(screen.getByText("esperaMaisAntiga:2h10")).toBeInTheDocument();
    });
  });
});
