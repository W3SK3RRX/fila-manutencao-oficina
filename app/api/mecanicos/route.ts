import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { mecanicoCreateSchema } from "@/lib/schemas";
import { criarMecanico } from "@/lib/mecanico-service";

export async function GET() {
  const mecanicos = await prisma.mecanico.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });

  return NextResponse.json(mecanicos);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  if (sessao.perfil !== "balcao") {
    return NextResponse.json(
      { erro: "Acesso restrito ao balcão", codigo: "PERFIL_NAO_AUTORIZADO" },
      { status: 403 },
    );
  }

  const corpo = await request.json().catch(() => null);
  const dados = mecanicoCreateSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      { erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" },
      { status: 400 },
    );
  }

  const mecanico = await criarMecanico(dados.data);

  return NextResponse.json({ id: mecanico.id, nome: mecanico.nome }, { status: 201 });
}
