import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

describe("vw_fila", () => {
  const criadas: { osId?: string; tipoId?: string } = {};

  afterAll(async () => {
    if (criadas.osId) await prisma.ordemServico.delete({ where: { id: criadas.osId } });
    if (criadas.tipoId) await prisma.tipoServico.delete({ where: { id: criadas.tipoId } });
  });

  it("expõe o detalhamento do score de uma OS na fila (peso 100, 10 min de espera, sem prazo)", async () => {
    const tipo = await prisma.tipoServico.create({
      data: { nome: `Teste vw_fila ${randomUUID()}`, peso: 100 },
    });
    criadas.tipoId = tipo.id;

    const os = await prisma.ordemServico.create({
      data: {
        placa: "TST0000",
        modeloMoto: "Modelo Teste",
        clienteNome: "Cliente Teste",
        clienteTelefone: "00000000000",
        descricao: "Teste vw_fila",
        tipoServicoId: tipo.id,
        criadoEm: new Date(Date.now() - 10 * 60_000),
      },
    });
    criadas.osId = os.id;

    const [linha] = await prisma.$queryRaw<
      {
        pontos_tipo: number;
        pontos_espera: number;
        pontos_prazo: number;
        score: number;
      }[]
    >`SELECT * FROM vw_fila WHERE id = ${os.id}::uuid`;

    expect(linha.pontos_tipo).toBe(100);
    expect(linha.pontos_espera).toBe(2);
    expect(linha.pontos_prazo).toBe(0);
    expect(linha.score).toBe(102);
  });
});
