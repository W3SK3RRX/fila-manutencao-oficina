# Backup do Postgres

Spec: `pg_dump` diário via cron no host, mantendo 7 dias.

## Cron (host, usuário com acesso ao Docker)

```cron
# Todo dia às 03:00 (TZ do host = America/Fortaleza): dump do banco do serviço `db`
0 3 * * * cd /opt/motomais && docker compose exec -T db pg_dump -U motomais motomais | gzip > /opt/motomais/backups/backup-$(date +\%F).sql.gz

# Retenção: remove backups com mais de 7 dias
30 3 * * * find /opt/motomais/backups -name 'backup-*.sql.gz' -mtime +6 -delete
```

Notas:

- `docker compose exec -T` roda o `pg_dump` dentro do container `db`, então não é preciso instalar cliente Postgres no host. `-T` desliga a alocação de TTY, necessário em cron.
- `%` precisa de escape como `\%` dentro do crontab.
- Retenção: `-mtime +6` mantém os arquivos modificados nos últimos 7 dias (dia atual + 6 anteriores), totalizando 7 dumps.
- Ajuste `/opt/motomais` para o diretório onde o projeto está no VPS.
- Antes de confiar no cron, faça um dump manual e restaure-o num banco de teste.
