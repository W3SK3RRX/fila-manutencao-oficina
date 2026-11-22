import { NextResponse } from "next/server";
import { loginBalcaoSchema } from "@/lib/schemas";
import { assinarSessaoBalcao, NOME_COOKIE_SESSAO, DURACAO_SESSAO_BALCAO_SEGUNDOS } from "@/lib/auth";
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
// duas rodadas):
// 1ª rodada: a primeira versão deste fix usava uma única identidade
// CONSTANTE para todas as tentativas (só existe uma senha de balcão, não
// por usuário) — isso é um DoS trivial e não autenticado: qualquer um na
// internet podia mandar 5 senhas erradas de QUALQUER IP e travar o balcão
// de verdade pela janela inteira, mesmo sem nunca ter a senha certa. Fix:
// identidade por IP do cliente (`obterIdentidadeCliente` abaixo) — um
// atacante de um único IP ainda é bloqueado, mas não afeta o balcão de
// verdade tentando de outro IP.
// 2ª rodada: a correção acima ainda tinha, ADICIONALMENTE, um bucket GLOBAL
// de "defesa em profundidade" com um teto mais alto — mas um bucket global
// que bloqueia com 429 mesmo quando a senha está CORRETA é a mesma classe de
// bug, só exigindo um atacante distribuído por mais IPs em vez de um único.
// Removido inteiramente: não existe nenhum caminho nesta rota em que uma
// senha correta, vinda de um IP que não está ele mesmo bloqueado, deixe de
// autenticar.
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

  return ipConfiavel ? `balcao:ip:${ipConfiavel}` : "balcao:ip:desconhecido";
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

  if (dados.data.senha !== process.env.BALCAO_SENHA) {
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
