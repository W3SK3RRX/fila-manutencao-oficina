import "dotenv/config";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/db";

const TIPOS_SERVICO = [
  { nome: "Moto parada (não roda)", peso: 100 },
  { nome: "Conserto geral", peso: 60 },
  { nome: "Revisão", peso: 30 },
  { nome: "Estética / acessórios", peso: 10 },
];

const MECANICOS = [
  { nome: "Mecânico 1", pinEnv: "MECANICO_1_PIN" },
  { nome: "Mecânico 2", pinEnv: "MECANICO_2_PIN" },
  { nome: "Mecânico 3", pinEnv: "MECANICO_3_PIN" },
];

async function main() {
  for (const tipo of TIPOS_SERVICO) {
    await prisma.tipoServico.upsert({
      where: { nome: tipo.nome },
      update: { peso: tipo.peso },
      create: tipo,
    });
  }

  for (const mecanico of MECANICOS) {
    const pin = process.env[mecanico.pinEnv];
    if (!pin) {
      throw new Error(
        `Missing env var ${mecanico.pinEnv} (expected a 4-digit PIN for ${mecanico.nome}).`,
      );
    }

    const pinHash = await bcrypt.hash(pin, 10);

    const existing = await prisma.mecanico.findFirst({
      where: { nome: mecanico.nome },
    });

    if (existing) {
      await prisma.mecanico.update({
        where: { id: existing.id },
        data: { pinHash },
      });
    } else {
      await prisma.mecanico.create({
        data: { nome: mecanico.nome, pinHash },
      });
    }
  }

  console.log("Seed concluído: 4 tipos_servico + 3 mecanicos.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
