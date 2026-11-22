# Balcão Home — Charts Design

## Intent / why

The Home dashboard (`/balcao`) currently shows only 5 numeric stat cards. The
user asked to make it more visual with charts, scoped (per the user's own
choice) to **current-instant data only** — no new database history, nothing
deferred for later.

## Goals

- Add a visual at-a-glance read of the queue's status split (na fila / em
  execução / pausadas / concluídas hoje) — the same 4 counts already on the
  page, now also charted.
- Add a visual read of **what's piling up**: how many OS are waiting per
  `tipo_servico` — information the 5 stat cards don't show at all today.
- Zero new API routes, zero new SQL — same constraint as the rest of this
  dashboard. Both charts derive from hooks already in use (`useResumoBalcao`,
  `useFila`).
- Follow this project's `dataviz` skill method (form before color; validate
  the palette with the skill's script; don't eyeball).

## Non-goals / anti-goals

- No trend-over-time chart (explicitly deferred by the user — needs history
  the database doesn't keep yet).
- Not a failure if a later round adds the history-backed charts; this round
  only covers the free, current-instant data.

## Chart 1 — status split

**Form, decided against the dataviz skill's own table:** the request was
originally phrased as "a pizza/donut chart," but the skill's
`choosing-a-form.md` explicitly lists a donut/pie as the **wrong** answer for
"one whole split into ≤6 parts" (use a **segmented bar** instead) and for "a
single ratio" (use a **meter**). Here the split's exact figures are *already
printed* right above it (the 4 stat cards: "Na fila agora", "Em execução",
"Pausadas", "Concluídas hoje"), which is exactly the skill's trigger for the
**thin segmented bar, no text** variant: "the text beside it carries the
figures the reader needs... a swatch on each list row replaces the legend."
So: a single 8px-tall rounded bar, 4 colored segments proportional to the 4
counts, 2px gaps between segments, no text baked into the bar. Each of the
existing 4 stat cards gains a small color dot next to its label, matching the
segment color — that dot **is** the legend (per the skill: a swatch per row
replaces a separate legend box), so no extra legend block is added. Hover (or
focus) on a segment shows its name/count/share in a lightweight tooltip (the
skill requires every part's name, amount and share to be reachable by hover
or keyboard focus).

**Why hand-built, not a charting library:** 4 static proportional `<div>`s
with rounded ends and a gap need no axis, no scale, no responsive-container
machinery — pulling in a charting library for this one is unjustified
weight. Plain markup + Tailwind, matching how simple bars are already built
elsewhere in this codebase (e.g. `TecladoPin`'s pin-dot indicators).

**Color — computed, not eyeballed.** Ran
`dataviz`'s `scripts/validate_palette.js` against this app's actual dark card
surface (`--card: #19191C`, not the skill's generic default surface) for
several candidate sets before landing on one that passes every check:

| Segment | Hex (dark) | Source |
|---|---|---|
| Na fila | `#3987e5` | dataviz default categorical slot 1 (blue) — unused elsewhere in this app, so no clash |
| Em execução | `#e65c0f` | this app's own `--primary` orange (`#F0671A`), re-stepped darker to clear the categorical lightness band (OKLCH L must sit in 0.48–0.67; the UI's badge/button orange is tuned for use as a bright accent, not a filled chart segment) |
| Concluída hoje | `#239f72` | this app's own `--success` green (`#34D399`), re-stepped darker the same way |
| Pausada | `#ad8500` | this app's own `--warning` amber (`#FFC866`), re-stepped darker **and** re-ordered away from direct adjacency with the orange segment — the two hues are close enough (≈22° apart) that every attempt at validating them as *neighbors* failed the CVD/normal-vision floors no matter how much their lightness was tuned; moving amber to the far end of the segment order (next to green, not orange) was what actually passed |

Validated order for the segment sequence (fixed, this exact order, every
time the bar renders): **Na fila → Em execução → Concluída hoje → Pausada**.
`validate_palette.js "#3987e5,#e65c0f,#239f72,#ad8500" --mode dark --surface
"#19191C"` → all 5 checks PASS (worst adjacent CVD ΔE 9.1, worst
normal-vision ΔE 15.8, both clear of the floors).

Label-on-fill ink (for the hover tooltip's swatch, and the stat-card dots):
near-black (`--primary-foreground`, `#1A0F08`) — contrast-checked at 5.4–5.9:1
against all 4 segment hexes, vs. only 3.3–3.6:1 for white text on the same 4
(white fails normal-text AA; near-black passes comfortably, and this app
already uses near-black-on-bright-fill everywhere else, e.g. its primary
buttons).

These 4 new hexes are chart-only tokens (`--chart-status-queue`,
`--chart-status-running`, `--chart-status-done`, `--chart-status-paused`) —
they do not replace `--primary`/`--success`/`--warning` anywhere else in the
app; those keep their existing (lighter, text-tuned) values for badges and
status text.

## Chart 2 — queue by tipo de serviço

**Form:** a single nominal series (4 `tipo_servico` names, from the fixed seed
list: "Moto parada (não roda)", "Conserto geral", "Revisão", "Estética /
acessórios") compared by count → `choosing-a-form.md`'s **ranked horizontal
bars, largest first, one hue**. One series needs no legend (the bar's own
axis labels name each tipo); every bar takes the same hue.

**Color:** this app's own `--primary` orange (`#F0671A`), used at its normal
(undarkened) value — a single-series chart has no adjacency to protect
against, so no re-stepping is needed; this is literally the same orange as
every primary button/CTA in the app.

**Data:** grouped client-side from `useFila()`'s existing rows by
`tipoServicoNome`, counted. All 4 seeded tipos always render (even at count
0), so the chart's shape doesn't jump as counts change.

**Why a charting library here (unlike Chart 1):** this one needs a real
axis/scale and a per-bar hover tooltip with exact count — `shadcn`'s `chart`
component (thin Recharts wrapper, installed via `npx shadcn add chart`, the
same CLI this project already uses for every other `components/ui/*`
primitive) is the project-idiomatic way to get that, rather than hand-rolling
scale math.

## Layout

Inserted as a new 2-column row between the existing stat-card grid and the
existing shortcut cards on `/balcao`:

```
[ 5 stat cards, each of the first 4 now with a small color dot ]
[ Card: "Status da fila" — the thin segmented bar          ]  [ Card: "Fila por tipo de serviço" — ranked bars ]
[ Card: Abrir OS shortcut ]  [ Card: Fila de OS shortcut ]
```

## What's left to the builder

- Exact Tailwind spacing/sizing beyond the fixed specs above (8px bar height,
  2px gaps, 4px rounded corners on bar ends — from the dataviz skill's mark
  specs, not negotiable; everything else — card padding, gap sizes between
  the two new cards — follows the existing dashboard's spacing).
- The lightweight tooltip implementation for the segmented bar (a native
  `title` attribute is the minimum; a small custom hover popover matching the
  rest of the app's dialog/popover styling is nicer but not required for this
  round).
- Whether the ranked-bar chart's Y-axis shows tipo names in full or
  abbreviated at narrow widths — follow whatever `shadcn add chart`'s
  generated component defaults to; don't hand-tune unless it visibly clips.
