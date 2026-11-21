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
