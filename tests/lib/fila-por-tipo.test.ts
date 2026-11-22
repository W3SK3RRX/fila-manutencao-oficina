import { describe, it, expect } from "vitest";
import { agruparFilaPorTipo } from "@/lib/fila-por-tipo";

describe("agruparFilaPorTipo", () => {
  it("conta as OS da fila por tipo de serviço, incluindo tipos com zero OS, ordenado do maior para o menor", () => {
    const fila = [
      { tipoServicoNome: "Revisão" },
      { tipoServicoNome: "Moto parada (não roda)" },
      { tipoServicoNome: "Revisão" },
      { tipoServicoNome: "Revisão" },
    ];
    const tipos = [
      { nome: "Moto parada (não roda)" },
      { nome: "Conserto geral" },
      { nome: "Revisão" },
      { nome: "Estética / acessórios" },
    ];

    const resultado = agruparFilaPorTipo(fila, tipos);

    expect(resultado).toEqual([
      { tipo: "Revisão", quantidade: 3 },
      { tipo: "Moto parada (não roda)", quantidade: 1 },
      { tipo: "Conserto geral", quantidade: 0 },
      { tipo: "Estética / acessórios", quantidade: 0 },
    ]);
  });
});
