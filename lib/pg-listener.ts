import { Client } from "pg";

export type OsChangePayload = { id: string; status: string };
export type OsChangeCallback = (payload: OsChangePayload) => void;

const CANAL = "os_changes";

// Delay fixo entre tentativas de reconexão. Isso é um protótipo (Marco 6),
// não um serviço de produção de alta disponibilidade — um backoff fixo é
// suficiente para cobrir quedas de conexão transitórias do Postgres local/dev
// sem introduzir complexidade (jitter, teto exponencial, etc.) que esta tarefa
// não pede.
const RECONEXAO_DELAY_MS = 2000;

export class PgListener {
  private client: Client | undefined;
  private readonly subscribers = new Set<OsChangeCallback>();
  private reconectando = false;
  private encerrado = false;

  constructor() {
    this.conectar();
  }

  private conectar(): void {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    this.client = client;

    client.on("notification", (msg) => {
      if (msg.channel !== CANAL || !msg.payload) return;
      let payload: OsChangePayload;
      try {
        payload = JSON.parse(msg.payload) as OsChangePayload;
      } catch {
        // Payload malformado: ignora em vez de derrubar o processo.
        return;
      }
      for (const callback of this.subscribers) {
        callback(payload);
      }
    });

    // 'error' e 'end' são os eventos pelos quais uma conexão LISTEN perdida
    // se manifesta no node-postgres. Em ambos os casos, tentamos reconectar
    // com um delay fixo, preservando a lista de assinantes (ela vive na
    // instância de PgListener, não na conexão).
    client.on("error", () => this.agendarReconexao());
    client.on("end", () => this.agendarReconexao());

    client
      .connect()
      .then(() => client.query(`LISTEN ${CANAL}`))
      .catch(() => this.agendarReconexao());
  }

  private agendarReconexao(): void {
    if (this.encerrado || this.reconectando) return;
    this.reconectando = true;
    setTimeout(() => {
      this.reconectando = false;
      if (!this.encerrado) this.conectar();
    }, RECONEXAO_DELAY_MS);
  }

  on(callback: OsChangeCallback): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }
}

// Singleton por globalThis, com o mesmo raciocínio do singleton do Prisma em
// lib/db.ts: o hot-reload de módulos do Next.js em dev recriaria o listener
// (e abriria uma nova conexão LISTEN) a cada edição. Diferente do Prisma,
// aqui cacheamos o objeto PgListener inteiro — incluindo seu Set de
// assinantes — não só um client bruto, para que múltiplos chamadores de
// getListener().on(cb) compartilhem a mesma conexão LISTEN em vez de abrir
// uma conexão nova por assinante.
//
// Importante: este listener usa uma conexão dedicada, fora do pool do
// Prisma — uma sessão LISTEN precisa ficar aberta indefinidamente, um ciclo
// de vida incompatível com conexões pooled/transacionais do Prisma.
const globalForPgListener = globalThis as unknown as {
  pgListener: PgListener | undefined;
};

// Nota: diferente de `prisma` em lib/db.ts (um `const` de topo de módulo,
// que naturalmente só é avaliado uma vez por instância de módulo), aqui
// `getListener` é uma função chamada a cada requisição (ex.: a cada
// conexão SSE da Task 30). Por isso o cache em `globalThis` precisa
// acontecer em TODO ambiente, não só em dev — sem isso, cada chamada em
// produção abriria uma nova conexão LISTEN, vazando conexões.
export function getListener(): PgListener {
  if (!globalForPgListener.pgListener) {
    globalForPgListener.pgListener = new PgListener();
  }
  return globalForPgListener.pgListener;
}
