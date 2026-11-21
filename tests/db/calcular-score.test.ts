import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("calcular_score", () => {
  const agora = new Date("2026-11-20T12:00:00-03:00");

  it("soma peso + espera (0, 4, 5, 60 min) + 0 pontos de prazo sem prazo", async () => {
    const casos = [
      { minutos: 0, esperado: 0 },
      { minutos: 4, esperado: 0 },
      { minutos: 5, esperado: 1 },
      { minutos: 60, esperado: 12 },
    ];
    for (const c of casos) {
      const criadoEm = new Date(agora.getTime() - c.minutos * 60_000);
      const [{ calcular_score: score }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
        SELECT calcular_score(100, ${criadoEm}, NULL, ${agora})`;
      expect(score).toBe(100 + c.esperado);
    }
  });

  it("aplica pontos de prazo por faixa (0, 0, 20, 40, 80)", async () => {
    const faixas = [
      { horas: 10, esperado: 0 },
      { horas: 4, esperado: 20 }, // "até 4h restantes"
      { horas: 2, esperado: 40 }, // "até 2h restantes"
      { horas: -1, esperado: 80 }, // vencido
    ];
    for (const f of faixas) {
      const prazo = new Date(agora.getTime() + f.horas * 3_600_000);
      const [{ calcular_score: score }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
        SELECT calcular_score(0, ${agora}, ${prazo}, ${agora})`;
      expect(score).toBe(f.esperado);
    }
  });

  it("reproduz o exemplo do escopo: revisão (30) + 3h de espera + prazo em 90min = 106, à frente de moto parada recém-chegada (100)", async () => {
    const criadoEm = new Date(agora.getTime() - 3 * 3_600_000);
    const prazo = new Date(agora.getTime() + 90 * 60_000);
    const [{ calcular_score: revisao }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
      SELECT calcular_score(30, ${criadoEm}, ${prazo}, ${agora})`;
    const [{ calcular_score: motoParada }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
      SELECT calcular_score(100, ${agora}, NULL, ${agora})`;
    expect(revisao).toBe(106);
    expect(motoParada).toBe(100);
    expect(revisao).toBeGreaterThan(motoParada);
  });
});
