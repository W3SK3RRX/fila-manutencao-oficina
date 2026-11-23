import { describe, it, expect, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { criarMecanico } from "@/lib/mecanico-service";

const criados: string[] = [];

afterEach(async () => {
  if (criados.length) {
    await prisma.mecanico.deleteMany({ where: { id: { in: criados } } });
  }
  criados.length = 0;
});

describe("criarMecanico", () => {
  it("cria o mecânico com o PIN hasheado (nunca em texto puro)", async () => {
    const mecanico = await criarMecanico({ nome: "Fulano de Teste", pin: "1234" });
    criados.push(mecanico.id);

    expect(mecanico.nome).toBe("Fulano de Teste");
    expect(mecanico.pinHash).not.toBe("1234");
    expect(await bcrypt.compare("1234", mecanico.pinHash)).toBe(true);
  });
});
