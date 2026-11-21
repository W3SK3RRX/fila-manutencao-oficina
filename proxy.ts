import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { NOME_COOKIE_SESSAO, verificarSessao } from "@/lib/auth";

// Next.js 16 depreciou a convenção `middleware.ts`/`export function
// middleware` em favor de `proxy.ts`/`export function proxy` (confirmado em
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:
// "The `middleware` file convention is deprecated and has been renamed to
// `proxy`"). Por isso este arquivo se chama `proxy.ts` e não `middleware.ts`
// — um `middleware.ts` simplesmente não rodaria nesta versão.
//
// Esta função roda antes do roteamento (potencialmente no runtime Edge), por
// isso lemos o cookie de sessão diretamente do NextRequest
// (`request.cookies.get(...)`) em vez de usar `lerSessao()` de lib/auth.ts.
// `lerSessao()` depende de `next/headers`'s `cookies()`, que usa um
// AsyncLocalStorage de escopo de requisição só disponível dentro do
// roteamento interno de Server Components/Route Handlers — não necessariamente
// equivalente ao contexto de execução do proxy. `verificarSessao(token)`,
// por outro lado, só depende do token em si, então é a forma segura de
// reaproveitar a verificação de JWT aqui.

const AREAS = [
  { prefixo: "/balcao", login: "/balcao/login", perfil: "balcao" as const },
  { prefixo: "/mecanico", login: "/mecanico/login", perfil: "mecanico" as const },
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const area = AREAS.find((a) => pathname.startsWith(a.prefixo));
  if (!area) {
    return NextResponse.next();
  }

  // A própria página de login da área não exige sessão — senão ninguém
  // conseguiria chegar nela para se autenticar.
  if (pathname === area.login || pathname.startsWith(`${area.login}/`)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  const sessao = token ? await verificarSessao(token) : null;

  // Sem sessão, ou sessão de um perfil que não corresponde a esta área
  // (ex.: sessão de balcão tentando acessar /mecanico/*, ou vice-versa):
  // redireciona para o login da área que está sendo acessada.
  if (!sessao || sessao.perfil !== area.perfil) {
    return NextResponse.redirect(new URL(area.login, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/balcao/:path*", "/mecanico/:path*"],
};
