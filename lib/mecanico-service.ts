import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Mecanico } from "./generated/prisma/client";

export interface MecanicoCreateInput {
  nome: string;
  pin: string;
}

export async function criarMecanico({ nome, pin }: MecanicoCreateInput): Promise<Mecanico> {
  const pinHash = await bcrypt.hash(pin, 10);
  return prisma.mecanico.create({ data: { nome, pinHash } });
}
