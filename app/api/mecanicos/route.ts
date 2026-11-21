import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const mecanicos = await prisma.mecanico.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(mecanicos);
}
