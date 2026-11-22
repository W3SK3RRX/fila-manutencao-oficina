# Backup do Postgres

Spec: `pg_dump` diário via cron no host, mantendo 7 dias.

## Cron (host, usuário com acesso ao Docker)

```cron
# Todo dia às 03:00 (TZ do host = America/Fortaleza): dump do banco do serviço `db`
0 3 * * * cd /opt/motomais && docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > /opt/motomais/backups/backup-$(date +\%F).sql.gz

# Retenção: remove backups com mais de 7 dias
30 3 * * * find /opt/motomais/backups -name 'backup-*.sql.gz' -mtime +6 -delete
```

Notas:

- `docker compose exec -T` roda o `pg_dump` dentro do container `db`, então não é preciso instalar cliente Postgres no host. `-T` desliga a alocação de TTY, necessário em cron.
- **Credenciais (I4/revisão final de branch):** a versão anterior desta nota
  tinha `-U motomais motomais` fixo no comando — funciona só por coincidência
  com os valores de exemplo de `.env.example`. O comando acima troca por
  `sh -c '... "$POSTGRES_USER" "$POSTGRES_DB"'`, lido de dentro do próprio
  container `db` (que já recebe `POSTGRES_USER`/`POSTGRES_DB` via
  `docker-compose.yml`), então o backup sempre usa as credenciais reais do
  `.env` em produção, não um valor hardcoded.
- `%` precisa de escape como `\%` dentro do crontab.
- Retenção: `-mtime +6` mantém os arquivos modificados nos últimos 7 dias (dia atual + 6 anteriores), totalizando 7 dumps.
- Ajuste `/opt/motomais` para o diretório onde o projeto está no VPS (ver `infra/deploy.md`).
- Antes de confiar no cron, faça um dump manual e restaure-o num banco de teste.
