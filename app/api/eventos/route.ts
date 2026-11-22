import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";
import { getListener } from "@/lib/pg-listener";

// Delay fixo entre heartbeats SSE. Mantém a conexão viva através de proxies
// que fecham conexões HTTP ociosas; não precisa ser configurável — este é um
// protótipo (Marco 6), não um serviço com múltiplos ambientes/latências.
//
// Encurtado de 25s para 10s na revisão final de branch (finding I1):
// hooks/useConexao.ts considera a conexão "caída" depois de 15s sem nenhum
// sinal de sucesso. Antes deste heartbeat virar um evento nomeado (ver
// abaixo), isso não importava — agora que ele alimenta o indicador de
// conexão, precisa ser confortavelmente menor que a janela de 15s (folga de
// ~1 heartbeat perdido antes do indicador acender vermelho).
const HEARTBEAT_MS = 10000;

// GET /api/eventos — stream SSE (`text/event-stream`) de mudanças em
// ordens_servico, alimentado pelo singleton de LISTEN/NOTIFY de
// lib/pg-listener.ts (Task 29), que por sua vez recebe o pg_notify disparado
// pelo trigger de ordens_servico (Task 28). Qualquer perfil autenticado pode
// assinar — igual app/api/fila/route.ts e app/api/tipos-servico/route.ts,
// não há checagem de perfil além de "tem sessão válida": tanto o balcão
// quanto o mecânico precisam saber em tempo real quando a fila muda.
//
// Nota sobre cookies: lemos o cookie de sessão via `request.cookies.get(...)`
// + `verificarSessao(token)` em vez de `lerSessao()` de lib/auth.ts — mesmo
// motivo documentado em app/api/fila/route.ts e app/api/os/route.ts.
export async function GET(request: NextRequest) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  if (!sessao) {
    return NextResponse.json(
      { erro: "Não autenticado", codigo: "NAO_AUTENTICADO" },
      { status: 401 },
    );
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const limpar = () => {
    unsubscribe?.();
    if (heartbeat !== undefined) clearInterval(heartbeat);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      unsubscribe = getListener().on((payload) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Controller já fechado (cliente desconectou numa janela estreita
          // antes de abort/cancel rodarem): sem o try/catch, esse enqueue()
          // lançaria dentro do callback do subscriber. O dispatch loop de
          // lib/pg-listener.ts já isola essa exceção por assinante, mas
          // tratamos aqui também e encerramos esta assinatura/intervalo em
          // vez de deixar uma assinatura zumbi.
          limpar();
        }
      });

      heartbeat = setInterval(() => {
        try {
          // Evento SSE nomeado ("event: heartbeat"), não um comentário
          // (`: heartbeat`, formato usado antes da revisão final de branch):
          // um comentário SSE nunca dispara `onmessage` no EventSource do
          // cliente (só linhas `data:` sem `event:` fazem isso), então
          // hooks/useEventosSSE.ts não tinha como saber que o heartbeat
          // chegou — o sinal de vida existia só no nível TCP/HTTP, invisível
          // para hooks/useConexao.ts (finding I1). Um evento nomeado permite
          // `eventSource.addEventListener("heartbeat", ...)` no cliente sem
          // afetar o listener `onmessage` usado para mudanças reais de OS.
          controller.enqueue(encoder.encode(`event: heartbeat\ndata: {}\n\n`));
        } catch {
          // Mesmo cenário acima, mas aqui dentro de um setInterval bruto:
          // sem este try/catch, o próximo tick lançaria
          // "Invalid state: Controller is already closed" sem nada para
          // capturá-lo, e o comportamento padrão do Node derruba o
          // processo inteiro (todas as outras conexões SSE juntas), não
          // apenas esta. Em vez de engolir o erro silenciosamente,
          // encerramos a assinatura e o próprio intervalo.
          limpar();
        }
      }, HEARTBEAT_MS);
    },
    cancel() {
      // Defesa em profundidade: cobre o caso de o runtime chamar cancel()
      // sem disparar o evento 'abort' do signal da requisição.
      // unsubscribe() é idempotente (Set.delete por baixo), então chamar
      // duas vezes (aqui e no listener de abort abaixo) é inofensivo.
      limpar();
    },
  });

  // Mecanismo de limpeza exigido para o caso em que o cliente desconecta: o
  // cancelamento do ReadableStream nem sempre é observado pelo runtime da
  // mesma forma que o abort do AbortSignal da requisição.
  request.signal.addEventListener("abort", limpar);

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
