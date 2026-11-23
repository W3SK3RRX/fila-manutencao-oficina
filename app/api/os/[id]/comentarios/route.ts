import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { comentarioSchema } from "@/lib/schemas";
import { prisma } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  const { id } = await params;

  const os = await prisma.ordemServico.findUnique({
    where: { id },
    select: { mecanicoId: true },
  });

  if (!os) {
    return NextResponse.json(
      { erro: "OS não encontrada", codigo: "OS_NAO_ENCONTRADA" },
      { status: 404 },
    );
  }

  if (sessao.perfil === "mecanico" && os.mecanicoId !== sessao.mecanicoId) {
    return NextResponse.json(
      { erro: "OS não pertence ao mecânico", codigo: "OS_NAO_PERTENCE_AO_MECANICO" },
      { status: 403 },
    );
  }

  const comentarios = await prisma.osComentario.findMany({
    where: { osId: id },
    orderBy: { criadoEm: "asc" },
  });

  return NextResponse.json(comentarios);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  if (sessao.perfil !== "mecanico") {
    return NextResponse.json(
      { erro: "Acesso restrito ao mecânico", codigo: "PERFIL_NAO_AUTORIZADO" },
      { status: 403 },
    );
  }

  const corpo = await request.json().catch(() => null);
  const dados = comentarioSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json(
      { erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" },
      { status: 400 },
    );
  }

  const { id } = await params;

  const os = await prisma.ordemServico.findUnique({
    where: { id },
    select: { mecanicoId: true },
  });

  if (!os) {
    return NextResponse.json(
      { erro: "OS não encontrada", codigo: "OS_NAO_ENCONTRADA" },
      { status: 404 },
    );
  }

  if (os.mecanicoId !== sessao.mecanicoId) {
    return NextResponse.json(
      { erro: "OS não pertence ao mecânico", codigo: "OS_NAO_PERTENCE_AO_MECANICO" },
      { status: 403 },
    );
  }

  const mecanico = await prisma.mecanico.findUniqueOrThrow({
    where: { id: sessao.mecanicoId },
    select: { nome: true },
  });

  const comentario = await prisma.osComentario.create({
    data: {
      osId: id,
      autorTipo: "mecanico",
      autorNome: mecanico.nome,
      texto: dados.data.texto,
    },
  });

  return NextResponse.json(comentario, { status: 201 });
}
