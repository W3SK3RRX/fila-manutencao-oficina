import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

const criadas: { tipoIds: string[]; osIds: string[] } = { tipoIds: [], osIds: [] };

afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osComentario.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = [];
  criadas.osIds = [];
});

describe("OsComentario (Prisma model)", () => {
  it("cria e lista comentários de uma OS em ordem cronológica", async () => {
    const tipo = await prisma.tipoServico.create({
      data: { nome: `Teste os-comentario-model ${randomUUID()}`, peso: 50 },
    });
    criadas.tipoIds.push(tipo.id);
    const os = await prisma.ordemServico.create({
      data: {
        placa: "TST00001",
        modeloMoto: "Modelo Teste",
        clienteNome: "Cliente Teste",
        clienteTelefone: "00000000000",
        descricao: "Teste os-comentario-model",
        tipoServicoId: tipo.id,
        status: "em_execucao",
      },
    });
    criadas.osIds.push(os.id);

    await prisma.osComentario.create({
      data: { osId: os.id, autorTipo: "mecanico", autorNome: "Fulano", texto: "Primeiro" },
    });
    await prisma.osComentario.create({
      data: { osId: os.id, autorTipo: "mecanico", autorNome: "Fulano", texto: "Segundo" },
    });

    const comentarios = await prisma.osComentario.findMany({
      where: { osId: os.id },
      orderBy: { criadoEm: "asc" },
    });

    expect(comentarios.map((c) => c.texto)).toEqual(["Primeiro", "Segundo"]);
    expect(comentarios[0].autorTipo).toBe("mecanico");
  });
});
