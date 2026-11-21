import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

describe("pegar_proximo", () => {
  const criadas: { tipoId?: string; mecanicoIds: string[]; osIds: string[] } = {
    mecanicoIds: [],
    osIds: [],
  };

  afterAll(async () => {
    if (criadas.osIds.length) {
      await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
    }
    if (criadas.mecanicoIds.length) {
      await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
    }
    if (criadas.tipoId) await prisma.tipoServico.delete({ where: { id: criadas.tipoId } });
  });

  it("sob 20 chamadas concorrentes com 10 OS na fila, nenhuma é atribuída duas vezes", async () => {
    const tipo = await prisma.tipoServico.create({
      data: { nome: `Teste pegar_proximo ${randomUUID()}`, peso: 50 },
    });
    criadas.tipoId = tipo.id;

    const mecanicos = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        prisma.mecanico.create({
          data: { nome: `Mecanico Teste ${i}`, pinHash: "hash" },
        })
      )
    );
    const mecanicoIds = mecanicos.map((m) => m.id);
    criadas.mecanicoIds.push(...mecanicoIds);

    const ordens = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        prisma.ordemServico.create({
          data: {
            placa: `PPX000${i}`,
            modeloMoto: "Modelo Teste",
            clienteNome: "Cliente Teste",
            clienteTelefone: "00000000000",
            descricao: "Teste pegar_proximo",
            tipoServicoId: tipo.id,
          },
        })
      )
    );
    criadas.osIds.push(...ordens.map((o) => o.id));

    const resultados = await Promise.all(
      mecanicoIds.map((id) =>
        prisma.$queryRaw<{ id: string }[]>`SELECT * FROM pegar_proximo(${id}::uuid)`
      )
    );
    const comOs = resultados.filter((r) => r.length === 1);
    expect(comOs).toHaveLength(10);
    const idsAtribuidos = comOs.map((r) => r[0].id);
    expect(new Set(idsAtribuidos).size).toBe(10);

    const semOs = resultados.filter((r) => r.length === 0);
    expect(semOs).toHaveLength(10);

    const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) AS count FROM ordens_servico
      WHERE status = 'em_execucao' AND id = ANY(${criadas.osIds}::uuid[])`;
    expect(Number(count)).toBe(10);

    const atribuidas = await prisma.ordemServico.findMany({
      where: { id: { in: criadas.osIds }, status: "em_execucao" },
      select: { mecanicoId: true },
    });
    const mecanicosQueReceberam = atribuidas.map((a) => a.mecanicoId);
    expect(new Set(mecanicosQueReceberam).size).toBe(10);
  });

  it("mecânico que já possui OS em_execucao recebe violação de unicidade ao chamar pegar_proximo de novo", async () => {
    const tipo = await prisma.tipoServico.create({
      data: { nome: `Teste pegar_proximo dup ${randomUUID()}`, peso: 50 },
    });

    const mecanico = await prisma.mecanico.create({
      data: { nome: "Mecanico Teste Dup", pinHash: "hash" },
    });

    const ordens = await Promise.all(
      Array.from({ length: 2 }, (_, i) =>
        prisma.ordemServico.create({
          data: {
            placa: `PPD000${i}`,
            modeloMoto: "Modelo Teste",
            clienteNome: "Cliente Teste",
            clienteTelefone: "00000000000",
            descricao: "Teste pegar_proximo duplicado",
            tipoServicoId: tipo.id,
          },
        })
      )
    );

    try {
      const primeira = await prisma.$queryRaw<{ id: string }[]>`
        SELECT * FROM pegar_proximo(${mecanico.id}::uuid)`;
      expect(primeira).toHaveLength(1);

      await expect(
        prisma.$queryRaw<{ id: string }[]>`SELECT * FROM pegar_proximo(${mecanico.id}::uuid)`
      ).rejects.toThrow(/duplicate key value violates unique constraint/);
    } finally {
      await prisma.ordemServico.deleteMany({ where: { id: { in: ordens.map((o) => o.id) } } });
      await prisma.mecanico.delete({ where: { id: mecanico.id } });
      await prisma.tipoServico.delete({ where: { id: tipo.id } });
    }
  });
});
