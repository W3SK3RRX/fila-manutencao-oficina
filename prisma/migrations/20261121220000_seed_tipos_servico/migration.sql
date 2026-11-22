-- I4 (revisão final de branch): nenhuma migração inseria os 4 tipos_servico
-- fixos do spec, então um banco de produção novo (bootstrado só com
-- `prisma migrate deploy`, sem rodar `prisma/seed.ts` — que exige 3 PINs de
-- mecânico de teste, indesejado em produção) ficava sem nenhum tipo de
-- serviço: o formulário de Nova OS do balcão não tinha o que oferecer no
-- <Select> e não conseguia submeter nada.
--
-- Estes 4 valores são fixos pelo spec (não dados de teste), então pertencem
-- a uma migração — o mesmo padrão já usado para tudo que é regra de negócio
-- fixa neste projeto (calcular_score, pegar_proximo). `ON CONFLICT ... DO
-- NOTHING` torna a migração idempotente e segura de rodar sobre um banco
-- que já tenha esses nomes (ex.: ambiente de dev já seedado por
-- `prisma/seed.ts`, que faz upsert pelos mesmos nomes) — não haverá
-- duplicata, pois "nome" tem índice único (ver
-- 20261121022436_init_schema/migration.sql: tipos_servico_nome_key).
--
-- gen_random_uuid() é nativo do Postgres (core, desde a versão 13 — não
-- precisa da extensão pgcrypto), disponível na imagem postgres:16 usada por
-- docker-compose.yml.
INSERT INTO "tipos_servico" ("id", "nome", "peso", "ativo")
VALUES
  (gen_random_uuid(), 'Moto parada (não roda)', 100, true),
  (gen_random_uuid(), 'Conserto geral', 60, true),
  (gen_random_uuid(), 'Revisão', 30, true),
  (gen_random_uuid(), 'Estética / acessórios', 10, true)
ON CONFLICT ("nome") DO NOTHING;
