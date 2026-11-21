import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginMecanicoSchema } from "@/lib/schemas";
import {
  assinarSessaoMecanico,
  NOME_COOKIE_SESSAO,
  DURACAO_SESSAO_MECANICO_SEGUNDOS,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estaBloqueado, registrarTentativaFalha } from "@/lib/pin-lockout";

// Ver nota em app/api/auth/balcao/route.ts sobre o uso de
// NextResponse.cookies em vez de gravarCookieSessao.
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = loginMecanicoSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" }, { status: 400 });
  }

  const { mecanicoId, pin } = dados.data;

  if (estaBloqueado(mecanicoId)) {
    return NextResponse.json(
      {
        erro: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        codigo: "BLOQUEADO_TEMPORARIAMENTE",
      },
      { status: 429 },
    );
  }

  const mecanico = await prisma.mecanico.findUnique({ where: { id: mecanicoId } });
  const pinValido = mecanico ? await bcrypt.compare(pin, mecanico.pinHash) : false;

  if (!mecanico || !pinValido) {
    registrarTentativaFalha(mecanicoId);
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  const token = await assinarSessaoMecanico(mecanico.id);
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DURACAO_SESSAO_MECANICO_SEGUNDOS,
    path: "/",
  });
  return resposta;
}
