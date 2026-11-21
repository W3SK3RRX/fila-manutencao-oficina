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
// handlers MSW (o brief desta task oferece as duas opções explicitamente).
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFila } from "@/hooks/useFila";

afterEach(() => {
  vi.unstubAllGlobals();
});

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function FilaDeTeste() {
  const { data, isLoading } = useFila();

  if (isLoading) {
    return <div>carregando</div>;
  }

  return (
    <ul>
      {data?.map((linha) => (
        <li key={linha.id}>{linha.tipoServicoNome}</li>
      ))}
    </ul>
  );
}

describe("useFila", () => {
  it("renderiza as linhas retornadas por GET /api/fila", async () => {
    const linhasFila = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        tipoServicoNome: "Troca de óleo",
        pontosTipo: 70,
        pontosEspera: 5,
        pontosPrazo: 0,
        score: 75,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        tipoServicoNome: "Revisão geral",
        pontosTipo: 50,
        pontosEspera: 10,
        pontosPrazo: 0,
        score: 60,
      },
    ];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/fila");
      return new Response(JSON.stringify(linhasFila), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <Wrapper>
        <FilaDeTeste />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText("Troca de óleo")).toBeInTheDocument();
      expect(screen.getByText("Revisão geral")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
