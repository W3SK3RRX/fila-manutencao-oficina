# Moto & Mais — Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin the existing Next.js app (balcão + mecânico screens) with the dark, orange-accented brand system designed from the Moto & Mais logo, with zero changes to business logic or API behavior.

**Architecture:** The app already uses shadcn/ui primitives built on CSS custom properties (`--background`, `--primary`, `--destructive`, etc., consumed via Tailwind v4's `@theme inline`). Redefining those tokens in `app/globals.css` cascades automatically through every shadcn component (`Button`, `Badge`, `Card`, `Input`, `Select`, `Tabs`, dialogs) with no per-component edits needed. The app currently ships `dark:` Tailwind variants everywhere but **no code ever adds a `.dark` class to any element** — the app always renders in light mode today, and the `dark:` classes are dead. This plan makes dark the *only* theme by setting `:root` itself to the new dark palette (and mirroring the same values into `.dark` for forward-compatibility, in case theming is added later), then sweeps the small number of hardcoded `zinc`/`emerald` utility classes that bypass the token system.

Because this is a pure presentation change (no new business logic, no new branches), there is nothing to drive with a failing unit test. "Verification" for each task is: (a) the existing `npm test` suite stays green (it asserts behavior, never class names — confirmed, no test in `tests/` references `bg-zinc`, `emerald`, `bg-primary`, or badge variants), and (b) a visual check of the running dev server against the approved design artifact (https://claude.ai/artifact/AF9jiCpxen9BwiEXuvjmdM). Use the `run` skill to launch `npm run dev` and view each screen.

**Tech Stack:** Next.js 16 (App Router), Tailwind CSS v4 (`@theme inline` tokens), shadcn/ui (base-ui primitives), `next/font/google`.

**Spec:** Design artifact https://claude.ai/artifact/AF9jiCpxen9BwiEXuvjmdM (5 artboards: Paleta & Fundamentos, Balcão — Painel, Balcão — Login, Mecânico — Login, Mecânico — Painel), approved by the user prior to this plan.

## Global Constraints

- Single dark theme only — no light/dark toggle, no `prefers-color-scheme` branching.
- Brand orange `#F0671A` is the only primary/CTA color; red (`#F0525B`) stays reserved for destructive actions only.
- New semantic tokens: `--success: #34D399` (connection/success states), `--warning: #FFC866` (paused status).
- Headings/brand lockup use **Oswald** (weights 500/600/700); body/UI text uses **Inter** — both self-hosted via `next/font/google` (no external font `<link>` tags, no new npm dependency).
- No changes to `app/api/**`, `lib/**` business logic, Prisma schema, or any route behavior — presentation layer only.
- No new npm dependencies.
- Do not regenerate PWA icon PNGs (`public/icons/*`) or `app/favicon.ico` — out of scope for this plan (no image-resizing tool available); flag as a follow-up in the final report instead of attempting it.

## Review Focus

- The `.dark` CSS class block must end up with the *same* values as `:root` (not deleted, not left stale) — if someone adds a theme toggle later, it must not silently revert to the old light theme.
- `components/mecanico/TecladoPin.tsx` and `components/mecanico/CardPrincipal.tsx` already reference `border-primary`, `bg-primary`, `bg-secondary` with no hardcoded colors — confirm these are left untouched (no edit needed) and really do pick up the new orange via the token cascade, rather than being duplicated with new hardcoded values.
- `components/ui/badge.tsx`'s new `warning` variant must follow the exact same alpha-blend pattern as the existing `destructive` variant (`bg-destructive/10 text-destructive`) so it doesn't visually clash in weight/saturation with the other badge variants.
- The brand lockup (logo + "MOTO & MAIS") added to `CabecalhoBalcao` and both login pages must use real `<img>`/text markup (not a background-image div) so it's covered by the same accessibility rules as the rest of the app (`alt` text present).
- `npm test` must still pass after every task — a CSS/markup-only change that breaks a test means a test was unexpectedly coupled to presentation; investigate rather than silence it.

---

## Task 1: Design tokens & typography foundation

**Files:**
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: CSS custom properties `--background`, `--foreground`, `--card`, `--card-foreground`, `--popover`, `--popover-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground`, `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`, `--destructive`, `--success`, `--warning`, `--border`, `--input`, `--ring` — every later task and every existing shadcn primitive (`Button`, `Badge`, `Card`, `Input`, `Select`, `Tabs`, `Dialog`, `AlertDialog`) consumes these by name, unchanged.
- Produces: Tailwind utility classes `font-sans` (body, Inter) and `font-heading` (titles, Oswald) — already applied by `CardTitle`, `DialogTitle`, `AlertDialogTitle` with no further edits.
- Produces: Tailwind utility classes `text-success` / `bg-success` and `text-warning` / `bg-warning` for Task 3 to consume.

- [ ] **Step 1: Replace the font setup in `app/layout.tsx`**

Replace the Geist imports and variables:
```ts
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
```
with:
```ts
import { Inter, Oswald } from "next/font/google";
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const oswald = Oswald({ variable: "--font-oswald", subsets: ["latin"], weight: ["500", "600", "700"] });
```
and update the `<html>` className from `` `${geistSans.variable} ${geistMono.variable} h-full antialiased` `` to `` `${inter.variable} ${oswald.variable} h-full antialiased` ``.

- [ ] **Step 2: Replace the `@theme inline` font lines in `app/globals.css`**

Replace:
```css
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-heading: var(--font-sans);
```
with:
```css
  --font-sans: var(--font-inter);
  --font-heading: var(--font-oswald);
```

- [ ] **Step 3: Add the two new semantic color tokens to `@theme inline` in `app/globals.css`**

Add after the existing `--color-destructive: var(--destructive);` line:
```css
  --color-success: var(--success);
  --color-warning: var(--warning);
```

- [ ] **Step 4: Replace the `:root` color block in `app/globals.css`**

Replace every color line in `:root` (keep `--radius`, `--chart-*`, `--sidebar-*` untouched) with:
```css
  --background: #0B0B0D;
  --foreground: #F5F2EC;
  --card: #19191C;
  --card-foreground: #F5F2EC;
  --popover: #19191C;
  --popover-foreground: #F5F2EC;
  --primary: #F0671A;
  --primary-foreground: #1A0F08;
  --secondary: #232226;
  --secondary-foreground: #F5F2EC;
  --muted: #201F23;
  --muted-foreground: #A3A1A8;
  --accent: #2A1810;
  --accent-foreground: #FF9558;
  --destructive: #F0525B;
  --success: #34D399;
  --warning: #FFC866;
  --border: #2B2A2F;
  --input: #3A3940;
  --ring: #F0671A;
```

- [ ] **Step 5: Apply the identical replacement to the `.dark` block in `app/globals.css`**

Same key/value pairs as Step 4 (the `.dark` class is currently dead code — nothing in the app ever adds it — but per Review Focus it must mirror `:root` exactly, not be deleted, so a future theme toggle can't silently resurrect the old light palette).

- [ ] **Step 6: Run the dev server and visually confirm the token cascade**

Run: `npm run dev` (use the `run` skill). Open `/balcao/login` and `/mecanico` (after logging in) in a browser.
Expected: Background is near-black, "Entrar"/"Criar OS" buttons are orange with dark text, card titles render in the condensed Oswald face, body text is Inter — with no code changes yet beyond tokens/fonts, matching the design artifact's look even before Task 2/3's markup edits.

- [ ] **Step 7: Run the existing test suite**

Run: `npm test`
Expected: All tests still pass (no test asserts on color/font classes).

- [ ] **Step 8: Commit**

```bash
git add app/globals.css app/layout.tsx
git commit -m "style: apply Moto & Mais brand tokens and typography"
```

---

## Task 2: Brand lockup, logo asset, and background token sweep

**Files:**
- Create: `public/logo.jpg` (copy of `F:\DANIEL - PROJETOS\moto mais\logo.jpg`)
- Modify: `components/balcao/CabecalhoBalcao.tsx`
- Modify: `app/balcao/login/page.tsx`
- Modify: `app/mecanico/login/page.tsx`
- Modify: `app/balcao/page.tsx`
- Modify: `app/mecanico/page.tsx`
- Modify: `app/offline/page.tsx`
- Modify: `app/manifest.ts`

**Interfaces:**
- Consumes: Task 1's `--background`/`--foreground` tokens (via `bg-background`/`text-foreground` utilities) and `font-heading` (via a `brand` wrapper class or inline style using `font-family: var(--font-oswald)`... actually just use Tailwind's `font-heading` utility directly, already available from Task 1).
- Produces: a reusable visual pattern (logo `<img>` + "MOTO & MAIS" wordmark, "&" in `text-primary`) repeated identically in `CabecalhoBalcao`, `app/balcao/login/page.tsx`, and `app/mecanico/login/page.tsx` — no shared component is extracted (only 3 call sites, each with slightly different surrounding layout; extracting now would be premature per YAGNI).

- [ ] **Step 1: Copy the logo into `public/`**

Copy `F:\DANIEL - PROJETOS\moto mais\logo.jpg` to `public/logo.jpg` (sibling to the existing `public/icons/` directory).

- [ ] **Step 2: Add the brand lockup to `components/balcao/CabecalhoBalcao.tsx`**

Change the root `<div className="flex justify-end">` wrapper to `<div className="flex items-center justify-between">`, and add before the existing "Sair" `<Button>`:
```tsx
<div className="flex items-center gap-3">
  <img src="/logo.jpg" alt="Moto & Mais" className="size-10 rounded-lg object-cover" />
  <div className="flex flex-col leading-tight">
    <span className="font-heading text-lg font-bold tracking-wide">
      MOTO <span className="text-primary">&amp;</span> MAIS
    </span>
    <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
      Painel do Balcão
    </span>
  </div>
</div>
```

- [ ] **Step 3: Add the same brand lockup to `app/balcao/login/page.tsx`**

Above the existing `<Card>`, inside the same centering wrapper `<div>`, add a `<div className="mb-6 flex flex-col items-center gap-2">` containing the `<img>` (size-16 this time) + wordmark, matching Step 2's markup (adjusted size/classes for a vertical centered layout per the `BalcaoLogin` artboard). Change the wrapper `<div>`'s className from `"flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black"` to `"flex flex-1 flex-col items-center justify-center bg-background px-4"` (drop `dark:bg-black`, it's dead; use the token).

- [ ] **Step 4: Add the same brand lockup to `app/mecanico/login/page.tsx`**

Same pattern as Step 3, above the existing `<Card>`. Change the wrapper `<div>`'s className from `"flex flex-1 items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-black"` to `"flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-8"`.

- [ ] **Step 5: Sweep the remaining hardcoded background classes**

- `app/balcao/page.tsx`: change `"flex flex-1 flex-col gap-4 bg-zinc-50 p-4 dark:bg-black"` to `"flex flex-1 flex-col gap-4 bg-background p-4"`.
- `app/mecanico/page.tsx`: change `"flex flex-1 items-start justify-center bg-zinc-50 px-4 py-8 dark:bg-black"` to `"flex flex-1 items-start justify-center bg-background px-4 py-8"`.
- `app/offline/page.tsx`: change `"flex min-h-full flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center dark:bg-black"` to `"flex min-h-full flex-1 flex-col items-center justify-center gap-2 bg-background p-4 text-center"`, and change `"text-lg font-medium text-zinc-900 dark:text-zinc-50"` to `"text-lg font-medium text-foreground"`.

- [ ] **Step 6: Match the PWA theme color to the new palette**

In `app/manifest.ts`, change `background_color: "#fafafa"` to `background_color: "#0B0B0D"` and `theme_color: "#18181b"` to `theme_color: "#0B0B0D"`.

- [ ] **Step 7: Run the dev server and visually confirm**

With `npm run dev` still running, open `/balcao/login`, `/mecanico/login`, `/balcao`, and `/mecanico` (logged in). Confirm the logo + wordmark appear exactly as in the `BalcaoLogin`, `MecanicoLogin`, and `Main` (Balcão — Painel) artboards, and no page shows the old white/zinc background.

- [ ] **Step 8: Run the existing test suite**

Run: `npm test`
Expected: All tests still pass.

- [ ] **Step 9: Commit**

```bash
git add public/logo.jpg components/balcao/CabecalhoBalcao.tsx app/balcao/login/page.tsx app/mecanico/login/page.tsx app/balcao/page.tsx app/mecanico/page.tsx app/offline/page.tsx app/manifest.ts
git commit -m "style: add brand lockup and remove dead light-theme background classes"
```

---

## Task 3: Status semantics (warning badge + success color)

**Files:**
- Modify: `components/ui/badge.tsx`
- Modify: `components/balcao/AbaEmAndamento.tsx`
- Modify: `components/mecanico/IndicadorConexao.tsx`
- Modify: `components/balcao/FormularioNovaOs.tsx`
- Modify: `components/balcao/LinhaOsExpandivel.tsx`

**Interfaces:**
- Consumes: Task 1's `--color-success` / `--color-warning` tokens (`text-success`, `bg-success`, `text-warning`, `bg-warning` utilities).
- Produces: `Badge`'s `warning` variant (`variant="warning"`), consumed by `AbaEmAndamento.tsx`.

- [ ] **Step 1: Add a `warning` variant to `components/ui/badge.tsx`**

In `badgeVariants`'s `variants.variant` object, add (following the exact pattern of the existing `destructive` entry):
```ts
        warning:
          "bg-warning/15 text-warning [a]:hover:bg-warning/25",
```

- [ ] **Step 2: Use the new variant for the "pausada" status in `components/balcao/AbaEmAndamento.tsx`**

Change:
```tsx
<Badge variant={pausada ? "secondary" : "default"}>
```
to:
```tsx
<Badge variant={pausada ? "warning" : "default"}>
```
(`"Em execução"` keeps the `default` variant — `bg-primary`/`text-primary-foreground` — which is already the brand orange after Task 1, matching the `Main.dc.html` artboard's `badge-progress` look with no further change needed here.)

- [ ] **Step 3: Replace the hardcoded emerald connection color in `components/mecanico/IndicadorConexao.tsx`**

Change:
```tsx
conectado ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
```
to:
```tsx
conectado ? "text-success" : "text-destructive",
```
and change:
```tsx
conectado ? "bg-emerald-500" : "bg-destructive",
```
to:
```tsx
conectado ? "bg-success" : "bg-destructive",
```

- [ ] **Step 4: Replace the hardcoded emerald success message color in `components/balcao/FormularioNovaOs.tsx`**

Change:
```tsx
{sucesso && <p className="text-sm text-emerald-600 dark:text-emerald-400">{sucesso}</p>}
```
to:
```tsx
{sucesso && <p className="text-sm text-success">{sucesso}</p>}
```

- [ ] **Step 5: Replace the highlighted-row color in `components/balcao/LinhaOsExpandivel.tsx`**

Change:
```tsx
destacada && "bg-emerald-50 dark:bg-emerald-950/40",
```
to:
```tsx
destacada && "bg-primary/10",
```
(a just-created row is a "new item" highlight, not a success state — reuses the brand orange at low opacity instead of green, so it doesn't compete with the new `success`/`warning` semantics introduced above).

- [ ] **Step 6: Run the dev server and visually confirm**

With `npm run dev` running: create a new OS on `/balcao` (confirm the success message is now a clean green `text-success`, and the new row in the Fila tab highlights in a subtle orange tint, not green); pause an in-progress OS as a mechanic and check the "Em andamento" tab on `/balcao` shows an amber "Pausada" badge; check the mechanic header's connection indicator is green when connected.

- [ ] **Step 7: Run the existing test suite**

Run: `npm test`
Expected: All tests still pass.

- [ ] **Step 8: Commit**

```bash
git add components/ui/badge.tsx components/balcao/AbaEmAndamento.tsx components/mecanico/IndicadorConexao.tsx components/balcao/FormularioNovaOs.tsx components/balcao/LinhaOsExpandivel.tsx
git commit -m "style: introduce success/warning status colors, drop hardcoded emerald"
```

---

## Task 4: Full visual verification pass

**Files:** none (verification only).

- [ ] **Step 1: Run `npm run dev` (via the `run` skill) and walk every screen**

Check against the 5 artboards in https://claude.ai/artifact/AF9jiCpxen9BwiEXuvjmdM:
- `/balcao/login` vs. `BalcaoLogin.dc.html`
- `/balcao` (both the Nova OS form and all three Acompanhamento tabs) vs. `Main.dc.html`
- `/mecanico/login` (both steps: name picker and PIN pad) vs. `MecanicoLogin.dc.html`
- `/mecanico` (both tabs: Principal with an OS in progress, and Fila) vs. `MecanicoApp.dc.html`

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 3: Report**

Summarize what changed, and flag the out-of-scope follow-up noted in Global Constraints (PWA icon PNGs / favicon still use the old placeholder — regenerating them needs an image-resizing step not covered by this plan).
