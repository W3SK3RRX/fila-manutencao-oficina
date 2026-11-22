# Balcão Home Dashboard + Split Screens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single combined `/balcao` page with 3 screens — a Home dashboard (`/balcao`), a standalone "Abrir OS" form (`/balcao/abrir`), and a standalone "Fila de OS" tracking screen (`/balcao/fila`) — sharing one header/nav, with the dashboard's numbers derived entirely from data the app already fetches.

**Architecture:** A Next.js App Router route group `app/balcao/(painel)/` holds the 3 authenticated screens plus one shared `layout.tsx` (header + nav); `app/balcao/login/page.tsx` sits outside the group, untouched. A new hook, `useResumoBalcao`, composes the existing `useFila`/`useOsPorStatus` hooks into the 5 dashboard numbers — no new API routes or SQL. The "just created this OS" highlight, which today is React state lifted on one shared page, becomes a `?destaque=<id>` query param carried by a link from the Abrir OS success message to the Fila screen.

**Tech Stack:** Next.js 16 (App Router, route groups), TanStack Query (existing hooks), Vitest + Testing Library (existing hook-test pattern).

**Spec:** `docs/superpowers/specs/2026-11-22-balcao-home-dashboard-design.md` (approved).

## Global Constraints

- URLs do not change for the user: `/balcao`, `/balcao/abrir`, `/balcao/fila` exist after this plan; `/balcao/login` is unaffected (route groups never appear in the URL).
- No new API routes, no new SQL — every dashboard number comes from `useFila()` and `useOsPorStatus()`, the same two hooks the old combined page already called.
- `/balcao/login` must never render the new header nav (it's outside the `(painel)` route group — don't add it there).
- No forced redirect after creating an OS — the counter staff must still be able to submit several OS back-to-back from `/balcao/abrir` without being bounced to another page each time (confirmed with the user).
- Match the existing dark-theme tokens and `Card`/`Button`/`Badge` primitives already in the codebase — no new design tokens, no new npm dependencies.

## Review Focus

- Deleting `app/balcao/page.tsx` and adding `app/balcao/(painel)/page.tsx` must land in the same task/commit and must actually serve `/balcao` correctly afterward (not just "route groups work in theory" — load the page).
- `useSearchParams()` inside `AbaFila` (a client component) needs a `<Suspense>` boundary in `app/balcao/(painel)/fila/page.tsx`, or `next build` fails — verify with an actual build, not just `npm test`.
- `FormularioNovaOs`'s removed `onOsCriada` prop must have zero remaining references anywhere (grep after the edit, not just before) — a stale prop masks broken wiring.
- The "Ver na fila" link must only appear next to a success message for the OS just created in *this* submit, and must not point at a stale id after a later submit (clear the id alongside the existing `sucesso`/`erroEnvio` reset at the top of `onSubmit`).
- `/balcao/login` must be checked directly after the `CabecalhoBalcao` nav is added — it must look exactly as before (no nav, no new links), since it's a sibling of the route group, not a member.

---

## Task 1: `useResumoBalcao` hook

**Files:**
- Create: `hooks/useResumoBalcao.ts`
- Test: `tests/hooks/useResumoBalcao.test.tsx`

**Interfaces:**
- Consumes: `useFila` (`hooks/useFila.ts`, returns `FilaLinha[]` with `criadoEm: unknown` via its index signature), `useOsPorStatus` (`hooks/useOs.ts`, returns `OsLinha[]` with `status: string`), `formatarTempoEspera` (`lib/format.ts`, `(criadoEm: string | Date) => string`).
- Produces: `useResumoBalcao(): { isLoading: boolean; isError: boolean; data: ResumoBalcao | undefined }` and the exported `ResumoBalcao` interface (`naFila: number; emExecucao: number; pausadas: number; concluidasHoje: number; esperaMaisAntiga: string;`) — Task 2's Home page imports both the hook and the type.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/hooks/useResumoBalcao.test.tsx — mirror tests/hooks/useFila.test.tsx's
// Wrapper/afterEach exactly (jsdom environment docblock, QueryClientProvider
// wrapper, manual `cleanup()` + `vi.unstubAllGlobals()` in afterEach).
describe("useResumoBalcao", () => {
  it("combina fila, em_andamento e concluidas_hoje nos números do resumo", async () => {
    const agora = Date.now();
    const filaRows = [
      { id: "1", criadoEm: new Date(agora - 130 * 60000).toISOString(), tipoServicoNome: "x", pontosTipo: 0, pontosEspera: 0, pontosPrazo: 0, score: 0 },
      { id: "2", criadoEm: new Date(agora - 20 * 60000).toISOString(), tipoServicoNome: "x", pontosTipo: 0, pontosEspera: 0, pontosPrazo: 0, score: 0 },
    ];
    const emAndamentoRows = [
      { id: "3", status: "em_execucao" },
      { id: "4", status: "em_execucao" },
      { id: "5", status: "pausada" },
    ];
    const concluidasRows = [{ id: "6", status: "concluida" }];

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("status=em_andamento")) {
        return new Response(JSON.stringify(emAndamentoRows), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("status=concluidas_hoje")) {
        return new Response(JSON.stringify(concluidasRows), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify(filaRows), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    function ResumoDeTeste() {
      const { data, isLoading } = useResumoBalcao();
      if (isLoading || !data) return <div>carregando</div>;
      return (
        <ul>
          <li>naFila:{data.naFila}</li>
          <li>emExecucao:{data.emExecucao}</li>
          <li>pausadas:{data.pausadas}</li>
          <li>concluidasHoje:{data.concluidasHoje}</li>
          <li>esperaMaisAntiga:{data.esperaMaisAntiga}</li>
        </ul>
      );
    }

    render(<Wrapper><ResumoDeTeste /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText("naFila:2")).toBeInTheDocument();
      expect(screen.getByText("emExecucao:2")).toBeInTheDocument();
      expect(screen.getByText("pausadas:1")).toBeInTheDocument();
      expect(screen.getByText("concluidasHoje:1")).toBeInTheDocument();
      expect(screen.getByText("esperaMaisAntiga:2h10")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx dotenv-cli -e .env.test -- vitest run tests/hooks/useResumoBalcao.test.tsx`
Expected: FAIL — `Cannot find module '@/hooks/useResumoBalcao'` (or similar, since the hook doesn't exist yet).

- [ ] **Step 3: Implement `useResumoBalcao(): { isLoading: boolean; isError: boolean; data: ResumoBalcao | undefined }` in `hooks/useResumoBalcao.ts`**

Compose `useFila()`, `useOsPorStatus("em_andamento")`, `useOsPorStatus("concluidas_hoje")`. `isLoading`/`isError` are the OR of the three. When any is loading/erroring, or any `.data` is still undefined, return `{ isLoading, isError, data: undefined }`. Otherwise derive: `emExecucao`/`pausadas` via `.filter((os) => os.status === "...").length` on the em_andamento array; `naFila`/`concluidasHoje` via `.length`; `esperaMaisAntiga` via a `reduce` over the fila array picking the smallest `criadoEm` (oldest = longest wait; cast each row's `criadoEm` as `string`, same pattern as `components/balcao/LinhaOsExpandivel.tsx`'s `os.criadoEm as string`), formatted with `formatarTempoEspera`, or `"—"` when the fila array is empty.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx dotenv-cli -e .env.test -- vitest run tests/hooks/useResumoBalcao.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All tests pass (147 existing + 1 new).

- [ ] **Step 6: Commit**

```bash
git add hooks/useResumoBalcao.ts tests/hooks/useResumoBalcao.test.tsx
git commit -m "feat: add useResumoBalcao hook for the balcão dashboard"
```

---

## Task 2: Route split — Home dashboard, Abrir OS, Fila de OS, shared nav

**Files:**
- Delete: `app/balcao/page.tsx`
- Create: `app/balcao/(painel)/layout.tsx`
- Create: `app/balcao/(painel)/page.tsx` (Home dashboard)
- Create: `app/balcao/(painel)/abrir/page.tsx`
- Create: `app/balcao/(painel)/fila/page.tsx`
- Modify: `components/balcao/CabecalhoBalcao.tsx`

**Interfaces:**
- Consumes: Task 1's `useResumoBalcao()` and `ResumoBalcao` type, in the Home page only.
- Consumes: existing `FormularioNovaOs` (no props, per Task 3 below — written now assuming no props since Task 3 removes the only one it has), `AbaFila`/`AbaEmAndamento`/`AbaConcluidasHoje` (unchanged in this task — `AbaFila` still takes no `osRecemCriadaId` prop here; Task 3 is what makes it read `?destaque=` itself).
- Produces: the route group's shared chrome — later tasks don't touch `layout.tsx` or the nav again.

- [ ] **Step 1: Create the shared layout, `app/balcao/(painel)/layout.tsx`**

```tsx
import type { ReactNode } from "react";
import { CabecalhoBalcao } from "@/components/balcao/CabecalhoBalcao";

export default function LayoutPainelBalcao({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-4 bg-background p-4">
      <CabecalhoBalcao />
      {children}
    </div>
  );
}
```

(One line of why, as a comment: route group `(painel)` groups the 3 authenticated screens under one header/nav without changing any URL; `/balcao/login` is a sibling outside the group and keeps its own standalone wrapper.)

- [ ] **Step 2: Add nav links to `components/balcao/CabecalhoBalcao.tsx`**

Add `import Link from "next/link";`, `import { usePathname } from "next/navigation";`, `import { cn } from "cn";`. Restructure the outer `<div>` to 3 sections (brand lockup unchanged · new `<nav>` · existing Sair button):

```tsx
<nav className="flex flex-wrap items-center gap-1">
  <LinkNav href="/balcao" label="Home" />
  <LinkNav href="/balcao/abrir" label="Abrir OS" />
  <LinkNav href="/balcao/fila" label="Fila de OS" />
</nav>
```

with a small helper in the same file:

```tsx
function LinkNav({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const ativo = pathname === href;
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        ativo ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
```

- [ ] **Step 3: Create `app/balcao/(painel)/page.tsx` (Home dashboard)**

```tsx
"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { useResumoBalcao } from "@/hooks/useResumoBalcao";

export default function PaginaHomeBalcao() {
  const { data, isLoading, isError } = useResumoBalcao();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Resumo da fila de manutenção em tempo real.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar o resumo. Tente novamente em instantes.
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <CartaoResumo titulo="Na fila agora" valor={data.naFila} />
          <CartaoResumo titulo="Em execução" valor={data.emExecucao} />
          <CartaoResumo titulo="Pausadas" valor={data.pausadas} />
          <CartaoResumo titulo="Concluídas hoje" valor={data.concluidasHoje} />
          <CartaoResumo titulo="Espera da mais antiga" valor={data.esperaMaisAntiga} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Abrir OS</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Cadastre uma nova ordem de serviço para entrar na fila.
            </p>
            <Link href="/balcao/abrir" className={buttonVariants({ className: "self-start" })}>
              Abrir nova OS
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fila de OS</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Acompanhe a fila, OS em andamento e concluídas hoje.
            </p>
            <Link href="/balcao/fila" className={buttonVariants({ variant: "outline", className: "self-start" })}>
              Ver fila de OS
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CartaoResumo({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titulo}
        </span>
        <span className="font-heading text-2xl font-bold tabular-nums">{valor}</span>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create `app/balcao/(painel)/abrir/page.tsx`**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioNovaOs } from "@/components/balcao/FormularioNovaOs";

export default function PaginaAbrirOs() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Abrir OS</CardTitle>
      </CardHeader>
      <CardContent>
        <FormularioNovaOs />
      </CardContent>
    </Card>
  );
}
```

No `"use client"` — `FormularioNovaOs` already declares it itself, and this page has no hooks of its own.

- [ ] **Step 5: Create `app/balcao/(painel)/fila/page.tsx`**

```tsx
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaFila } from "@/components/balcao/AbaFila";
import { AbaEmAndamento } from "@/components/balcao/AbaEmAndamento";
import { AbaConcluidasHoje } from "@/components/balcao/AbaConcluidasHoje";

export default function PaginaFilaOs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila de OS</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="fila">
          <TabsList>
            <TabsTrigger value="fila">Fila</TabsTrigger>
            <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
            <TabsTrigger value="concluidas_hoje">Concluídas hoje</TabsTrigger>
          </TabsList>
          <TabsContent value="fila">
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Carregando fila...</p>}>
              <AbaFila />
            </Suspense>
          </TabsContent>
          <TabsContent value="em_andamento">
            <AbaEmAndamento />
          </TabsContent>
          <TabsContent value="concluidas_hoje">
            <AbaConcluidasHoje />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
```

The `Suspense` around `<AbaFila />` is required once Task 3 makes it call `useSearchParams()` — added here so this task's build doesn't need touching again in Task 3.

- [ ] **Step 6: Delete the old combined page**

```bash
git rm "app/balcao/page.tsx"
```

- [ ] **Step 7: Build and visually confirm**

Run: `npm run build` (confirms the route group compiles — no "two files resolve to /balcao" conflict, no missing-Suspense error).
Then with `npm run dev` (or the already-running dev server) running: log in to `/balcao`, confirm it now shows the dashboard with 5 stat cards and the two shortcut cards; click "Abrir nova OS" → lands on `/balcao/abrir` with just the form; click "Ver fila de OS" → lands on `/balcao/fila` with the 3 tabs; click the Home/Abrir OS/Fila de OS nav links and confirm the active one is visually distinct. Load `/balcao/login` directly (log out first) and confirm it looks exactly as before — no nav, no dashboard chrome.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/balcao components/balcao/CabecalhoBalcao.tsx
git commit -m "feat: split balcão into Home dashboard, Abrir OS and Fila de OS screens"
```

---

## Task 3: "Ver na fila" handoff after creating an OS

**Files:**
- Modify: `components/balcao/FormularioNovaOs.tsx`
- Modify: `components/balcao/AbaFila.tsx`

**Interfaces:**
- `FormularioNovaOs` loses its only prop (`onOsCriada`) — becomes `export function FormularioNovaOs()`, no props at all.
- `AbaFila` loses its only prop (`osRecemCriadaId`) — becomes `export function AbaFila()`, reading the same value from `useSearchParams().get("destaque")` instead.

- [ ] **Step 1: Remove the `onOsCriada` prop and add the "Ver na fila" link in `components/balcao/FormularioNovaOs.tsx`**

Remove the `FormularioNovaOsProps` interface and the `onOsCriada` parameter; `export function FormularioNovaOs()` (no parameters, no props type). Add `import Link from "next/link";`. Add a new state `const [ultimaOsId, setUltimaOsId] = useState<string | null>(null);` alongside the existing `sucesso`/`erroEnvio` state. In `onSubmit`, reset it at the top next to the existing `setErroEnvio(null); setSucesso(null);` (i.e. add `setUltimaOsId(null);` there too), and set it on success next to `setSucesso(...)`: `setUltimaOsId(os.id);` (replacing the old `onOsCriada?.(os.id);` line). Change the success paragraph to:

```tsx
{sucesso && (
  <p className="text-sm text-success">
    {sucesso}{" "}
    {ultimaOsId && (
      <Link href={`/balcao/fila?destaque=${ultimaOsId}`} className="font-medium underline underline-offset-2">
        Ver na fila →
      </Link>
    )}
  </p>
)}
```

Update the file's header comment block: it currently documents `onOsCriada` at length (Task 21-era note about lifting state to `app/balcao/page.tsx`) — that page no longer exists, so rewrite that paragraph to describe the new query-param handoff to `/balcao/fila` instead.

- [ ] **Step 2: Switch `components/balcao/AbaFila.tsx` from a prop to the `destaque` search param**

Remove the `AbaFilaProps` interface and the `osRecemCriadaId` parameter. Add `import { useSearchParams } from "next/navigation";`. First line of the function body: `const searchParams = useSearchParams(); const osRecemCriadaId = searchParams.get("destaque");` — everything below (the `destacada={os.id === osRecemCriadaId}` line on `LinhaOsExpandivel`) stays exactly as it is. Update the file's header comment the same way as Step 1 (the old comment says the id is "elevado... mantido em app/balcao/page.tsx" — that's no longer true).

- [ ] **Step 3: Grep for stale references**

Run: `grep -rn "onOsCriada\|osRecemCriadaId" --include="*.tsx" --include="*.ts" .` (or the Grep tool equivalent) from the repo root.
Expected: no matches outside `FormularioNovaOs.tsx`'s and `AbaFila.tsx`'s own internal variable names (`ultimaOsId`/the local `osRecemCriadaId` const) — nothing is passed as a prop anywhere anymore.

- [ ] **Step 4: Visually confirm the end-to-end flow**

With the dev server running: go to `/balcao/abrir`, submit a new OS, confirm the success message shows "Ver na fila →"; click it; confirm it lands on `/balcao/fila` with the Fila tab active and that row visually highlighted (same highlight style as before this plan). Submit a second OS from `/balcao/abrir` without navigating away in between, and confirm the link now points at the *new* id (check the href) — the stale-link Review Focus item.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add components/balcao/FormularioNovaOs.tsx components/balcao/AbaFila.tsx
git commit -m "feat: hand off the just-created OS to /balcao/fila via a query param"
```
