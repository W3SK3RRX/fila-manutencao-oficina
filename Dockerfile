# Multi-stage build for the Next.js 16 app (App Router, output: "standalone").
#
# Node major version pinned to 26 to match this project's locally-installed
# Node (v26.13.1) — Next.js itself only requires >=20.9.0 (see
# node_modules/next/package.json), but matching the version the app has
# actually been developed/tested against avoids surprises.
ARG NODE_VERSION=26-alpine

# ---- deps: install all dependencies (incl. devDependencies, needed to run
# `prisma generate` and the Next/Serwist build below) -------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: generate the Prisma client, then run the full build script
# (`next build && serwist build serwist.config.mjs` — see package.json).
# Running just `next build` would skip the Serwist step, which writes
# public/sw.js *after* `next build` finishes by reading `.next` output. ----
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma7.config.ts wires DATABASE_URL via defineConfig(); generate doesn't
# need a real database connection, just the schema, so any non-empty value
# satisfies it during the image build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma generate
RUN npm run build

# ---- runner: minimal production image running the standalone server.js
# entry point (not `next start` — see next.config.ts's output: "standalone")
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root runtime user — Next.js's own documented standalone-output Docker
# recipe. Without this, node:*-alpine defaults to running the container
# (and therefore the Next.js process) as root: a compromised server process
# would have root inside the container, able to read/write everything the
# image ships. `-S` creates a system group/user (no password, no login
# shell), the standard pattern for a service account.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone output only includes the files Next's tracer (@vercel/nft)
# follows; public/ and .next/static are intentionally NOT copied into it by
# `next build` (they're meant to be served by a CDN) and must be copied
# manually, per Next's own docs (node_modules/next/dist/docs/01-app/
# 03-api-reference/05-config/01-next-config-js/output.md). Verified
# empirically against this build: running `node .next/standalone/server.js`
# with only these three copies in place serves /balcao, /mecanico and a
# Prisma-backed API route successfully — the generated Prisma client
# (lib/generated/prisma, a non-node_modules path) does NOT need a separate
# copy, because Prisma 7's "prisma-client" generator emits TypeScript
# source that Next bundles directly into the compiled server chunks under
# .next/server, same as any other first-party module.
#
# --chown=nextjs:nodejs on every COPY below: the `nextjs` user switched to
# at the end needs read access to all of it (server.js, static assets, the
# prisma CLI + schema/migrations it runs at container start). Doing it via
# --chown here (rather than a separate `RUN chown -R` after) avoids an
# extra layer that would otherwise duplicate the whole copied tree.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# `prisma migrate deploy` at container start needs the full prisma CLI
# (a devDependency — not something pages import, so standalone's trace
# doesn't include it) plus the schema/migrations and prisma7.config.ts
# that CLI reads. The CLI's own dependency tree is deep (`@prisma/engines`,
# `@prisma/fetch-engine`, etc.) and not worth hand-picking folder by
# folder, so the full builder node_modules (deps+devDeps) is copied over
# the standalone one instead of layering individual packages on top.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma7.config.ts ./prisma7.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
