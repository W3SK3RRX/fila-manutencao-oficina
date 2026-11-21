CREATE OR REPLACE FUNCTION calcular_score(
  peso int,
  criado_em timestamptz,
  prazo timestamptz,
  agora timestamptz
) RETURNS int AS $$
DECLARE
  pontos_espera int;
  pontos_prazo int;
  horas_restantes numeric;
BEGIN
  pontos_espera := floor(extract(epoch FROM (agora - criado_em)) / 60 / 5);

  IF prazo IS NULL THEN
    pontos_prazo := 0;
  ELSE
    horas_restantes := extract(epoch FROM (prazo - agora)) / 3600;
    IF horas_restantes < 0 THEN
      pontos_prazo := 80;
    ELSIF horas_restantes <= 2 THEN
      pontos_prazo := 40;
    ELSIF horas_restantes <= 4 THEN
      pontos_prazo := 20;
    ELSE
      pontos_prazo := 0;
    END IF;
  END IF;

  RETURN peso + pontos_espera + pontos_prazo;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
