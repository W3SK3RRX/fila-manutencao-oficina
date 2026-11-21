CREATE OR REPLACE FUNCTION notificar_mudanca_os() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('os_changes', json_build_object('id', NEW.id, 'status', NEW.status)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER notificar_os_changes
  AFTER INSERT OR UPDATE ON ordens_servico
  FOR EACH ROW
  EXECUTE FUNCTION notificar_mudanca_os();
