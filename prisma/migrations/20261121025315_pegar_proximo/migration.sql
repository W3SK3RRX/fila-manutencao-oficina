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
