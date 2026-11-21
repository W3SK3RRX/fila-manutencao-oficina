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
