# Fila de Manutenção (Oficina de Motos) — MotoMais

Protótipo de gestão de fila de manutenção para uma oficina de motos: painel
de balcão (`/balcao`) para registrar ordens de serviço e um PWA mobile-first
para mecânicos (`/mecanico`) pegarem e trabalharem a fila, ordenada
automaticamente por prioridade (tipo de serviço, tempo de espera e prazo).

Stack: Next.js (App Router) + PostgreSQL/Prisma + TanStack Query + Tailwind
e shadcn/ui, com PWA (Serwist) e tempo real via SSE (Postgres
`LISTEN`/`NOTIFY`). Veja o plano de implementação completo em
`docs/superpowers/plans/2026-11-20-fila-manutencao-oficina.md`.

## Desenvolvimento local

```bash
cp .env.example .env          # ajuste os valores conforme necessário
docker compose up -d db       # só o Postgres, para rodar o Next.js fora do Docker
npx prisma migrate deploy     # aplica as migrações (schema + seeds fixos de tipos_servico)
npm install
npm run dev
```

Para rodar os testes (sobem contra um segundo banco real, `motomais_test` —
ver `.env.example`):

```bash
cp .env .env.test             # e troque DATABASE_URL pelo valor de TEST_DATABASE_URL
npm test
```

## Deploy em produção

Veja `infra/deploy.md` (DNS, geração de segredos, `docker compose up -d
--build`, cadastro do primeiro mecânico) e `infra/backup.md` (backup diário
via `pg_dump`).
