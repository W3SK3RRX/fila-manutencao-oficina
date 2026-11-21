import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { loginMecanicoSchema } from "@/lib/schemas";
import {
  assinarSessaoMecanico,
  NOME_COOKIE_SESSAO,
  DURACAO_SESSAO_MECANICO_SEGUNDOS,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { reservarTentativa, desfazerTentativa } from "@/lib/pin-lockout";

// Ver nota em app/api/auth/balcao/route.ts sobre o uso de
// NextResponse.cookies em vez de gravarCookieSessao.
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = loginMecanicoSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" }, { status: 400 });
  }

  const { mecanicoId, pin } = dados.data;

  // Reserva a tentativa de forma síncrona (sem `await` entre a checagem de
  // bloqueio e o registro) antes de qualquer operação assíncrona (consulta ao
  // DB, bcrypt.compare), para fechar a corrida TOCTOU em que uma rajada de
  // requisições concorrentes passaria todas pela checagem de bloqueio antes
  // de qualquer uma registrar uma falha. Se a tentativa não puder ser
  // reservada, já está bloqueado.
  if (!reservarTentativa(mecanicoId)) {
    return NextResponse.json(
      {
        erro: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        codigo: "BLOQUEADO_TEMPORARIAMENTE",
      },
      { status: 429 },
    );
  }

  // Mecânicos inativos são tratados exatamente como "não encontrado" para
  // fins de autenticação (mesma resposta 401 PIN_INVALIDO), para não vazar se
  // o id existe mas está desativado.
  const mecanico = await prisma.mecanico.findFirst({ where: { id: mecanicoId, ativo: true } });
  const pinValido = mecanico ? await bcrypt.compare(pin, mecanico.pinHash) : false;

  if (!mecanico || !pinValido) {
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  // PIN correto: desfaz a reserva feita acima para não contar um login válido
  // como tentativa falha.
  desfazerTentativa(mecanicoId);

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
