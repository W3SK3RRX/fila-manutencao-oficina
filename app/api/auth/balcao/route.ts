import { NextResponse } from "next/server";
import { loginBalcaoSchema } from "@/lib/schemas";
import {
  assinarSessaoBalcao,
  compararComTempoConstante,
  NOME_COOKIE_SESSAO,
  DURACAO_SESSAO_BALCAO_SEGUNDOS,
} from "@/lib/auth";
import { reservarTentativa, desfazerTentativa } from "@/lib/pin-lockout";

// I5 (revisão final de branch): diferente da rota de PIN do mecânico
// (app/api/auth/mecanico/route.ts), esta rota não tinha nenhum limite de
// tentativas — uma senha curta (BALCAO_SENHA, ex.: 4 dígitos) exposta num
// domínio público podia ser força-bruteada em minutos. Reaproveita
// lib/pin-lockout.ts (mesmo reserve/undo síncrono que fecha a corrida TOCTOU
// documentada lá) em vez de duplicar a lógica de bloqueio — mesmo padrão
// exato da rota do mecânico: reserva por identidade, checa a credencial,
// desfaz a reserva só em caso de sucesso.
//
// CORREÇÃO DE SEGURANÇA pós-fix-wave (apontada por review automatizado, em
// três rodadas — design final convergido na 3ª):
// 1ª rodada: a primeira versão usava uma única identidade CONSTANTE para
// todas as tentativas — DoS trivial e não autenticado (qualquer IP podia
// travar o balcão de verdade). Fix: identidade por IP do cliente.
// 2ª rodada: um bucket GLOBAL "de defesa em profundidade" adicional
// bloqueava com 429 mesmo com a senha CORRETA — mesma classe de bug, só
// exigindo um atacante distribuído. Removido por completo.
// 3ª rodada (design final): bloqueio por IP sozinho ainda é fraco contra um
// atacante que roda por muitos IPs — endereços dentro de um único /64 de
// IPv6 são de graça e triviais de variar, então um IP "puro" (endereço
// completo) deixaria cada /64 inteiro se passar por "muitos atacantes
// diferentes" para fins deste bloqueio. Respostas:
//   a. Nenhum limitador de tentativas sozinho impede força bruta
//      verdadeiramente distribuída — quem faz esse trabalho de verdade é a
//      própria senha: `instrumentation.ts` agora recusa iniciar o servidor
//      em produção se BALCAO_SENHA for curta (<6) ou o valor de exemplo
//      (0000), e infra/deploy.md documenta que a senha real deve ser mais
//      longa que um PIN de 4 dígitos, precisamente porque este login não
//      tem bloqueio por identidade de usuário (só existe uma senha,
//      compartilhada). O bloqueio por IP aqui é só uma camada adicional
//      contra um atacante de IP único/pequeno, nunca a defesa primária.
//   b. Endereços IPv6 são agrupados pelo prefixo /64 (ver
//      `obterChaveIp` abaixo) em vez do endereço completo — não elimina a
//      rotação de IP como vetor, mas não deixa um único /64 (uma única
//      alocação, de graça para quem a possui) parecer "muitos atacantes".
function obterChaveIp(ip: string): string {
  if (!ip.includes(":")) {
    // IPv4: usa o endereço completo como está.
    return ip;
  }

  // IPv6: agrupa pelo prefixo /64 (os 4 primeiros grupos de 16 bits) em vez
  // do endereço completo — um único /64 é uma alocação só, de graça e
  // trivial de variar para quem a possui, então bloquear por endereço
  // completo deixaria um atacante nesse cenário parecer "muitos IPs
  // diferentes" para o limitador.
  const semZona = ip.split("%")[0]; // remove zone id (ex.: "%eth0"), se houver
  let grupos: string[];

  if (semZona.includes("::")) {
    // "::" abrevia um ou mais grupos de zeros consecutivos — precisa
    // expandir para 8 grupos completos antes de truncar para os 4
    // primeiros, senão um endereço como "::1" (split ingênuo por ":")
    // daria os grupos errados.
    const [esquerda, direita] = semZona.split("::");
    const gruposEsquerda = esquerda ? esquerda.split(":") : [];
    const gruposDireita = direita ? direita.split(":") : [];
    const faltando = Math.max(8 - gruposEsquerda.length - gruposDireita.length, 0);
    grupos = [...gruposEsquerda, ...Array(faltando).fill("0"), ...gruposDireita];
  } else {
    grupos = semZona.split(":");
  }

  return grupos.slice(0, 4).join(":");
}

function obterIdentidadeCliente(request: Request): string {
  // Em produção, `docker-compose.yml` só expõe `app` para a rede interna do
  // Docker — quem fala com ele é sempre o `caddy` do próprio compose (nunca
  // a internet direto) — e o `Caddyfile` sobrescreve explicitamente
  // `X-Forwarded-For` com o IP real observado na conexão TCP
  // (`header_up X-Forwarded-For {http.request.remote.host}`), descartando
  // qualquer valor que o cliente tenha mandado. Isso faz o header sempre
  // conter um único valor confiável quando passa pelo Caddy. Ainda assim
  // pegamos o ÚLTIMO segmento de uma lista com vírgulas (não o primeiro)
  // como defesa em profundidade — o formato X-Forwarded-For é sempre
  // "anexar", nunca "prefixar", então o segmento mais à direita é o mais
  // recente/confiável por convenção, mesmo que o header chegasse com mais
  // de um valor por algum motivo não previsto aqui. Em dev (`npm run dev`,
  // sem Caddy na frente) o header não existe — cai no bucket
  // "desconhecido", compartilhado só entre chamadas locais, nunca exposto à
  // internet.
  const encaminhado = request.headers.get("x-forwarded-for");
  const segmentos = encaminhado?.split(",").map((parte) => parte.trim()).filter(Boolean);
  const ipConfiavel = segmentos?.at(-1);

  return ipConfiavel ? `balcao:ip:${obterChaveIp(ipConfiavel)}` : "balcao:ip:desconhecido";
}

// Nota sobre cookies: este handler grava o cookie de sessão via
// `NextResponse.cookies` em vez de `gravarCookieSessao` (lib/auth.ts), que
// usa `next/headers`'s `cookies()`. Essa função exige um AsyncLocalStorage de
// escopo de requisição que só existe quando o próprio Next.js invoca o route
// handler através do seu roteamento interno; chamar a função exportada
// diretamente (como os testes fazem) não cria esse escopo e `cookies()`
// lança "called outside a request scope". `NextResponse.cookies` não depende
// desse contexto e funciona de forma idêntica em testes e em produção.
export async function POST(request: Request) {
  const corpo = await request.json().catch(() => null);
  const dados = loginBalcaoSchema.safeParse(corpo);

  if (!dados.success) {
    return NextResponse.json({ erro: "Dados inválidos", codigo: "DADOS_INVALIDOS" }, { status: 400 });
  }

  const identidadeCliente = obterIdentidadeCliente(request);

  const idDaReserva = reservarTentativa(identidadeCliente);
  if (idDaReserva === null) {
    return NextResponse.json(
      {
        erro: "Muitas tentativas incorretas. Tente novamente em alguns minutos.",
        codigo: "BLOQUEADO_TEMPORARIAMENTE",
      },
      { status: 429 },
    );
  }

  // Comparação em tempo constante (lib/auth.ts), não `!==`: uma senha
  // comparada caractere a caractere com short-circuit é teoricamente
  // vulnerável a um ataque de timing (Task 12 já apontava isso como gap de
  // baixa prioridade; fechado aqui como parte da rodada de correção de
  // segurança deste fix wave).
  if (!compararComTempoConstante(dados.data.senha, process.env.BALCAO_SENHA ?? "")) {
    return NextResponse.json({ erro: "Senha inválida", codigo: "SENHA_INVALIDA" }, { status: 401 });
  }

  // Senha correta: desfaz a reserva para não contar um login válido como
  // tentativa falha (mesmo padrão de app/api/auth/mecanico/route.ts). Não há
  // nenhum outro bucket a desfazer — ver nota de segurança acima sobre por
  // que o bucket global foi removido.
  desfazerTentativa(identidadeCliente, idDaReserva);

  const token = await assinarSessaoBalcao();
  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(NOME_COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: DURACAO_SESSAO_BALCAO_SEGUNDOS,
    path: "/",
  });
  return resposta;
}
