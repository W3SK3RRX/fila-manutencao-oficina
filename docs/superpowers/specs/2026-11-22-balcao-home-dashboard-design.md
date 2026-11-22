# Balcão: Home dashboard + split Abrir OS / Fila de OS screens — Design

## Intent / why

Today everything the balcão (counter) staff does lives on one page
(`/balcao`): a "Nova OS" form on the left, and a tabbed "Fila / Em andamento /
Concluídas hoje" panel on the right. The user wants a proper **Home** screen
instead — a quick-glance dashboard of what's happening with the queue right
now, plus shortcuts into two **new, separate** screens for the two actions
that page currently bundles together: opening a new OS, and tracking the
queue.

## Goals

- `/balcao` becomes a dashboard: a handful of at-a-glance numbers about the
  current state of OS, plus two prominent shortcuts.
- `/balcao/abrir` — new screen, just the "Nova OS" form.
- `/balcao/fila` — new screen, the existing 3 tabs (Fila / Em andamento /
  Concluídas hoje) — confirmed with the user: all three move here together,
  nothing stays behind on Home.
- All dashboard numbers are "free" — derived from data the app already
  fetches (`useFila`, `useOsPorStatus`), no new API route, no new SQL. Confirmed
  with the user: richer stats (avg. wait time, weekly totals, etc.) are an
  explicit non-goal for this round, to revisit later.
- Consistent navigation between the 3 screens (today there's no cross-page
  nav at all — `CabecalhoBalcao` is just a logo + "Sair").

## Non-goals / anti-goals

- No new database queries or API routes.
- No change to `/balcao/login` (it keeps standing alone, unauthenticated).
- No change to mechanic-side screens.
- Not a failure if the dashboard is simple today — it's meant to grow later.

## Dashboard metrics (all derived client-side, zero new backend)

| Card | Source |
|---|---|
| Na fila agora | `useFila().data.length` |
| Em execução | `useOsPorStatus("em_andamento")`, filtered `status === "em_execucao"` |
| Pausadas | same query, filtered `status === "pausada"` |
| Concluídas hoje | `useOsPorStatus("concluidas_hoje").data.length` |
| Espera da mais antiga na fila | `min(criadoEm)` across `useFila()`'s rows, formatted with the existing `formatarTempoEspera` |

These are combined in one new hook, `hooks/useResumoBalcao.ts`, composing the
three existing hooks (no new network calls beyond what Home already needs —
`useFila`/`useOsPorStatus` are the same queries the old combined page already
ran).

## Approaches considered (routing/layout)

1. **Route group + shared layout (chosen).** Move the 3 authenticated balcão
   pages into `app/balcao/(painel)/` — `page.tsx` (Home), `abrir/page.tsx`,
   `fila/page.tsx` — with one `app/balcao/(painel)/layout.tsx` rendering the
   header/nav once. Route groups don't change the URL, so paths stay exactly
   `/balcao`, `/balcao/abrir`, `/balcao/fila`. `/balcao/login` sits outside the
   group, untouched, so it never inherits the authenticated nav.
   *Why this one:* idiomatic Next.js App Router for "shared chrome across
   some but not all routes under a path," zero duplication of the
   header/nav across 3 pages.
2. Duplicate the header+nav JSX into each of the 3 page files. Rejected —
   repeats markup 3x and drifts over time.
3. One page with client-side tab-like routing (no real URLs). Rejected — the
   user explicitly asked for separate screens, and real routes are simpler to
   reason about, link to, and test.

## Approaches considered (handing off "just-created OS" to the Fila screen)

Today, creating an OS highlights its row inline in the Fila tab, via React
state lifted on the single shared page. Once "Abrir OS" and "Fila de OS" are
different routes, that lifted state can't cross the navigation.

1. **Query param (chosen).** The success message on `/balcao/abrir` gets a
   "Ver na fila →" link to `/balcao/fila?destaque=<id>`; `AbaFila` reads
   `destaque` via `useSearchParams()` instead of a prop from page state.
   *Why:* preserves today's "create several OS back-to-back without leaving
   the form" workflow (no forced redirect after every submit) while keeping
   the highlight available with one click when wanted.
2. Auto-redirect to `/balcao/fila` after every successful creation. Rejected
   — breaks rapid multi-entry at the counter, which is how a front-desk
   form is actually used.

## Navigation

`CabecalhoBalcao` gains 3 nav links (Home / Abrir OS / Fila de OS), active
route highlighted via `usePathname()`, alongside the existing logo/wordmark
and "Sair" button. Shown only inside the `(painel)` layout — never on
`/balcao/login`.

## What's left to the builder

- Exact Tailwind classes/spacing for the stat cards and nav links (follow the
  existing dark-theme tokens and `Card`/`Button` primitives already in the
  codebase — no new design tokens needed).
- Whether the two shortcut cards on Home show their own live counts (e.g. a
  small badge with the queue length on the "Ver fila" shortcut) — nice-to-have,
  data's already fetched by `useResumoBalcao`, left as a build-time call.
- Loading/error states for `useResumoBalcao` follow the same inline
  `isLoading`/`isError` pattern already used by every other hook consumer in
  this codebase (`AbaFila`, `AbaEmAndamento`, etc.) — nothing new to invent.
