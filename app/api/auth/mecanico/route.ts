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

  // CORREÇÃO DE SEGURANÇA (I5, rodada final — apontada por review
  // automatizado): a versão anterior chamava `reservarTentativa(mecanicoId)`
  // usando o valor CRU do corpo da requisição, ANTES de confirmar que esse
  // id corresponde a um mecânico real e ativo. `loginMecanicoSchema` só
  // valida o FORMATO (`z.string().uuid()`), nunca a EXISTÊNCIA — então
  // qualquer UUID sintaticamente válido (trivial e grátis de gerar aos
  // milhares) criava uma identidade nova no Map compartilhado de
  // lib/pin-lockout.ts. Combinado com o teto rígido daquele módulo, um
  // atacante podia manufaturar milhares de identidades "bloqueadas" (bastava
  // mandar o mesmo UUID aleatório 5 vezes cada) sem custo nenhum,
  // esgotando o teto do Map e negando serviço a mecânicos de verdade E ao
  // balcão (que compartilha o mesmo Map) por até 10 minutos, repetidamente.
  //
  // A busca do mecânico agora roda PRIMEIRO: nenhum id não confirmado chega
  // perto de `reservarTentativa`. Só depois de ter uma linha real do banco é
  // que a identidade (`mecanico.id`, não o `mecanicoId` cru) entra no
  // limitador de tentativas — o Map só pode conter entradas para mecânicos
  // que realmente existem (população pequena e estável, igual ao design
  // original deste módulo) mais o que a rota do balcão adicionar por IP
  // (que agora exige um IP real e distinto por entrada, não mais
  // falsificável — ver `Caddyfile`/`obterIdentidadeCliente` em
  // app/api/auth/balcao/route.ts).
  let mecanico: Awaited<ReturnType<typeof prisma.mecanico.findFirst>> = null;
  try {
    // Mecânicos inativos são tratados exatamente como "não encontrado" para
    // fins de autenticação (mesma resposta 401 PIN_INVALIDO) — não vazamos
    // se o id existe mas está desativado, e agora também nunca tocamos o
    // limitador de tentativas para esse caso (nada a bloquear/desbloquear
    // para uma identidade que não corresponde a ninguém real).
    mecanico = await prisma.mecanico.findFirst({ where: { id: mecanicoId, ativo: true } });
  } catch (err) {
    console.error("Erro inesperado ao buscar mecânico:", err);
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  if (!mecanico) {
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  // Reserva a tentativa de forma síncrona (sem `await` entre a checagem de
  // bloqueio e o registro) antes do único trabalho assíncrono que resta
  // (`bcrypt.compare`), para fechar a corrida TOCTOU em que uma rajada de
  // requisições concorrentes passaria todas pela checagem de bloqueio antes
  // de qualquer uma registrar uma falha. Isso continua valendo mesmo com a
  // busca do mecânico (também assíncrona) agora rodando antes: o que importa
  // para a corrida é não haver nenhum `await` ENTRE a checagem de
  // `reservarTentativa` e seu próprio registro — e não há, já que a função
  // em si é síncrona por dentro (ver lib/pin-lockout.ts). Usamos
  // `mecanico.id` (o id confirmado no banco), não o `mecanicoId` cru do
  // corpo — na prática é o mesmo valor (o `where` já filtrou por ele), mas
  // deixa explícito que só chegamos aqui com uma identidade real.
  const idDaReserva = reservarTentativa(mecanico.id);
  if (idDaReserva === null) {
    return NextResponse.json(
      {
        erro: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        codigo: "BLOQUEADO_TEMPORARIAMENTE",
      },
      { status: 429 },
    );
  }

  // O `bcrypt.compare` fica num try/catch: se lançar (erro transitório de
  // infraestrutura), a reserva feita acima não deve ficar presa "para
  // sempre" de forma diferente do caminho normal — o mais simples e seguro
  // aqui é deixá-la contar como falha (mesmo comportamento de um PIN
  // incorreto) e devolver 401, em vez de deixar a exceção subir sem
  // tratamento.
  let pinValido = false;
  try {
    pinValido = await bcrypt.compare(pin, mecanico.pinHash);
  } catch (err) {
    console.error("Erro inesperado ao autenticar mecânico:", err);
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  if (!pinValido) {
    return NextResponse.json({ erro: "PIN inválido", codigo: "PIN_INVALIDO" }, { status: 401 });
  }

  // PIN correto: desfaz a reserva feita acima para não contar um login válido
  // como tentativa falha.
  desfazerTentativa(mecanico.id, idDaReserva);

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
