// Config do Serwist "configurator mode" (@serwist/next/config), consumida
// pelo CLI `serwist build` (ver script "build" no package.json).
//
// Por que não `withSerwist(nextConfig)` no `next.config.ts` (o jeito
// "clássico")? Este projeto roda `next build` via Turbopack (padrão desde o
// Next 16, confirmado na Task 32), e o `@serwist/next` clássico (export
// default, `withSerwistInit`) se integra via `next.config.js`'s `webpack()`
// hook — que o Turbopack simplesmente ignora ("Turbopack replaces webpack,
// so webpack() configs are not recognized", doc oficial do Next). Ligar o
// clássico aqui produziria um next.config.ts que parece correto mas nunca
// gera public/sw.js sob este build.
//
// Também foi avaliado o `@serwist/turbopack` (rota dinâmica
// app/serwist/[path]/route.ts via `createSerwistRoute`), que é a
// alternativa "nativa" para Turbopack — mas seu próprio código-fonte
// (node_modules/@serwist/turbopack/src/index.ts) exporta
// `{ dynamic, dynamicParams, revalidate, ... }` como route segment config,
// e com `cacheComponents: true` (ativo neste next.config.ts) o Next.js
// falha o build para qualquer rota que exporte `dynamicParams` ("Route
// segment config \"dynamicParams\" is not compatible with
// nextConfig.cacheComponents" — doc oficial de migração do Next). Logo,
// `@serwist/turbopack` é estruturalmente incompatível com este projeto.
//
// O "configurator mode" abaixo não depende do bundler do Next (webpack ou
// Turbopack) nem de route segment configs: ele roda como um passo de build
// separado (esbuild puro) que lê a saída já gerada por `next build` e
// escreve `public/sw.js` como um arquivo estático comum — por isso funciona
// tanto com Turbopack quanto com `cacheComponents: true`.
import { serwist } from "@serwist/next/config";

export default serwist({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});
