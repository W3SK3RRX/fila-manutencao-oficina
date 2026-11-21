import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// Manifesto de precache injetado pelo build do Serwist (`serwist build`,
// disparado após `next build` — ver `serwist.config.mjs`). Não é uma lista
// escrita à mão: o Serwist/Workbox descobre automaticamente os assets do
// app shell (JS/CSS/HTML estáticos do `.next` + `public/`) e injeta aqui.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Requisito crítico: /api/* (fila, status de OS, eventos SSE) nunca pode
    // ser servido do cache do service worker — sempre rede, sem fallback
    // para cache. Esta entrada vem ANTES de `defaultCache` de propósito:
    // o roteamento do Serwist usa a primeira rota que casar, e o
    // `defaultCache` padrão do @serwist/next trata `/api/*` (exceto
    // `/api/auth/*`) com `NetworkFirst` + cache de fallback, o que violaria
    // esse requisito. Colocando esta entrada primeiro, toda chamada a
    // `/api/*` é interceptada por ela antes de chegar nas regras padrão.
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        // Fallback de navegação offline. O matcher restringe isso a
        // requisições de documento (navegação de página) — por isso não
        // interfere com o `NetworkOnly` de `/api/*` acima: uma falha de
        // rede numa chamada de API continua propagando como erro de rede,
        // em vez de ser silenciosamente trocada por esta página.
        url: "/offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
