import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

// Padrão de teste: importar a função `proxy` exportada diretamente de
// `proxy.ts` (ver nota abaixo sobre o motivo do nome do arquivo) e invocá-la
// com um NextRequest de verdade, em vez de subir um servidor Next completo.
//
// Nota sobre o nome do arquivo/export: este projeto roda Next.js 16.4.6, que
// *depreciou* a convenção `middleware.ts`/`export function middleware` em
// favor de `proxy.ts`/`export function proxy` (confirmado lendo
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md,
// que diz explicitamente: "The `middleware` file convention is deprecated
// and has been renamed to `proxy`"). Por isso o arquivo de implementação
// desta task é `proxy.ts` na raiz do projeto, exportando `proxy`, e não
// `middleware.ts`/`middleware` — um `middleware.ts` simplesmente não seria
// executado por esta versão do Next.js.
//
// Também verificado empiricamente aqui: construir um NextRequest diretamente
// (sem subir o Next) funciona neste ambiente de teste (vitest, environment:
// "node") — NextRequest estende o Request padrão e popula `request.cookies`
// a partir do header `Cookie` via RequestCookies, sem depender do
// AsyncLocalStorage de `next/headers`'s cookies() (que, como documentado em
// tests/api/auth.test.ts, só existe dentro do roteamento interno do Next).
// É por isso que o proxy.ts desta task lê o cookie via
// `request.cookies.get(...)` em vez de `lerSessao()`.

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) {
    headers.cookie = `${NOME_COOKIE_SESSAO}=${cookieValue}`;
  }
  return new NextRequest(new Request(`http://localhost${path}`, { headers }));
}

describe("proxy (proteção de rotas /balcao e /mecanico)", () => {
  it("requisição não autenticada para /balcao redireciona para /balcao/login", async () => {
    const { proxy } = await import("../proxy");

    const response = await proxy(buildRequest("/balcao"));

    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("location")!).pathname).toBe("/balcao/login");
  });

  it("requisição não autenticada para /mecanico redireciona para /mecanico/login", async () => {
    const { proxy } = await import("../proxy");

    const response = await proxy(buildRequest("/mecanico"));

    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("location")!).pathname).toBe("/mecanico/login");
  });

  it("não redireciona (deixa passar) requisição não autenticada para /balcao/login", async () => {
    const { proxy } = await import("../proxy");

    const response = await proxy(buildRequest("/balcao/login"));

    // NextResponse.next() tem status 200 e nenhum header de redirect.
    expect(response?.headers.get("location")).toBeNull();
  });

  it("não redireciona (deixa passar) requisição não autenticada para /mecanico/login", async () => {
    const { proxy } = await import("../proxy");

    const response = await proxy(buildRequest("/mecanico/login"));

    expect(response?.headers.get("location")).toBeNull();
  });

  it("sessão de balcão acessando /balcao não é redirecionada", async () => {
    const { proxy } = await import("../proxy");
    const token = await assinarSessaoBalcao();

    const response = await proxy(buildRequest("/balcao/fila", token));

    expect(response?.headers.get("location")).toBeNull();
  });

  it("sessão de mecânico acessando /mecanico não é redirecionada", async () => {
    const { proxy } = await import("../proxy");
    const token = await assinarSessaoMecanico("algum-id");

    const response = await proxy(buildRequest("/mecanico/fila", token));

    expect(response?.headers.get("location")).toBeNull();
  });

  it("sessão de balcão acessando /mecanico/* é redirecionada para /mecanico/login", async () => {
    const { proxy } = await import("../proxy");
    const token = await assinarSessaoBalcao();

    const response = await proxy(buildRequest("/mecanico/fila", token));

    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("location")!).pathname).toBe("/mecanico/login");
  });

  it("sessão de mecânico acessando /balcao/* é redirecionada para /balcao/login", async () => {
    const { proxy } = await import("../proxy");
    const token = await assinarSessaoMecanico("algum-id");

    const response = await proxy(buildRequest("/balcao/fila", token));

    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("location")!).pathname).toBe("/balcao/login");
  });

  it("token inválido/expirado em /balcao é tratado como não autenticado", async () => {
    const { proxy } = await import("../proxy");

    const response = await proxy(buildRequest("/balcao", "token-invalido-chute"));

    expect(response?.status).toBe(307);
    expect(new URL(response!.headers.get("location")!).pathname).toBe("/balcao/login");
  });
});
