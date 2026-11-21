# Fila de Manutenção (Oficina de Motos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a prototype that automatically orders a motorcycle-shop's repair queue by priority, with a front-desk (balcão) web UI to register orders and a mechanic PWA to pick up and work orders, validating that the computed priority order makes sense to shop staff.

**Architecture:** Single Next.js (App Router) app serving two front-ends (`/balcao` desktop-first, `/mecanico` mobile-first PWA) backed by one PostgreSQL 16+ database. All priority scoring and the atomic "pick next" operation live in PL/pgSQL functions called via Prisma `$queryRaw`; Prisma only handles plain CRUD. State transitions are centralized in `lib/os-service.ts` and always write an audit row to `os_eventos` in the same transaction. Fila updates start as 5s polling (TanStack Query) and later add SSE via Postgres `LISTEN/NOTIFY` without changing any screen.

**Tech Stack:** TypeScript (strict), Next.js App Router (`output: "standalone"`), Tailwind CSS + shadcn/ui, TanStack Query, React Hook Form + Zod, PostgreSQL 16+, Prisma, `jose` (JWT), `bcryptjs` (PIN hashing — pure-JS, no native build step, chosen over `argon2` for portability across dev machines), Serwist (PWA service worker), Vitest, Docker Compose + Caddy.

**Spec:** `Escopo — Protótipo Fila de Manutenção (Oficina de Motos).pdf` (repo root)

## Global Constraints

- TypeScript strict mode across the whole project.
- Next.js App Router, `output: "standalone"`; route handlers are the API. If the installed Next.js version renamed `middleware.ts` to `proxy.ts`, use whichever name that version expects.
- UI: Tailwind CSS + shadcn/ui.
- Front-end state: TanStack Query only — no Redux/Zustand/other state manager. Fila/OS queries use `refetchInterval: 5000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true` (Fase 1); interval drops to 60000 once SSE (marco 6) is live.
- Forms: React Hook Form + Zod; Zod schemas live in `lib/schemas.ts` and are imported by both API route handlers and front-end forms (single source of truth).
- Database: PostgreSQL 16+. All timestamps `timestamptz`; display timezone `America/Fortaleza`.
- DB access: Prisma for plain CRUD. Score calculation and "pegar próximo" are raw SQL (PL/pgSQL functions / `FOR UPDATE SKIP LOCKED`), invoked with `$queryRaw`/`$queryRawUnsafe`. Priority and concurrency logic must never be reimplemented in TypeScript.
- Sessions: `httpOnly`, `secure`, `sameSite=lax` cookie holding a JWT signed with `jose` and `JWT_SECRET`. No NextAuth.
- PIN hashing: `bcryptjs`. PIN never stored or logged in clear text.
- PWA: `app/manifest.ts` + Serwist service worker, active only in production builds; never cache `/api/*` responses.
- Tests: Vitest, including an integration test that exercises `pegar_proximo` against a real Postgres instance (no mocking the database for that test).
- Infra: Docker Compose (`app` + `db` + `caddy`); Caddy terminates HTTPS and must proxy SSE unbuffered (`flush_interval -1`).
- Language: table/column names and backend code identifiers in Portuguese, matching the spec exactly; all UI copy in Brazilian Portuguese.
- Do not implement anything from the spec's "Fora do protótipo" list (separate customer registry, mechanic specialties, budgets/approval, parts/stock, push notifications, WhatsApp, photos/checklists, reports, finance, manual priority override, multi-shop, offline mode) without being asked.
- Small, frequent commits — one per relevant step of each milestone.
- Follow the 7 milestones (marcos) in order; each milestone ends with the app running and that milestone's tests passing, and is a natural stopping point for human review before starting the next one.

## Review Focus

- **Fila vazia / corrida parcial em `pegar_proximo`:** com menos OS na fila do que mecânicos concorrentes chamando ao mesmo tempo, os mecânicos excedentes devem receber 204 (não um erro), e nenhuma OS pode ser entregue duas vezes — coberto no teste de concorrência da Task 8.
- **Bloqueio de PIN:** na 6ª tentativa errada dentro da janela de 10 minutos, mesmo o PIN correto deve ser recusado até a janela expirar — teste dedicado na Task 12.
- **Isolamento entre mecânicos:** um mecânico não pode pausar, retomar, concluir ou devolver uma OS que pertence a outro mecânico, mesmo autenticado e com o `id` correto da OS — teste na Task 17.
- **Transições fora de ordem:** editar ou cancelar uma OS que não está mais em `na_fila`/`pausada` (ex.: já `em_execucao` ou `concluida`) deve retornar 409 e não gravar evento — teste na Task 16.
- **Preservação do tempo de espera ao devolver à fila:** "devolver à fila" deve limpar `mecanico_id` mas manter `criado_em` inalterado, para que o score de espera não zere — teste na Task 14.

---

## File Structure

Repo root layout (from the spec, used as-is):

```
/
├── app/
│   ├── balcao/            # login + painel do balcão
│   ├── mecanico/          # login + tela do mecânico
│   ├── instalar/          # QR code para instalação
│   ├── api/                # route handlers (auth, fila, os, mecanico, eventos)
│   ├── manifest.ts
│   ├── sw.ts               # service worker (Serwist)
│   └── layout.tsx
├── components/
│   ├── ui/                 # shadcn/ui
│   ├── balcao/
│   └── mecanico/
├── lib/
│   ├── db.ts                # cliente Prisma (singleton)
│   ├── auth.ts              # JWT, cookies, verificação de perfil
│   ├── os-service.ts         # transições de estado + eventos
│   ├── pg-listener.ts         # LISTEN/NOTIFY (marco 6)
│   └── schemas.ts             # Zod compartilhado
├── hooks/                     # useFila, useMinhasOS, useConexao
├── prisma/
│   ├── schema.prisma
│   ├── migrations/             # inclui SQL de calcular_score, vw_fila, pegar_proximo, triggers
│   └── seed.ts
├── scripts/                     # mecanico:criar
├── tests/                        # Vitest (unitário + integração com banco)
├── public/icons/
├── middleware.ts                  # (ou proxy.ts, conforme versão instalada)
├── docker-compose.yml
├── Dockerfile
├── Caddyfile
└── .env.example
```

`lib/os-service.ts` is the only place allowed to perform a status transition; route handlers call into it and never write transition SQL directly.

---

# Marco 1 — Fundação

### Task 1: Scaffold Next.js project, git, Tailwind, TypeScript

**Files:**
- Create: entire `create-next-app` output at repo root (`app/`, `public/`, `tsconfig.json`, `next.config.ts`, `package.json`, etc.)
- Create: `.gitignore` (from scaffold, verify `node_modules`, `.env`, `.next` present)

**Interfaces:**
- Produces: a runnable `npm run dev` Next.js 15+ App Router project in strict TypeScript, Tailwind configured, at repo root.

- [ ] **Step 1: Initialize git**

Run: `git init` at repo root. Confirm the existing PDF is left untouched and not force-added later.

- [ ] **Step 2: Scaffold the app**

Run `npx create-next-app@latest .` with: TypeScript yes, ESLint yes, Tailwind yes, `src/` directory **no** (spec's structure puts `app/` at root), App Router yes, import alias `@/*`.

- [ ] **Step 3: Set `output: "standalone"` in `next.config.ts`**

- [ ] **Step 4: Run dev server to verify it boots**

Run: `npm run dev`, confirm `http://localhost:3000` renders the default page, then stop it.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app"
```

### Task 2: Install shadcn/ui and base dependencies

**Files:**
- Modify: `package.json`
- Create: `components.json`, `components/ui/` (shadcn output), `lib/utils.ts` (shadcn's `cn` helper)

**Interfaces:**
- Produces: `cn()` from `lib/utils.ts`, shadcn primitives (`Button`, `Input`, `Card`, `Tabs`, `Dialog`, `Select`) available under `components/ui/`.

- [ ] **Step 1: Run `npx shadcn@latest init`**, accepting Tailwind CSS variables, pick a neutral base color.

- [ ] **Step 2: Add the primitives this project will need**

Run: `npx shadcn@latest add button input card tabs dialog select badge label`

- [ ] **Step 3: Install remaining libraries**

Run: `npm install @tanstack/react-query @tanstack/react-query-devtools react-hook-form zod @hookform/resolvers jose bcryptjs @prisma/client`
Run: `npm install -D prisma vitest @vitejs/plugin-react vite-tsconfig-paths dotenv-cli`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: add shadcn/ui, TanStack Query, Prisma, auth and test deps"
```

### Task 3: Docker Compose, `.env.example`, Prisma init

**Files:**
- Create: `docker-compose.yml` (services: `db` only for now — `app`/`caddy` land in Marco 7)
- Create: `.env.example`
- Create: `prisma/schema.prisma` (datasource + generator only; models come in Task 5)
- Create: `lib/db.ts`

**Interfaces:**
- Produces: `DATABASE_URL` pointing at a local `db` service on port 5432; `TEST_DATABASE_URL` pointing at a second database name (`motomais_test`) on the same instance, used only by integration tests.
- Produces: `lib/db.ts` exporting a Prisma Client singleton as `export const prisma: PrismaClient`, guarded against re-instantiation on every module reload in dev (cache the instance on `globalThis` and reuse it when present). Every later task that touches the database (from Task 5's `calcular_score` test onward) imports this `prisma` export — no other file may call `new PrismaClient()`.

- [ ] **Step 1: Write `docker-compose.yml`** with a `db` service: `postgres:16`, env `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=motomais`, a named volume for persistence, port `5432:5432`, and an `init` script (mounted via `docker-entrypoint-initdb.d`) that runs `CREATE DATABASE motomais_test;`.

- [ ] **Step 2: Write `.env.example`** with `DATABASE_URL`, `TEST_DATABASE_URL`, `JWT_SECRET`, `BALCAO_SENHA`, `APP_URL`, `TZ=America/Fortaleza`. Copy it to a local `.env` (not committed) with dev values.

- [ ] **Step 3: `npx prisma init --datasource-provider postgresql`**, then point its `url` at `env("DATABASE_URL")`.

- [ ] **Step 4: Write `lib/db.ts`** with the Prisma Client singleton described above, then run `npx prisma generate` to confirm `@prisma/client` builds against the (still model-less) schema without error.

- [ ] **Step 5: Bring up the database and verify connectivity**

Run: `docker compose up -d db`, then `npx prisma db pull` or `psql` ping to confirm both `motomais` and `motomais_test` exist.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add docker-compose db service, env example, prisma init"
```

---

# Marco 2 — Banco

### Task 4: Prisma schema — enum and four tables

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces Prisma models: `TipoServico`, `Mecanico`, `OrdemServico`, `OsEvento`, enum `StatusOs` (`na_fila`, `em_execucao`, `pausada`, `concluida`, `cancelada`), each `@@map`ped to the Portuguese snake_case table name from the spec, with every column `@map`ped to its exact spec column name (`pin_hash`, `modelo_moto`, `cliente_nome`, `cliente_telefone`, `tipo_servico_id`, `mecanico_id`, `motivo_pausa`, `criado_em`, `iniciado_em`, `concluido_em`, `atualizado_em`, `os_id`, `de_status`, `para_status`, `origem`, `motivo`). `OrdemServico.numero` is a Prisma `Int @default(autoincrement())` backed by Postgres `serial`. All timestamp fields use `@db.Timestamptz`.

- [ ] **Step 1: Write the four models + enum** in `prisma/schema.prisma` per the spec's "Modelo de dados" table definitions (columns, types, defaults, nullability exactly as listed: `tipos_servico(id, nome unique, peso, ativo default true)`, `mecanicos(id, nome, pin_hash, ativo default true)`, `ordens_servico` with all columns from the spec table, `os_eventos` with all columns from the spec table).

- [ ] **Step 2: Add relations** — `OrdemServico.tipoServico -> TipoServico`, `OrdemServico.mecanico -> Mecanico?`, `OsEvento.ordemServico -> OrdemServico`, `OsEvento.mecanico -> Mecanico?`.

- [ ] **Step 3: Add `@@index([status])` on `OrdemServico`.** (The partial unique index on `mecanico_id` for `em_execucao` cannot be expressed in Prisma's schema language — it is added as raw SQL in Task 7.)

- [ ] **Step 4: Generate the first migration**

Run: `npx prisma migrate dev --name init_schema --create-only` (create-only so Task 5-8 can hand-edit the generated SQL before applying).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add core schema (tipos_servico, mecanicos, ordens_servico, os_eventos)"
```

### Task 5: `calcular_score` SQL function

**Files:**
- Modify: the migration SQL file created in Task 4 (append), or create a new migration via `npx prisma migrate dev --name calcular_score --create-only`
- Test: `tests/db/calcular-score.test.ts`

**Interfaces:**
- Produces: PL/pgSQL function `calcular_score(peso int, criado_em timestamptz, prazo timestamptz, agora timestamptz) RETURNS int`, called from TypeScript via `prisma.$queryRaw` with `agora` always passed explicitly (never `now()` implicitly) so results are deterministic in tests.
- Consumes: nothing from earlier tasks besides an applied migration chain.

- [ ] **Step 1: Write the failing test** for the exact weight table and deadline point table from the spec:

```ts
// tests/db/calcular-score.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";

describe("calcular_score", () => {
  const agora = new Date("2026-11-20T12:00:00-03:00");

  it("soma peso + espera (0, 4, 5, 60 min) + 0 pontos de prazo sem prazo", async () => {
    const casos = [
      { minutos: 0, esperado: 0 },
      { minutos: 4, esperado: 0 },
      { minutos: 5, esperado: 1 },
      { minutos: 60, esperado: 12 },
    ];
    for (const c of casos) {
      const criadoEm = new Date(agora.getTime() - c.minutos * 60_000);
      const [{ calcular_score: score }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
        SELECT calcular_score(100, ${criadoEm}, NULL, ${agora})`;
      expect(score).toBe(100 + c.esperado);
    }
  });

  it("aplica pontos de prazo por faixa (0, 0, 20, 40, 80)", async () => {
    const faixas = [
      { horas: 10, esperado: 0 },
      { horas: 4, esperado: 20 }, // "até 4h restantes"
      { horas: 2, esperado: 40 }, // "até 2h restantes"
      { horas: -1, esperado: 80 }, // vencido
    ];
    for (const f of faixas) {
      const prazo = new Date(agora.getTime() + f.horas * 3_600_000);
      const [{ calcular_score: score }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
        SELECT calcular_score(0, ${agora}, ${prazo}, ${agora})`;
      expect(score).toBe(f.esperado);
    }
  });

  it("reproduz o exemplo do escopo: revisão (30) + 3h de espera + prazo em 90min = 106, à frente de moto parada recém-chegada (100)", async () => {
    const criadoEm = new Date(agora.getTime() - 3 * 3_600_000);
    const prazo = new Date(agora.getTime() + 90 * 60_000);
    const [{ calcular_score: revisao }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
      SELECT calcular_score(30, ${criadoEm}, ${prazo}, ${agora})`;
    const [{ calcular_score: motoParada }] = await prisma.$queryRaw<{ calcular_score: number }[]>`
      SELECT calcular_score(100, ${agora}, NULL, ${agora})`;
    expect(revisao).toBe(106);
    expect(motoParada).toBe(100);
    expect(revisao).toBeGreaterThan(motoParada);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** (function does not exist yet)

Run: `npm run test -- tests/db/calcular-score.test.ts`
Expected: FAIL with `function calcular_score(...) does not exist`

- [ ] **Step 3: Write the migration SQL**

```sql
CREATE OR REPLACE FUNCTION calcular_score(
  peso int,
  criado_em timestamptz,
  prazo timestamptz,
  agora timestamptz
) RETURNS int AS $$
DECLARE
  pontos_espera int;
  pontos_prazo int;
  horas_restantes numeric;
BEGIN
  pontos_espera := floor(extract(epoch FROM (agora - criado_em)) / 60 / 5);

  IF prazo IS NULL THEN
    pontos_prazo := 0;
  ELSE
    horas_restantes := extract(epoch FROM (prazo - agora)) / 3600;
    IF horas_restantes < 0 THEN
      pontos_prazo := 80;
    ELSIF horas_restantes <= 2 THEN
      pontos_prazo := 40;
    ELSIF horas_restantes <= 4 THEN
      pontos_prazo := 20;
    ELSE
      pontos_prazo := 0;
    END IF;
  END IF;

  RETURN peso + pontos_espera + pontos_prazo;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

Apply it: `npx prisma migrate dev` (applies the pending `create-only` migrations from Task 4 and this one).

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/db/calcular-score.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add calcular_score SQL function with tests"
```

### Task 6: `vw_fila` view

**Files:**
- Create: new migration `npx prisma migrate dev --name vw_fila --create-only`
- Test: `tests/db/vw-fila.test.ts`

**Interfaces:**
- Produces: view `vw_fila` exposing, per OS in `na_fila`: all `ordens_servico` columns plus `tipo_servico_nome`, `pontos_tipo`, `pontos_espera`, `pontos_prazo`, `score`, pre-sorted `score DESC, criado_em ASC`.
- Consumes: `calcular_score` from Task 5.

- [ ] **Step 1: Write the failing test** — seed one `tipo_servico` (peso 100) and one `na_fila` order created 10 minutes ago with no prazo via `prisma.ordemServico.create`, then query `SELECT * FROM vw_fila WHERE id = ${id}` and assert `pontos_tipo = 100`, `pontos_espera = 2`, `pontos_prazo = 0`, `score = 102`.

- [ ] **Step 2: Run test to verify it fails** (relation `vw_fila` does not exist)

- [ ] **Step 3: Write the migration SQL**

```sql
CREATE OR REPLACE VIEW vw_fila AS
SELECT
  os.*,
  t.nome AS tipo_servico_nome,
  t.peso AS pontos_tipo,
  floor(extract(epoch FROM (now() - os.criado_em)) / 60 / 5)::int AS pontos_espera,
  calcular_score(t.peso, os.criado_em, os.prazo, now())
    - t.peso
    - floor(extract(epoch FROM (now() - os.criado_em)) / 60 / 5)::int AS pontos_prazo,
  calcular_score(t.peso, os.criado_em, os.prazo, now()) AS score
FROM ordens_servico os
JOIN tipos_servico t ON t.id = os.tipo_servico_id
WHERE os.status = 'na_fila'
ORDER BY score DESC, os.criado_em ASC;
```

Apply with `npx prisma migrate dev`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add vw_fila view with score breakdown"
```

### Task 7: Partial unique index + `atualizado_em` trigger

**Files:**
- Create: new migration `npx prisma migrate dev --name indices_e_trigger --create-only`
- Test: `tests/db/trigger-atualizado-em.test.ts`

**Interfaces:**
- Produces: a `UNIQUE` partial index enforcing at most one `em_execucao` order per mechanic, and a `BEFORE UPDATE` trigger that sets `atualizado_em = now()` on every row update.

- [ ] **Step 1: Write the failing test** — update an existing `OrdemServico` row via raw SQL, re-select it, assert `atualizado_em` is newer than the original `criado_em`/previous `atualizado_em`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write the migration SQL**

```sql
CREATE UNIQUE INDEX ux_ordens_servico_mecanico_em_execucao
  ON ordens_servico (mecanico_id)
  WHERE status = 'em_execucao';

CREATE OR REPLACE FUNCTION trigger_set_atualizado_em() RETURNS trigger AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_atualizado_em
  BEFORE UPDATE ON ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_atualizado_em();
```

Apply with `npx prisma migrate dev`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): add unique em_execucao index and atualizado_em trigger"
```

### Task 8: `pegar_proximo` SQL function + concurrency test

**Files:**
- Create: new migration `npx prisma migrate dev --name pegar_proximo --create-only`
- Test: `tests/db/pegar-proximo.test.ts`

**Interfaces:**
- Produces: PL/pgSQL function `pegar_proximo(p_mecanico_id uuid) RETURNS SETOF ordens_servico` (returns zero rows when the queue is empty).
- Consumes: `calcular_score` from Task 5, the partial unique index from Task 7.

- [ ] **Step 1: Write the failing concurrency test** — seed 10 `na_fila` orders and 20 mechanics, fire `pegar_proximo` for all 20 mechanics concurrently (`Promise.all`), then assert: exactly 10 calls returned a row, exactly 10 returned zero rows, and `SELECT count(*) FROM ordens_servico WHERE status = 'em_execucao'` equals 10 with no `mecanico_id` repeated.

```ts
it("sob 20 chamadas concorrentes com 10 OS na fila, nenhuma é atribuída duas vezes", async () => {
  const resultados = await Promise.all(
    mecanicoIds.map((id) =>
      prisma.$queryRaw<{ id: string }[]>`SELECT * FROM pegar_proximo(${id}::uuid)`
    )
  );
  const comOs = resultados.filter((r) => r.length === 1);
  expect(comOs).toHaveLength(10);
  const idsAtribuidos = comOs.map((r) => r[0].id);
  expect(new Set(idsAtribuidos).size).toBe(10);
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write the migration SQL** (verbatim from the spec):

```sql
CREATE OR REPLACE FUNCTION pegar_proximo(p_mecanico_id uuid)
RETURNS SETOF ordens_servico AS $$
  UPDATE ordens_servico
  SET status = 'em_execucao', mecanico_id = p_mecanico_id,
      iniciado_em = COALESCE(iniciado_em, now())
  WHERE id = (
    SELECT os.id
    FROM ordens_servico os
    JOIN tipos_servico t ON t.id = os.tipo_servico_id
    WHERE os.status = 'na_fila'
    ORDER BY calcular_score(t.peso, os.criado_em, os.prazo, now()) DESC,
             os.criado_em ASC
    LIMIT 1
    FOR UPDATE OF os SKIP LOCKED
  )
  RETURNING *;
$$ LANGUAGE sql;
```

Apply with `npx prisma migrate dev`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Write a second test**: a mechanic who already owns an `em_execucao` order calls `pegar_proximo` again — assert it raises a unique-violation (caller in Task 15/21 will translate this to HTTP 409).

- [ ] **Step 6: Run tests to verify both pass**

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): add pegar_proximo atomic function with concurrency test"
```

### Task 9: Seed script

**Files:**
- Create: `prisma/seed.ts`
- Modify: `package.json` (`"prisma": {"seed": "tsx prisma/seed.ts"}`, add `tsx` dev dependency)

**Interfaces:**
- Produces: 4 `tipos_servico` rows (`Moto parada (não roda)` peso 100, `Conserto geral` peso 60, `Revisão` peso 30, `Estética / acessórios` peso 10) and 3 `mecanicos` rows with PINs read from `.env` (`MECANICO_1_PIN`, etc., documented in `.env.example`), hashed with `bcryptjs`.

- [ ] **Step 1: Write `prisma/seed.ts`** upserting the 4 `tipos_servico` by `nome` and 3 `mecanicos` by `nome`, hashing each PIN with `bcryptjs.hash(pin, 10)`.

- [ ] **Step 2: Add the 3 dev PINs to `.env.example`** (placeholder values) and to local `.env`.

- [ ] **Step 3: Run the seed**

Run: `npx prisma db seed`
Expected: 4 `tipos_servico` + 3 `mecanicos` rows present (verify with `npx prisma studio` or a quick `$queryRaw` count).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(db): add seed script for tipos_servico and mecanicos de teste"
```

---

# Marco 3 — API e autenticação

### Task 10: `lib/schemas.ts` — shared Zod schemas

**Files:**
- Create: `lib/schemas.ts`

**Interfaces:**
- Produces: `osCreateSchema`, `osEditSchema` (placa, modeloMoto, clienteNome, clienteTelefone, descricao, tipoServicoId required; prazo optional `z.coerce.date().optional()`; placa normalized to uppercase, hyphens stripped via `.transform`), `pausarSchema` (`motivo: z.enum(["aguardando_peca", "aguardando_aprovacao", "outro"])`, `motivoTexto: z.string().optional()` required when `motivo === "outro"` via `.superRefine`), `loginBalcaoSchema` (`senha: z.string().min(1)`), `loginMecanicoSchema` (`mecanicoId: z.string().uuid()`, `pin: z.string().length(4).regex(/^\d+$/)`).
- Consumes: nothing.

- [ ] **Step 1: Write each schema** per the field list above, matching the spec's "Criar" action field list (placa, modelo, cliente, telefone, descrição, tipo obrigatórios; prazo opcional) and the pause reasons ("aguardando peça, aguardando aprovação ou outro (com texto)").

- [ ] **Step 2: Write a quick schema test**

```ts
// tests/lib/schemas.test.ts
it("exige motivoTexto quando motivo é outro", () => {
  const result = pausarSchema.safeParse({ motivo: "outro" });
  expect(result.success).toBe(false);
});
```

- [ ] **Step 3: Run test to verify it passes**

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lib): add shared Zod schemas for OS and auth"
```

### Task 11: `lib/auth.ts` — JWT, cookies, role checks

**Files:**
- Create: `lib/auth.ts`
- Test: `tests/lib/auth.test.ts`

**Interfaces:**
- Produces:
  - `assinarSessaoBalcao(): Promise<string>` — signs `{ perfil: "balcao" }`, 12h expiry.
  - `assinarSessaoMecanico(mecanicoId: string): Promise<string>` — signs `{ perfil: "mecanico", mecanicoId }`, 30d expiry.
  - `verificarSessao(token: string): Promise<SessaoBalcao | SessaoMecanico | null>`.
  - `gravarCookieSessao(token: string, maxAgeSeconds: number): void` (sets the `httpOnly`/`secure`/`sameSite=lax` cookie named `sessao`).
  - `lerSessao(): Promise<SessaoBalcao | SessaoMecanico | null>` — reads and verifies the cookie from the current request (Next.js `cookies()`).
  - `removerCookieSessao(): void`.
- Consumes: `JWT_SECRET` from env.

- [ ] **Step 1: Write failing tests** for sign/verify round-trip for both profiles, and for a tampered/expired token returning `null`.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `lib/auth.ts`** using `jose`'s `SignJWT`/`jwtVerify` with `HS256` and the exact payload shapes above.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): add JWT session helpers for balcao and mecanico"
```

### Task 12: Auth route handlers + mechanics list + PIN lockout

**Files:**
- Create: `app/api/auth/balcao/route.ts`, `app/api/auth/mecanico/route.ts`, `app/api/auth/logout/route.ts`, `app/api/mecanicos/route.ts`
- Create: `lib/pin-lockout.ts`
- Test: `tests/api/auth.test.ts`

**Interfaces:**
- `lib/pin-lockout.ts` produces: `registrarTentativaFalha(mecanicoId: string): void`, `estaBloqueado(mecanicoId: string): boolean` (in-memory `Map<string, number[]>` of failure timestamps, 5 failures / 10 minutes per the spec).
- `POST /api/auth/balcao`: validates `loginBalcaoSchema`, compares `senha` to `process.env.BALCAO_SENHA`, on success calls `assinarSessaoBalcao` + `gravarCookieSessao`, else `{ erro, codigo: "SENHA_INVALIDA" }` 401.
- `GET /api/mecanicos`: returns `[{ id, nome }]` for `ativo = true` mecanicos (no `pin_hash`).
- `POST /api/auth/mecanico`: validates `loginMecanicoSchema`; if `estaBloqueado`, returns 429 `{ erro, codigo: "BLOQUEADO_TEMPORARIAMENTE" }`; else compares PIN with `bcryptjs.compare` against the stored hash, on failure calls `registrarTentativaFalha` and returns 401 `{ erro, codigo: "PIN_INVALIDO" }`, on success signs + sets cookie.
- `POST /api/auth/logout`: calls `removerCookieSessao`, returns 204.
- Consumes: `lib/auth.ts` (Task 11), `lib/schemas.ts` (Task 10), `lib/db.ts` (Prisma singleton — create it now if not already present from scaffolding, pointing at `DATABASE_URL`).

- [ ] **Step 1: Write failing tests** for: correct balcão senha sets cookie, wrong senha returns 401; mecânico correct PIN sets cookie, wrong PIN returns 401, 6th wrong attempt in the window returns 429 even if a subsequent attempt uses the correct PIN.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `lib/pin-lockout.ts`** and the four route handlers per the interfaces above.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): add balcao and mecanico auth routes with PIN lockout"
```

### Task 13: `middleware.ts` route protection

**Files:**
- Create: `middleware.ts` (or `proxy.ts` — match whatever the installed Next.js version expects; note which one was used in the commit message)

**Interfaces:**
- Produces: a middleware that reads the `sessao` cookie via `lib/auth.ts`'s `verificarSessao`, redirects unauthenticated requests to `/balcao/*` → `/balcao/login` and `/mecanico/*` → `/mecanico/login`, and redirects a `balcao`-profile session away from `/mecanico/*` (and vice versa) back to its own login.
- Consumes: `verificarSessao` from Task 11.

- [ ] **Step 1: Write a failing test** (using `next/server`'s `NextRequest`/middleware test helpers, or an integration test hitting a protected route handler directly) asserting an unauthenticated request to `/balcao` redirects to `/balcao/login`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement the middleware** with `matcher: ["/balcao/:path*", "/mecanico/:path*"]`, excluding the `login` sub-paths from the auth check.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: protect /balcao and /mecanico routes with session middleware"
```

### Task 14: `lib/os-service.ts` — state machine core

**Files:**
- Create: `lib/os-service.ts`
- Test: `tests/lib/os-service.test.ts`

**Interfaces:**
- Produces, each wrapping its SQL in a `prisma.$transaction` that also inserts into `os_eventos`, and each throwing a typed `TransicaoInvalidaError` (caught by route handlers and turned into HTTP 409) when the conditional `UPDATE` affects zero rows:
  - `criarOs(dados: OsCreateInput): Promise<OrdemServico>`
  - `editarOs(id: string, dados: OsEditInput): Promise<OrdemServico>` — `UPDATE ... WHERE id = $1 AND status = 'na_fila'`
  - `pegarProximo(mecanicoId: string): Promise<OrdemServico | null>` — calls the `pegar_proximo` SQL function; translates a unique-violation (mechanic already has one `em_execucao`) into `TransicaoInvalidaError`; returns `null` when the function returns zero rows.
  - `pausarOs(id: string, mecanicoId: string, motivo: string, motivoTexto?: string): Promise<OrdemServico>` — `WHERE id = $1 AND status = 'em_execucao' AND mecanico_id = $2`
  - `retomarOs(id: string, mecanicoId: string): Promise<OrdemServico>` — `WHERE id = $1 AND status = 'pausada' AND mecanico_id = $2`; relies on the partial unique index to reject a mechanic who already has an `em_execucao` order.
  - `devolverOs(id: string, mecanicoIdOuBalcao: string | "balcao"): Promise<OrdemServico>` — `WHERE id = $1 AND status = 'pausada'` (+ `AND mecanico_id = $2` when caller is a mechanic); sets `mecanico_id = NULL`, leaves `criado_em` untouched.
  - `concluirOs(id: string, mecanicoId: string): Promise<OrdemServico>` — `WHERE id = $1 AND status = 'em_execucao' AND mecanico_id = $2`; sets `concluido_em = now()`.
  - `cancelarOs(id: string, motivo?: string): Promise<OrdemServico>` — `WHERE id = $1 AND status IN ('na_fila', 'pausada')`.
- Consumes: `lib/db.ts` Prisma client.

- [ ] **Step 1: Write failing tests** for: a valid `pausarOs` transition writes exactly one `os_eventos` row with `de_status='em_execucao'`, `para_status='pausada'`; an invalid transition (e.g. `pausarOs` on a `na_fila` order) throws `TransicaoInvalidaError` and writes **no** event row; `devolverOs` leaves `criado_em` unchanged across the call.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement `lib/os-service.ts`** with the functions above, each using `prisma.$queryRaw`/`$executeRaw` inside `prisma.$transaction` for the conditional update + event insert.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): add os-service state machine with transactional event logging"
```

### Task 15: Fila and OS read routes

**Files:**
- Create: `app/api/fila/route.ts`, `app/api/os/route.ts` (GET for list-by-status), `app/api/mecanico/atual/route.ts`
- Test: `tests/api/fila.test.ts`

**Interfaces:**
- `GET /api/fila` (any authenticated profile): `SELECT * FROM vw_fila`, returns the score breakdown columns.
- `GET /api/os?status=em_andamento|concluidas_hoje` (balcão only): `em_andamento` = `status IN ('em_execucao','pausada')` joined with mecânico nome and `motivo_pausa`; `concluidas_hoje` = `status = 'concluida' AND concluido_em::date = (now() AT TIME ZONE 'America/Fortaleza')::date`.
- `GET /api/mecanico/atual` (mecânico only): the caller's `em_execucao` order (if any) and all their `pausada` orders.
- Consumes: `lib/auth.ts` (session/profile check), `lib/db.ts`.

- [ ] **Step 1: Write failing tests** for each route: unauthenticated → 401; `/api/os?status=...` from a mecânico session → 403; correct profile returns the expected shape.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the three routes.**

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): add fila, os-by-status and mecanico atual read routes"
```

### Task 16: OS write routes (balcão)

**Files:**
- Create: `app/api/os/route.ts` (POST, added alongside the GET from Task 15), `app/api/os/[id]/route.ts` (PATCH), `app/api/os/[id]/cancelar/route.ts` (POST)
- Test: `tests/api/os-balcao.test.ts`

**Interfaces:**
- `POST /api/os` (balcão): validates `osCreateSchema`, calls `criarOs`, returns 201 + created row.
- `PATCH /api/os/:id` (balcão): validates `osEditSchema`, calls `editarOs`, returns 200 or 409 (`TransicaoInvalidaError`) if not `na_fila`.
- `POST /api/os/:id/cancelar` (balcão): optional `{ motivo }`, calls `cancelarOs`, returns 200 or 409 if order is `em_execucao`/`concluida`/already `cancelada`.
- Consumes: `lib/os-service.ts` (Task 14), `lib/schemas.ts` (Task 10).

- [ ] **Step 1: Write failing tests** covering: create → 201; edit a `na_fila` order → 200; edit an `em_execucao` order → 409; cancel a `pausada` order → 200; cancel an `em_execucao` order → 409 with no new `os_eventos` row.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the three handlers**, each catching `TransicaoInvalidaError` and responding `{ erro, codigo: "TRANSICAO_INVALIDA" }` with status 409.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): add create, edit and cancel OS routes for balcao"
```

### Task 17: OS action routes (mecânico) + ownership isolation

**Files:**
- Create: `app/api/os/pegar-proximo/route.ts`, `app/api/os/[id]/pausar/route.ts`, `app/api/os/[id]/retomar/route.ts`, `app/api/os/[id]/devolver/route.ts`, `app/api/os/[id]/concluir/route.ts`
- Test: `tests/api/os-mecanico.test.ts`

**Interfaces:**
- `POST /api/os/pegar-proximo` (mecânico): calls `pegarProximo(mecanicoId)`; 200 + row, 204 if queue empty, 409 if the mechanic already owns an `em_execucao` order.
- `POST /api/os/:id/pausar` (mecânico dono): validates `pausarSchema`, calls `pausarOs`.
- `POST /api/os/:id/retomar` (mecânico dono): calls `retomarOs`; 409 if the mechanic already has another `em_execucao` order.
- `POST /api/os/:id/devolver` (mecânico dono **ou** balcão): calls `devolverOs` with the appropriate caller identity.
- `POST /api/os/:id/concluir` (mecânico dono): calls `concluirOs`.
- All five check that the order's `mecanico_id` matches the session's `mecanicoId` (for mechanic-only routes) — ownership is enforced in the SQL `WHERE` clause inside `os-service.ts`, so a mismatch surfaces as the same 409 as any other failed transition.
- Consumes: `lib/os-service.ts` (Task 14).

- [ ] **Step 1: Write failing tests**, including: mechanic A tries to `pausar`/`concluir`/`devolver` an order owned by mechanic B → 409, order's `mecanico_id` unchanged, no event row written; fila with orders, `pegar-proximo` with no eligible mechanic session → 401; empty fila → 204.

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement the five handlers**, translating `TransicaoInvalidaError` to 409 and a `null` result from `pegarProximo` to 204.

- [ ] **Step 4: Run tests to verify they pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): add mecanico action routes with ownership enforcement"
```

---

# Marco 4 — Tela do balcão

### Task 18: `hooks/useFila.ts` and `lib/api-client.ts`

**Files:**
- Create: `lib/api-client.ts` (thin `fetch` wrapper that throws on non-2xx with the `{ erro, codigo }` body attached)
- Create: `hooks/useFila.ts`, `hooks/useOs.ts` (list by status)
- Create: `app/providers.tsx` (TanStack `QueryClientProvider`, wired into `app/layout.tsx`)

**Interfaces:**
- `useFila()`: `useQuery` on `["fila"]` calling `GET /api/fila`, `refetchInterval: 5000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true`.
- `useOsPorStatus(status: "em_andamento" | "concluidas_hoje")`: same polling config against `GET /api/os?status=...`.
- Consumes: `app/api/fila`, `app/api/os` (Task 15).

- [ ] **Step 1: Write a failing component test** (React Testing Library + MSW or a fetch mock) asserting `useFila` renders the rows returned by a mocked `/api/fila`.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `api-client.ts`, the two hooks, and `providers.tsx`.**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(front): add TanStack Query provider and fila/os hooks"
```

### Task 19: Balcão login page

**Files:**
- Create: `app/balcao/login/page.tsx`, `components/balcao/FormularioLoginBalcao.tsx`

**Interfaces:**
- Form with a single password field, React Hook Form + `loginBalcaoSchema`, `onSubmit` posts to `/api/auth/balcao`, on success `router.push("/balcao")`, on 401 shows "Senha incorreta" inline.
- Consumes: `lib/schemas.ts` (Task 10), `app/api/auth/balcao` (Task 12).

- [ ] **Step 1: Build the page and form component.**

- [ ] **Step 2: Manually verify in the browser**: wrong password shows the error, correct password (from `.env`) redirects to `/balcao`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add balcao login page"
```

### Task 20: Nova OS form (left column)

**Files:**
- Create: `components/balcao/FormularioNovaOs.tsx`
- Modify: `app/balcao/page.tsx` (two-column layout, left slot)

**Interfaces:**
- Form fields: placa, modelo, cliente_nome, cliente_telefone, descricao, tipo_servico (select populated from a `useTiposServico()` hook hitting a new minimal `GET /api/tipos-servico` route — add this route now, public-to-authenticated, since the spec's API table omits it but the form needs it), prazo (optional datetime picker). Uses `osCreateSchema` + React Hook Form. On success: clears the form, invalidates `["fila"]`, and visually highlights the newly created row (pass its id up via a callback / shared state to the Fila tab).
- Consumes: `lib/schemas.ts`, `POST /api/os` (Task 16).

- [ ] **Step 1: Add `app/api/tipos-servico/route.ts`** (`GET`, any authenticated profile, returns active `tipos_servico`).

- [ ] **Step 2: Build the form component and wire it into `/balcao`'s left column.**

- [ ] **Step 3: Manually verify**: submitting a valid OS clears the form and the new order appears in the Fila tab (built in Task 21) within 5s.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(front): add nova OS form on balcao panel"
```

### Task 21: Fila / Em andamento / Concluídas hoje tabs

**Files:**
- Create: `components/balcao/AbaFila.tsx`, `components/balcao/AbaEmAndamento.tsx`, `components/balcao/AbaConcluidasHoje.tsx`, `components/balcao/LinhaOsExpandivel.tsx` (score breakdown on expand)
- Modify: `app/balcao/page.tsx` (right column, shadcn `Tabs`)

**Interfaces:**
- `AbaFila` renders `useFila()` rows ordered as returned (already sorted by the view), columns: posição, número, placa, modelo, tipo, tempo de espera, prazo; expanding a row shows `pontos_tipo`/`pontos_espera`/`pontos_prazo`/`score`.
- `AbaEmAndamento` renders `useOsPorStatus("em_andamento")`, showing mecânico nome and `motivo_pausa` for paused orders.
- `AbaConcluidasHoje` renders `useOsPorStatus("concluidas_hoje")`.
- Times displayed in `America/Fortaleza` (use `Intl.DateTimeFormat` with that timezone, not the browser's local zone).
- Consumes: hooks from Task 18.

- [ ] **Step 1: Build the three tab components and the expandable row.**

- [ ] **Step 2: Manually verify**: create two OS with different tipos and confirm the higher-weight one is on top of the Fila tab; expand a row and confirm the score breakdown sums to the total.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add balcao fila, em-andamento and concluidas-hoje tabs"
```

### Task 22: Editar / Cancelar / Devolver actions from balcão

**Files:**
- Create: `components/balcao/DialogoEditarOs.tsx`, `components/balcao/DialogoCancelarOs.tsx`
- Modify: `AbaFila.tsx` (edit/cancel buttons), `AbaEmAndamento.tsx` (devolver/cancel buttons for paused rows)

**Interfaces:**
- Edit dialog reuses `osEditSchema` + `FormularioNovaOs`'s field set pre-filled; submits `PATCH /api/os/:id`.
- Cancel dialog: optional motivo textarea; submits `POST /api/os/:id/cancelar`; shadcn `AlertDialog` confirmation before submit.
- Devolver button on a paused row (balcão-initiated): `POST /api/os/:id/devolver`.
- All three invalidate `["fila"]` and the relevant `["os", status]` query on success; a 409 response shows a toast "A OS mudou de estado, atualize a tela."

- [ ] **Step 1: Build the two dialogs and wire the buttons.**

- [ ] **Step 2: Manually verify**: editing a `na_fila` order updates it in place; attempting to edit/cancel after a mechanic has picked it up shows the 409 toast instead of silently failing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add edit, cancel and devolver actions on balcao panel"
```

---

# Marco 5 — Tela do mecânico

### Task 23: Mecânico login (nome + PIN)

**Files:**
- Create: `app/mecanico/login/page.tsx`, `components/mecanico/SeletorMecanico.tsx`, `components/mecanico/TecladoPin.tsx`

**Interfaces:**
- `SeletorMecanico`: fetches `GET /api/mecanicos`, renders large name buttons.
- `TecladoPin`: on-screen numeric keypad, 4-digit entry, auto-submits at length 4 by posting `loginMecanicoSchema`-shaped body to `/api/auth/mecanico`; on 401 shakes/clears and shows "PIN incorreto"; on 429 shows "Muitas tentativas, aguarde alguns minutos."
- On success: `router.push("/mecanico")`.
- Consumes: `GET /api/mecanicos`, `POST /api/auth/mecanico` (Task 12).

- [ ] **Step 1: Build the two-step login flow (name selection → PIN keypad).**

- [ ] **Step 2: Manually verify on a phone-width viewport**: name selection and keypad buttons are comfortably tappable (≥48px), wrong PIN shows the error, 5 wrong attempts then a correct one still shows the lockout message.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add mecanico login with name selection and PIN keypad"
```

### Task 24: `hooks/useMinhasOs.ts` + `hooks/useConexao.ts`

**Files:**
- Create: `hooks/useMinhasOs.ts`, `hooks/useConexao.ts`

**Interfaces:**
- `useMinhasOs()`: `useQuery(["mecanico-atual"], ...)` against `GET /api/mecanico/atual`, same polling config as `useFila`.
- `useConexao()`: tracks the timestamp of the last successful query (subscribing to the query cache / `onSuccess`); exposes `{ conectado: boolean }`, `true` while the last success was under 15s ago (per the spec's indicator rule), recomputed on an interval.
- Consumes: `GET /api/mecanico/atual` (Task 15).

- [ ] **Step 1: Write a failing test** for `useConexao` transitioning from `conectado: true` to `false` after 15s of no successful fetch (using fake timers).

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement both hooks.**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(front): add useMinhasOs and useConexao hooks"
```

### Task 25: Mecânico card principal + Pegar próximo

**Files:**
- Create: `components/mecanico/CardPrincipal.tsx`, `components/mecanico/BotaoPegarProximo.tsx`
- Modify: `app/mecanico/page.tsx`

**Interfaces:**
- If `useMinhasOs()` has an `em_execucao` order: show número, placa, modelo, tipo, descrição, elapsed time since `iniciado_em` (live-ticking), buttons **Pausar** and **Concluir**.
- Else: full-width **Pegar próximo** button showing a preview of the top-of-queue order (from `useFila()`'s first row); on tap, `POST /api/os/pegar-proximo`; 204 → toast "Fila vazia"; 409 → toast explaining the mechanic already has an order in progress, then refetch `useMinhasOs`.
- Consumes: hooks from Task 24, `POST /api/os/pegar-proximo` (Task 17).

- [ ] **Step 1: Build `CardPrincipal` and `BotaoPegarProximo`.**

- [ ] **Step 2: Manually verify**: with the fila seeded, tapping "Pegar próximo" assigns the highest-score order and immediately shows the card; a second mechanic's phone (second browser session) stops offering that order within one poll cycle.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add mecanico card principal and pegar-proximo flow"
```

### Task 26: Pausar / Retomar / Devolver / Concluir UI

**Files:**
- Create: `components/mecanico/DialogoPausar.tsx` (3 radio reasons + "outro" textarea), `components/mecanico/SecaoMinhasPausadas.tsx`, `components/mecanico/DialogoConfirmacao.tsx` (generic, reused for concluir/devolver)

**Interfaces:**
- Pausar: opens `DialogoPausar`, submits `pausarSchema` to `POST /api/os/:id/pausar`.
- `SecaoMinhasPausadas`: lists the mechanic's `pausada` orders (from `useMinhasOs()`), each with **Retomar** (`POST /api/os/:id/retomar`, 409 → toast if another order is already `em_execucao`) and **Devolver à fila** (confirmation dialog → `POST /api/os/:id/devolver`).
- Concluir: confirmation dialog → `POST /api/os/:id/concluir`.
- All buttons ≥48px tall per the spec.
- Consumes: Task 17 routes, `DialogoConfirmacao`.

- [ ] **Step 1: Build the pause dialog, paused-orders section, and generic confirmation dialog.**

- [ ] **Step 2: Manually verify** the full lifecycle on one phone session: pegar próximo → pausar (with each of the 3 reasons) → retomar → concluir, and devolver à fila from the paused section.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add pausar, retomar, devolver and concluir actions"
```

### Task 27: Aba Fila (read-only) + indicador de conexão

**Files:**
- Create: `components/mecanico/AbaFilaMecanico.tsx`, `components/mecanico/IndicadorConexao.tsx`
- Modify: `app/mecanico/page.tsx` (tabs: principal / fila)

**Interfaces:**
- `AbaFilaMecanico`: read-only list from `useFila()`, each row showing why it's in that position (reuse the score breakdown from Task 21's expandable row, adapted for mobile).
- `IndicadorConexao`: green when `useConexao().conectado`, red with "Sem conexão — a fila pode estar desatualizada" otherwise; placed in the page header.

- [ ] **Step 1: Build both components and wire them into `/mecanico`.**

- [ ] **Step 2: Manually verify**: turn off the dev server briefly, confirm the indicator turns red within 15s and the message appears; bring it back and confirm it turns green again.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): add mecanico read-only fila tab and connection indicator"
```

---

# Marco 6 — Tempo real

### Task 28: `pg_notify` trigger migration

**Files:**
- Create: new migration `npx prisma migrate dev --name pg_notify_trigger --create-only`

**Interfaces:**
- Produces: `AFTER INSERT OR UPDATE ON ordens_servico` trigger calling `pg_notify('os_changes', json_build_object('id', NEW.id, 'status', NEW.status)::text)`.

- [ ] **Step 1: Write the migration SQL**

```sql
CREATE OR REPLACE FUNCTION notificar_mudanca_os() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('os_changes', json_build_object('id', NEW.id, 'status', NEW.status)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notificar_os_changes
  AFTER INSERT OR UPDATE ON ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION notificar_mudanca_os();
```

- [ ] **Step 2: Apply and manually verify** via `psql`: run `LISTEN os_changes;` in one session, `UPDATE`/`INSERT` an order in another, confirm the notification payload arrives.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): add pg_notify trigger on ordens_servico changes"
```

### Task 29: `lib/pg-listener.ts` singleton

**Files:**
- Create: `lib/pg-listener.ts`
- Test: `tests/lib/pg-listener.test.ts`

**Interfaces:**
- Produces: `getListener(): PgListener` — a module-level singleton holding one dedicated `pg` `Client` (not from Prisma's pool) that issues `LISTEN os_changes` on connect, exposes `on(callback: (payload: { id: string; status: string }) => void): () => void` (subscribe/unsubscribe), reconnects with backoff on connection loss.
- Consumes: `DATABASE_URL`.

- [ ] **Step 1: Write a failing test**: subscribe a callback, trigger a notify via a raw `pg` client in the test, assert the callback receives the parsed payload.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement `lib/pg-listener.ts`** using the `pg` package directly (add `npm install pg` + `@types/pg`), guarding the singleton against being re-created on every module reload in dev (`globalThis` guard, same pattern as the Prisma singleton).

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(lib): add singleton Postgres LISTEN client for os_changes"
```

### Task 30: `GET /api/eventos` SSE route

**Files:**
- Create: `app/api/eventos/route.ts`

**Interfaces:**
- Produces: a `GET` route returning a `text/event-stream` response; on each `os_changes` notification writes an SSE `data:` event with `{ id, status }`; sends a heartbeat comment every 25s; cleans up its listener subscription when the client disconnects (`request.signal.addEventListener("abort", ...)`).
- Consumes: `getListener()` from Task 29, `lib/auth.ts` for the "qualquer logado" check.

- [ ] **Step 1: Write a failing integration test** hitting the route with a mock request, triggering a DB change, and asserting the stream emits a correctly-shaped SSE chunk.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement the route** using a `ReadableStream` and `TextEncoder`.

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(api): add SSE eventos route backed by pg LISTEN/NOTIFY"
```

### Task 31: Client-side SSE wiring + polling falls back to 60s

**Files:**
- Create: `hooks/useEventosSSE.ts`
- Modify: `hooks/useFila.ts`, `hooks/useMinhasOs.ts` (drop `refetchInterval` to `60000`), `app/providers.tsx` (mount `useEventosSSE` once at the app root)

**Interfaces:**
- `useEventosSSE()`: opens one `EventSource` to `/api/eventos`; on each message, calls `queryClient.invalidateQueries(["fila"])` and `(["mecanico-atual"])`; reconnects automatically on error (native `EventSource` behavior) with a capped backoff if it fails repeatedly.
- Consumes: Task 30's route.

- [ ] **Step 1: Implement the hook and lower the two polling intervals to 60000.**

- [ ] **Step 2: Manually verify**: create an OS on `/balcao`, confirm it appears on `/mecanico`'s fila within ~1s (not waiting for the 60s poll); kill the SSE connection (devtools) and confirm the 60s poll still eventually picks up a change.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(front): wire SSE invalidation, reduce polling fallback to 60s"
```

---

# Marco 7 — PWA e deploy

### Task 32: `app/manifest.ts` + icons

**Files:**
- Create: `app/manifest.ts`, `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/icon-maskable-512.png`

**Interfaces:**
- Manifest: `name: "Fila da Oficina"`, `short_name: "Oficina"`, `start_url: "/mecanico"`, `display: "standalone"`, `orientation: "portrait"`, theme/background colors matching the mechanic UI, icons array referencing the three files above (the maskable one flagged `purpose: "maskable"`).

- [ ] **Step 1: Generate or source three placeholder icons** at the required sizes (a simple wrench/queue glyph is enough for the prototype) and place them under `public/icons/`.

- [ ] **Step 2: Write `app/manifest.ts`** per the shape above.

- [ ] **Step 3: Manually verify**: `npm run build && npm start`, open devtools Application tab, confirm the manifest is detected with no icon errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pwa): add manifest and icons"
```

### Task 33: Serwist service worker

**Files:**
- Create: `app/sw.ts`
- Modify: `next.config.ts` (wrap with `withSerwist`)

**Interfaces:**
- Precaches the app shell and a simple offline fallback page; explicitly excludes `/api/*` from any caching strategy; registers only when `process.env.NODE_ENV === "production"`.

- [ ] **Step 1: Install Serwist**

Run: `npm install @serwist/next serwist`

- [ ] **Step 2: Implement `app/sw.ts`** and wire `withSerwist` into `next.config.ts`, with the dev-mode disable switch.

- [ ] **Step 3: Manually verify**: `npm run build && npm start` over HTTPS (or `localhost`, which Chrome treats as a secure origin), confirm the service worker registers and `/api/fila` responses are never served from cache (check the Network tab).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pwa): add Serwist service worker with api bypass"
```

### Task 34: Install button + `/instalar` QR page

**Files:**
- Create: `components/mecanico/BotaoInstalar.tsx`, `app/instalar/page.tsx`
- Modify: `app/mecanico/login/page.tsx` (mount the install button)

**Interfaces:**
- `BotaoInstalar`: listens for `beforeinstallprompt`, stores the event, renders a button that calls `.prompt()`; hidden when the event never fires (iOS) in favor of a static instruction block ("Abra no Safari, toque em Compartilhar, depois em 'Adicionar à Tela de Início'").
- `/instalar`: server-renders a QR code (add `npm install qrcode` or generate via an inline SVG QR encoder) pointing at `${APP_URL}/mecanico`, meant to be printed and posted in the shop.

- [ ] **Step 1: Implement the install button with the `beforeinstallprompt` listener and iOS fallback copy.**

- [ ] **Step 2: Implement `/instalar`.**

- [ ] **Step 3: Manually verify on an Android/Chrome device or emulated device mode**: the install prompt appears and installing opens the app in standalone mode at `/mecanico`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(pwa): add install button and /instalar QR page"
```

### Task 35: Dockerfile, full docker-compose, Caddyfile

**Files:**
- Create: `Dockerfile` (multi-stage: deps → build → runner using the `standalone` output)
- Modify: `docker-compose.yml` (add `app` and `caddy` services alongside `db`)
- Create: `Caddyfile`

**Interfaces:**
- `app` service: built from `Dockerfile`, runs `prisma migrate deploy` then `node server.js` (the standalone entry point) on container start, depends on `db` being healthy, reads all env vars from `.env`.
- `caddy` service: reverse-proxies to `app`, automatic HTTPS via Let's Encrypt for the configured domain, `reverse_proxy` block includes `flush_interval -1` so `/api/eventos` SSE is not buffered.

- [ ] **Step 1: Write the multi-stage `Dockerfile`.**

- [ ] **Step 2: Add `app` and `caddy` to `docker-compose.yml`**, with a startup command (or small entrypoint script) running `npx prisma migrate deploy && node server.js`.

- [ ] **Step 3: Write the `Caddyfile`** with the domain placeholder and the unbuffered `reverse_proxy` directive.

- [ ] **Step 4: Manually verify locally**: `docker compose up --build`, confirm `/balcao` and `/mecanico` are reachable through Caddy (use `localhost` with Caddy's internal/self-signed cert for local verification) and that `/api/eventos` streams without stalling.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(infra): add Dockerfile, app/caddy compose services and Caddyfile"
```

### Task 36: `npm run mecanico:criar` script + backup cron doc

**Files:**
- Create: `scripts/mecanico-criar.ts`
- Modify: `package.json` (`"mecanico:criar": "tsx scripts/mecanico-criar.ts"`)
- Create: a short `infra/backup.md` note (or inline comment in `docker-compose.yml`) documenting the `pg_dump` cron command and the 7-day retention, per the spec — this is operational documentation, not application code, so a short doc file is appropriate here even though the project otherwise avoids extra docs.

**Interfaces:**
- `scripts/mecanico-criar.ts`: interactive CLI (reads `nome` and a 4-digit PIN from stdin) that creates a `mecanicos` row with a `bcryptjs`-hashed PIN, per the spec's "apenas via seed ou script" rule (no in-app screen for this).

- [ ] **Step 1: Implement the CLI script.**

- [ ] **Step 2: Manually verify**: run it, confirm a new mechanic appears in `GET /api/mecanicos` and can log in with the PIN entered.

- [ ] **Step 3: Write the backup cron line** (`0 3 * * * pg_dump ... | gzip > backup-$(date +\%F).sql.gz` plus a one-line retention cleanup) in `infra/backup.md`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ops): add mecanico:criar script and backup cron documentation"
```

---

## Self-Review Notes

- **Spec coverage:** every bullet in "Escopo" (dentro do protótipo), every table in "Modelo de dados", the full score formula, every row of the state-transition table, every API route, every screen element, polling → SSE evolution, auth rules, PWA requirements, infra requirements, and every item in "Critérios de aceite e testes" maps to a task above. The "Fora do protótipo" list and the five "Decisões em aberto" are intentionally left undone — they require a product decision, not an engineering task.
- **Proportion:** task bodies reference exact signatures, field lists and copied-verbatim SQL rather than full implementations; remaining prose is the minimum needed to remove ambiguity (exact column/field names, exact status strings, exact thresholds).
- **Milestone checkpoints:** the plan's own marco boundaries (1–7) are the spec's requested "parar ao fim de cada um para revisão" points — treat the end of each marco section above as a pause for human sign-off before starting the next, regardless of which execution mode is chosen below.
