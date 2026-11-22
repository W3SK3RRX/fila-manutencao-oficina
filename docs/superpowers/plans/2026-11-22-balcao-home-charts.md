# Balcão Home Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two charts to the balcão Home dashboard (`/balcao`) — a thin segmented bar showing the queue's status split, and a ranked horizontal bar chart showing the queue broken down by `tipo_servico` — using only data the app already fetches.

**Architecture:** Chart 1 (status split) is 4 plain, proportionally-sized `<div>`s — no charting library, just Tailwind, consuming the existing `useResumoBalcao()` hook and 4 new CSS custom properties (validated against this app's actual dark card surface, not eyeballed — see the spec). Chart 2 (queue by tipo) is a Recharts `BarChart` (the project's first and only use of Recharts; installed via plain `npm install`, no `shadcn add chart` wrapper — YAGNI, one chart doesn't need a reusable primitive), fed by a new pure helper function that groups `useFila()`'s rows by `useTiposServico()`'s names.

**Tech Stack:** Next.js 16 / React, TanStack Query (existing hooks), Recharts (new), Vitest (existing pattern for the one pure function that needs a test).

**Spec:** `docs/superpowers/specs/2026-11-22-balcao-home-charts-design.md` (approved). That doc has the full color-validation trail (the exact `validate_palette.js` commands run and their output) — read it for the *why* behind the exact hex values and ordering below; this plan only restates the *what*.

## Global Constraints

- No new API routes, no new SQL — both charts derive entirely from `useFila()`, `useTiposServico()`, and `useResumoBalcao()`, all already in use elsewhere in the app.
- No donut/pie chart anywhere — the status split is a **thin segmented bar** (plain `<div>`s), per the spec's color/form reasoning.
- The 4 status-segment colors and their order are **exact, validated values — do not change them**: `--chart-status-queue: #3987e5` (Na fila), `--chart-status-running: #e65c0f` (Em execução), `--chart-status-done: #239f72` (Concluída hoje), `--chart-status-paused: #ad8500` (Pausada), rendered **in this exact order** every time. This order is what clears the colorblind-safety validation the design doc ran — any other order (alphabetical, "lifecycle" order) puts the orange and amber segments next to each other, which failed validation repeatedly.
- `recharts` is the only new npm dependency for this plan.
- Reuse `useTiposServico()` (already fetched by `FormularioNovaOs`) for the list of tipo names — never a hardcoded array of tipo strings.

## Review Focus

- The 4 status-segment colors must render in the exact order given above — a reviewer should check the JSX/array order, not just that the 4 hexes are present.
- `BarraStatusFila`'s all-zero case (no OS in any of the 4 statuses) must not divide by zero or render an invisible 0-width bar — it must render *something* visible (e.g. a plain muted-colored bar).
- `GraficoFilaPorTipo` must always show all of `useTiposServico()`'s tipos, including ones with zero OS currently queued — not just the tipos present in `useFila()`'s current rows.
- Recharts' tooltip and axis tick colors must be explicitly set for the dark theme — Recharts' un-styled defaults are white-on-white and will be invisible on this app's dark surfaces if the style props are missed.
- `GraficoFilaPorTipo` calls two independent hooks (`useFila`, `useTiposServico`) — both loading states and both error states must be checked (not just one), matching this codebase's established `isLoading`/`isError` pattern in every other hook consumer.

---

## Task 1: `agruparFilaPorTipo` pure helper

**Files:**
- Create: `lib/fila-por-tipo.ts`
- Test: `tests/lib/fila-por-tipo.test.ts`

**Interfaces:**
- Produces: `agruparFilaPorTipo(fila: Pick<FilaLinha, "tipoServicoNome">[], tipos: Pick<TipoServicoLinha, "nome">[]): { tipo: string; quantidade: number }[]` — Task 3's `GraficoFilaPorTipo` imports and calls this with `useFila()`'s and `useTiposServico()`'s `.data` arrays.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/fila-por-tipo.test.ts — plain vitest, no jsdom/environment docblock
// needed (no React, no DOM): follow tests/lib/schemas.test.ts's plain style.
import { describe, it, expect } from "vitest";
import { agruparFilaPorTipo } from "@/lib/fila-por-tipo";

describe("agruparFilaPorTipo", () => {
  it("conta as OS da fila por tipo de serviço, incluindo tipos com zero OS, ordenado do maior para o menor", () => {
    const fila = [
      { tipoServicoNome: "Revisão" },
      { tipoServicoNome: "Moto parada (não roda)" },
      { tipoServicoNome: "Revisão" },
      { tipoServicoNome: "Revisão" },
    ];
    const tipos = [
      { nome: "Moto parada (não roda)" },
      { nome: "Conserto geral" },
      { nome: "Revisão" },
      { nome: "Estética / acessórios" },
    ];

    const resultado = agruparFilaPorTipo(fila, tipos);

    expect(resultado).toEqual([
      { tipo: "Revisão", quantidade: 3 },
      { tipo: "Moto parada (não roda)", quantidade: 1 },
      { tipo: "Conserto geral", quantidade: 0 },
      { tipo: "Estética / acessórios", quantidade: 0 },
    ]);
  });
});
```

(Expected order: descending by `quantidade`; ties keep `tipos`' original relative order — a stable sort, which `Array.prototype.sort` in modern JS already guarantees, so no extra tie-break logic is needed, just sort by `quantidade` descending.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx dotenv-cli -e .env.test -- vitest run tests/lib/fila-por-tipo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/fila-por-tipo'`.

- [ ] **Step 3: Implement `agruparFilaPorTipo` in `lib/fila-por-tipo.ts`**

```ts
export function agruparFilaPorTipo(
  fila: { tipoServicoNome: string }[],
  tipos: { nome: string }[],
): { tipo: string; quantidade: number }[] {
  return tipos
    .map((tipo) => ({
      tipo: tipo.nome,
      quantidade: fila.filter((os) => os.tipoServicoNome === tipo.nome).length,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx dotenv-cli -e .env.test -- vitest run tests/lib/fila-por-tipo.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All tests pass (148 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add lib/fila-por-tipo.ts tests/lib/fila-por-tipo.test.ts
git commit -m "feat: add agruparFilaPorTipo helper for the queue-by-tipo chart"
```

---

## Task 2: Status segmented bar (`BarraStatusFila`)

**Files:**
- Modify: `app/globals.css`
- Create: `components/balcao/BarraStatusFila.tsx`

**Interfaces:**
- Consumes: `useResumoBalcao()` (existing — `hooks/useResumoBalcao.ts`), fields `naFila`, `emExecucao`, `concluidasHoje`, `pausadas` (all `number`).
- Produces: `<BarraStatusFila />`, a self-contained component (calls its own hook, no props) — Task 4's Home page renders it with no arguments.
- Produces: the 4 CSS custom properties below, which Task 4 also reads directly (for the stat-card dots) via the same `var(--chart-status-...)` names.

- [ ] **Step 1: Add the 4 chart color tokens to `app/globals.css`**

In both the `:root` block and the `.dark` block (same values in both — this app has one dark theme, already set up this way for every other token), immediately after the existing `--ring: #F0671A;` line, add:

```css
  --chart-status-queue: #3987e5;
  --chart-status-running: #e65c0f;
  --chart-status-done: #239f72;
  --chart-status-paused: #ad8500;
```

Do not add these to the `@theme inline` block — they're referenced directly via `var(--chart-status-...)` in inline `style` props (Step 2), not as Tailwind utility classes, since only one component uses them.

- [ ] **Step 2: Create `components/balcao/BarraStatusFila.tsx`**

```tsx
"use client";

import { useResumoBalcao } from "@/hooks/useResumoBalcao";

// Ordem e cores validadas em docs/superpowers/specs/2026-11-22-balcao-home-charts-design.md
// (script de validação de contraste/daltonismo rodado contra a superfície
// escura real deste app, --card: #19191C) — NÃO reordenar: laranja e âmbar
// adjacentes falham a validação em qualquer combinação de luminosidade
// testada; só passam com âmbar no outro extremo da sequência.
const SEGMENTOS = [
  { chave: "naFila", cor: "var(--chart-status-queue)", rotulo: "Na fila" },
  { chave: "emExecucao", cor: "var(--chart-status-running)", rotulo: "Em execução" },
  { chave: "concluidasHoje", cor: "var(--chart-status-done)", rotulo: "Concluídas hoje" },
  { chave: "pausadas", cor: "var(--chart-status-paused)", rotulo: "Pausadas" },
] as const;

export function BarraStatusFila() {
  const { data, isLoading, isError } = useResumoBalcao();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError || !data) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar o resumo. Tente novamente em instantes.
      </p>
    );
  }

  const total = SEGMENTOS.reduce((soma, seg) => soma + data[seg.chave], 0);

  if (total === 0) {
    return <div className="h-2 w-full rounded-full bg-muted" title="Nenhuma OS registrada hoje" />;
  }

  return (
    <div className="flex h-2 w-full gap-0.5">
      {SEGMENTOS.filter((seg) => data[seg.chave] > 0).map((seg) => {
        const quantidade = data[seg.chave];
        const porcentagem = Math.round((quantidade / total) * 100);
        return (
          <div
            key={seg.chave}
            className="h-full rounded-full"
            style={{ backgroundColor: seg.cor, flexGrow: quantidade }}
            title={`${seg.rotulo}: ${quantidade} (${porcentagem}%)`}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `components/balcao/BarraStatusFila.tsx` (this component isn't rendered anywhere yet — Task 4 wires it in and does the real visual check — so this step only catches type errors, not a runtime/visual check).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: All tests pass (no new tests added by this task — pure presentational component, consistent with this codebase's existing convention of not unit-testing page-level/presentational components).

- [ ] **Step 5: Commit**

```bash
git add app/globals.css components/balcao/BarraStatusFila.tsx
git commit -m "feat: add the queue status segmented bar"
```

---

## Task 3: Queue-by-tipo bar chart (`GraficoFilaPorTipo`)

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npm install`)
- Create: `components/balcao/GraficoFilaPorTipo.tsx`

**Interfaces:**
- Consumes: Task 1's `agruparFilaPorTipo` (`lib/fila-por-tipo.ts`), `useFila()` (`hooks/useFila.ts`), `useTiposServico()` (`hooks/useTiposServico.ts`).
- Produces: `<GraficoFilaPorTipo />`, a self-contained component (no props) — Task 4's Home page renders it with no arguments.

- [ ] **Step 1: Install recharts**

Run: `npm install recharts`

- [ ] **Step 2: Create `components/balcao/GraficoFilaPorTipo.tsx`**

```tsx
"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useFila } from "@/hooks/useFila";
import { useTiposServico } from "@/hooks/useTiposServico";
import { agruparFilaPorTipo } from "@/lib/fila-por-tipo";

export function GraficoFilaPorTipo() {
  const { data: fila, isLoading: carregandoFila, isError: erroFila } = useFila();
  const { data: tipos, isLoading: carregandoTipos, isError: erroTipos } = useTiposServico();

  if (carregandoFila || carregandoTipos) {
    return <p className="text-sm text-muted-foreground">Carregando...</p>;
  }

  if (erroFila || erroTipos || !fila || !tipos) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar a fila por tipo. Tente novamente em instantes.
      </p>
    );
  }

  const dados = agruparFilaPorTipo(fila, tipos);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
        <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="tipo"
          width={170}
          tick={{ fill: "var(--foreground)", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--popover)",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
          labelStyle={{ color: "var(--popover-foreground)" }}
          itemStyle={{ color: "var(--popover-foreground)" }}
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="quantidade" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors from `components/balcao/GraficoFilaPorTipo.tsx` (not rendered anywhere yet — Task 4 wires it in and does the real visual check, including confirming Recharts' tooltip/axis colors actually read against the dark theme, per this plan's Review Focus).

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json components/balcao/GraficoFilaPorTipo.tsx
git commit -m "feat: add the queue-by-tipo bar chart"
```

(Only stage `package.json`/`package-lock.json` changes from the `recharts` install itself — if `package-lock.json` already had unrelated local modifications before this task started, use `git diff package-lock.json` to confirm the staged hunk is only the `recharts` addition.)

---

## Task 4: Wire both charts into the Home page

**Files:**
- Modify: `app/balcao/(painel)/page.tsx`

**Interfaces:**
- Consumes: Task 2's `<BarraStatusFila />`, Task 3's `<GraficoFilaPorTipo />`, and the 4 `--chart-status-*` CSS variables from Task 2 (for the stat-card dots).

- [ ] **Step 1: Add an optional `corPonto` prop to the page's local `CartaoResumo` helper**

Change its signature from `{ titulo, valor }: { titulo: string; valor: number | string }` to `{ titulo, valor, corPonto }: { titulo: string; valor: number | string; corPonto?: string }`, and change the title `<span>` to include a dot when `corPonto` is given:

```tsx
<span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
  {corPonto && <span className="size-1.5 rounded-full" style={{ backgroundColor: corPonto }} />}
  {titulo}
</span>
```

- [ ] **Step 2: Pass `corPonto` to the 4 relevant `<CartaoResumo>` calls**

```tsx
<CartaoResumo titulo="Na fila agora" valor={data.naFila} corPonto="var(--chart-status-queue)" />
<CartaoResumo titulo="Em execução" valor={data.emExecucao} corPonto="var(--chart-status-running)" />
<CartaoResumo titulo="Pausadas" valor={data.pausadas} corPonto="var(--chart-status-paused)" />
<CartaoResumo titulo="Concluídas hoje" valor={data.concluidasHoje} corPonto="var(--chart-status-done)" />
<CartaoResumo titulo="Espera da mais antiga" valor={data.esperaMaisAntiga} />
```

(Note `concluidasHoje`'s dot color is `--chart-status-done`, and it's listed 4th here to match this file's existing stat-card order — Task 2's internal `SEGMENTOS` array order for the bar itself is `naFila, emExecucao, concluidasHoje, pausadas`; the stat cards' left-to-right order does **not** need to match the bar's internal segment order, since the stat cards aren't adjacent colored fills — only the bar's own segment sequence is order-sensitive for the CVD validation.)

- [ ] **Step 3: Insert the new charts row**

Add `import { BarraStatusFila } from "@/components/balcao/BarraStatusFila";` and `import { GraficoFilaPorTipo } from "@/components/balcao/GraficoFilaPorTipo";`. Between the stat-card grid (`{data && (<div className="grid grid-cols-2 gap-4 lg:grid-cols-5">...)}`) and the shortcuts grid, add:

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
  <Card>
    <CardHeader>
      <CardTitle>Status da fila</CardTitle>
    </CardHeader>
    <CardContent>
      <BarraStatusFila />
    </CardContent>
  </Card>
  <Card>
    <CardHeader>
      <CardTitle>Fila por tipo de serviço</CardTitle>
    </CardHeader>
    <CardContent>
      <GraficoFilaPorTipo />
    </CardContent>
  </Card>
</div>
```

- [ ] **Step 4: Build and visually confirm the whole page**

Run: `npm run build` (confirms Recharts' client-only pieces don't break the route's build).
Then with the dev server running: load `/balcao`, confirm the layout reads top-to-bottom as: 5 stat cards (4 with a small color dot) → the two new chart cards side by side → the 2 shortcut cards, with no visual regressions to the existing cards.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add "app/balcao/(painel)/page.tsx"
git commit -m "feat: wire the status bar and tipo chart into the balcão Home dashboard"
```
