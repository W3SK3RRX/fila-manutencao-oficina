import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, NOME_COOKIE_SESSAO } from "@/lib/auth";
import { getListener } from "@/lib/pg-listener";

// Mesmo padrão de teste de route handler usado em tests/api/fila.test.ts:
// importar a função exportada (GET) diretamente e invocá-la com um
// NextRequest de verdade, lendo o cookie via `request.cookies.get(...)` +
// `verificarSessao(token)` (não `lerSessao()` — mesma razão documentada ali).
function buildRequest(path: string, cookieValue?: string, signal?: AbortSignal): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) {
    headers.cookie = `${NOME_COOKIE_SESSAO}=${cookieValue}`;
  }
  return new NextRequest(new Request(`http://localhost${path}`, { headers, signal }));
}

const criadas: { tipoIds: string[]; osIds: string[] } = { tipoIds: [], osIds: [] };

afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = [];
  criadas.osIds = [];
});

async function criarTipo(peso = 50) {
  const tipo = await prisma.tipoServico.create({
    data: { nome: `Teste eventos-api ${randomUUID()}`, peso },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarOsDireta(tipoId: string) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste eventos-api",
      tipoServicoId: tipoId,
      status: "na_fila",
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

// Lê o próximo evento SSE do stream, acumulando chunks decodificados até
// encontrar um bloco completo `data: {...}\n\n`. Não assume que um
// `enqueue()` corresponde a exatamente um chunk lido — faz parsing
// defensivo procurando o prefixo `data: ` e o terminador `\n\n`.
async function lerProximoEventoSSE(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs = 5000,
): Promise<{ id: string; status: string }> {
  const decoder = new TextDecoder();
  let buffer = "";
  const prazo = Date.now() + timeoutMs;

  while (true) {
    const restante = prazo - Date.now();
    if (restante <= 0) {
      throw new Error("timeout esperando evento SSE");
    }

    const resultado = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("timeout esperando evento SSE")), restante);
      }),
    ]);

    if (resultado.done) {
      throw new Error("stream encerrado antes de emitir o evento esperado");
    }

    buffer += decoder.decode(resultado.value, { stream: true });

    const match = buffer.match(/data: (\{.*?\})\n\n/);
    if (match) {
      return JSON.parse(match[1]);
    }
  }
}

beforeAll(async () => {
  // Pré-aquece o singleton do listener: seu LISTEN os_changes é emitido de
  // forma assíncrona após connect() resolver (ver lib/pg-listener.ts). Se o
  // NOTIFY do teste disparar antes do LISTEN efetivamente surtir efeito no
  // servidor Postgres, a notificação é descartada silenciosamente — mesma
  // lição de tests/lib/pg-listener.test.ts. Aguardamos um delay fixo aqui
  // para deixar o connect()+LISTEN completar antes de qualquer teste.
  getListener();
  await new Promise((resolve) => setTimeout(resolve, 300));
});

describe("GET /api/eventos", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/eventos/route");
    const response = await GET(buildRequest("/api/eventos"));
    const corpo = await response.json();

    expect(response.status).toBe(401);
    expect(corpo.codigo).toBeTruthy();
  });

  it(
    "sessão de balcão: emite evento SSE quando uma OS muda de status (DB trigger -> pg_notify -> listener -> rota)",
    async () => {
      const tipo = await criarTipo();
      const os = await criarOsDireta(tipo.id);

      const { GET } = await import("@/app/api/eventos/route");
      const token = await assinarSessaoBalcao();
      const controlador = new AbortController();

      const response = await GET(buildRequest("/api/eventos", token, controlador.signal));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/event-stream");

      const reader = response.body!.getReader();

      try {
        await prisma.ordemServico.update({
          where: { id: os.id },
          data: { status: "em_execucao" },
        });

        const evento = await lerProximoEventoSSE(reader);

        expect(evento).toMatchObject({ id: os.id, status: "em_execucao" });
      } finally {
        controlador.abort();
        await reader.cancel().catch(() => {});
      }
    },
    10000,
  );
});
