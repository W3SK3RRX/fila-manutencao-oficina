import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { getListener } from "@/lib/pg-listener";

// Cliente pg separado, aberto diretamente pelo teste (não pelo singleton),
// usado só para emitir o NOTIFY de forma independente — provando que o
// listener singleton recebe notificações enviadas por outra conexão, do
// mesmo jeito que a verificação manual da Task 28 usava um script separado.
let notifierClient: Client | undefined;

afterEach(async () => {
  if (notifierClient) {
    await notifierClient.end();
    notifierClient = undefined;
  }
});

// Envia `NOTIFY os_changes, '<payload>'` repetidamente a cada 200ms, até
// `pare()` ser chamado. Necessário porque, quando este é o primeiro teste do
// processo a chamar getListener(), o singleton ainda pode estar completando
// seu `connect()` + `LISTEN` (disparado de forma assíncrona no construtor) —
// e o Postgres só entrega NOTIFY a sessões que já emitiram LISTEN. Reenviar
// até o assinante confirmar o recebimento evita essa corrida sem acoplar o
// teste a um delay fixo arbitrário.
function notificarAteConfirmar(client: Client, payload: unknown): () => void {
  const sql = `NOTIFY os_changes, '${JSON.stringify(payload).replace(/'/g, "''")}'`;
  const disparar = () => client.query(sql).catch(() => {});
  const interval = setInterval(disparar, 200);
  client.connect().then(disparar).catch(() => {});
  return () => clearInterval(interval);
}

describe("getListener", () => {
  it("entrega aos assinantes o payload de um NOTIFY os_changes emitido por outra conexão", async () => {
    const listener = getListener();
    const payloadEsperado = { id: randomUUID(), status: "em_execucao" };

    const payloadRecebido = await new Promise<{ id: string; status: string }>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pararNotificacoes();
        reject(new Error("timeout waiting for notification"));
      }, 3000);

      const unsubscribe = listener.on((payload) => {
        clearTimeout(timeout);
        pararNotificacoes();
        unsubscribe();
        resolve(payload);
      });

      notifierClient = new Client({ connectionString: process.env.DATABASE_URL });
      const pararNotificacoes = notificarAteConfirmar(notifierClient, payloadEsperado);
    });

    expect(payloadRecebido).toEqual(payloadEsperado);
  });

  it("entrega a notificação a múltiplos assinantes (fan-out)", async () => {
    const listener = getListener();
    const payloadEsperado = { id: randomUUID(), status: "pausada" };

    const resultados = await new Promise<[unknown, unknown]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pararNotificacoes();
        reject(new Error("timeout waiting for notification"));
      }, 3000);

      let recebido1: unknown;
      let recebido2: unknown;
      let contagem = 0;

      const checarFim = () => {
        contagem += 1;
        if (contagem === 2) {
          clearTimeout(timeout);
          pararNotificacoes();
          unsubscribe1();
          unsubscribe2();
          resolve([recebido1, recebido2]);
        }
      };

      const unsubscribe1 = listener.on((payload) => {
        recebido1 = payload;
        checarFim();
      });
      const unsubscribe2 = listener.on((payload) => {
        recebido2 = payload;
        checarFim();
      });

      notifierClient = new Client({ connectionString: process.env.DATABASE_URL });
      const pararNotificacoes = notificarAteConfirmar(notifierClient, payloadEsperado);
    });

    expect(resultados[0]).toEqual(payloadEsperado);
    expect(resultados[1]).toEqual(payloadEsperado);
  });

  it("isola exceção de um assinante: um segundo assinante bem-comportado ainda recebe a notificação", async () => {
    const listener = getListener();
    const payloadEsperado = { id: randomUUID(), status: "concluida" };

    const recebidoPeloBom = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pararNotificacoes();
        reject(new Error("timeout waiting for notification"));
      }, 3000);

      const unsubscribeRuim = listener.on(() => {
        throw new Error("assinante mal-comportado: falha proposital");
      });
      const unsubscribeBom = listener.on((payload) => {
        clearTimeout(timeout);
        pararNotificacoes();
        unsubscribeRuim();
        unsubscribeBom();
        resolve(payload);
      });

      notifierClient = new Client({ connectionString: process.env.DATABASE_URL });
      const pararNotificacoes = notificarAteConfirmar(notifierClient, payloadEsperado);
    });

    expect(recebidoPeloBom).toEqual(payloadEsperado);
  });
});
