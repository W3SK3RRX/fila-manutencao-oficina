import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

describe("trigger atualizado_em", () => {
  const criadas: { osId?: string; tipoId?: string } = {};

  afterAll(async () => {
    if (criadas.osId) await prisma.ordemServico.delete({ where: { id: criadas.osId } });
    if (criadas.tipoId) await prisma.tipoServico.delete({ where: { id: criadas.tipoId } });
  });

  it("atualiza atualizado_em em todo UPDATE de ordens_servico", async () => {
    const tipo = await prisma.tipoServico.create({
      data: { nome: `Teste trigger ${randomUUID()}`, peso: 10 },
    });
    criadas.tipoId = tipo.id;

    const os = await prisma.ordemServico.create({
      data: {
        placa: "TRG0000",
        modeloMoto: "Modelo Teste",
        clienteNome: "Cliente Teste",
        clienteTelefone: "00000000000",
        descricao: "Teste trigger atualizado_em",
        tipoServicoId: tipo.id,
      },
    });
    criadas.osId = os.id;

    const antes = os.atualizadoEm;
    await new Promise((resolve) => setTimeout(resolve, 20));

    await prisma.$executeRaw`UPDATE ordens_servico SET descricao = 'Alterada' WHERE id = ${os.id}::uuid`;

    const [depois] = await prisma.$queryRaw<{ atualizado_em: Date }[]>`
      SELECT atualizado_em FROM ordens_servico WHERE id = ${os.id}::uuid`;

    expect(depois.atualizado_em.getTime()).toBeGreaterThan(antes.getTime());
  });
});
