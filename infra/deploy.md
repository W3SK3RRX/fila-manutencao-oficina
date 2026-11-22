# Deploy em produção

Passo a passo para colocar este protótipo no ar, usando como exemplo concreto
o domínio real deste deploy: **`motomais.infinityforge.com.br`**.

Escrito como parte da revisão final de branch (finding I4): antes deste
documento, não havia nenhum roteiro — o README ainda era o boilerplate do
`create-next-app` (ver finding I6) e nada explicava como seedar
`tipos_servico` ou cadastrar o primeiro mecânico num banco de produção vazio.

## 1. DNS

Aponte um registro `A` (ou `AAAA`) de `motomais.infinityforge.com.br` para o
IP do VPS. O Caddy (`Caddyfile`) obtém e renova o certificado Let's Encrypt
automaticamente na primeira requisição — não precisa de nenhum passo manual
de TLS, só o DNS já resolvendo para o servidor antes de subir o `caddy`.

## 2. Clonar o repositório e configurar `.env`

```bash
git clone <url-do-repositorio> /opt/motomais
cd /opt/motomais
cp .env.example .env
```

Edite `.env` e ajuste, **no mínimo**, os campos abaixo — os valores de
`.env.example` são só para desenvolvimento local e nunca devem ir para
produção:

| Variável | O que colocar em produção |
|---|---|
| `POSTGRES_PASSWORD` | Senha longa e aleatória, só para este banco. |
| `JWT_SECRET` | **Obrigatório forte**: `instrumentation.ts` recusa iniciar o servidor em produção (`NODE_ENV=production`, já setado pelo `Dockerfile`) se este valor tiver menos de 32 caracteres ou for igual ao exemplo (`dev-secret-change-me`). Gere um com `openssl rand -base64 48`. |
| `BALCAO_SENHA` | **Obrigatório trocar o `0000` de exemplo**: `instrumentation.ts` recusa iniciar o servidor em produção se este valor ainda for `0000` ou estiver vazio. Mesmo sendo curta (é digitada num teclado numérico na tela, spec), a rota de login agora tem limite de tentativas por IP (`app/api/auth/balcao/route.ts`, reaproveitando `lib/pin-lockout.ts`) — mas uma senha previsível continua sendo a primeira coisa que alguém tenta. |
| `APP_URL` | `https://motomais.infinityforge.com.br` — usado para montar links/QR code absolutos (ex. `/instalar`). Deixar o fallback (`http://localhost:3000`) em produção quebra o QR code. |
| `DOMAIN` | `motomais.infinityforge.com.br` — é isto que o Caddy usa para emitir o certificado (ver `Caddyfile`). |
| `TZ` | Deixe `America/Fortaleza` (já é o default), a menos que a oficina real fique em outro fuso. |
| `MECANICO_1_PIN`/`_2_PIN`/`_3_PIN` | **Não defina estas em produção.** Elas só existem para `prisma/seed.ts` (que cria 3 "Mecânico de teste" — ver passo 4) e não são lidas por nenhum outro caminho do app. |

Nunca commite `.env` (já está no `.gitignore`).

## 3. Subir os serviços

```bash
docker compose up -d --build
```

Isso builda a imagem do `app` (Dockerfile), sobe `db` (aguarda o healthcheck
do Postgres antes de iniciar `app` — `depends_on: condition: service_healthy`
em `docker-compose.yml`), e sobe `caddy` na frente de tudo. O entrypoint do
`app` (`Dockerfile`'s `CMD`) roda `npx prisma migrate deploy` automaticamente
antes de `node server.js` — isso já aplica a migração que insere os 4
`tipos_servico` fixos do spec (`prisma/migrations/
20261121220000_seed_tipos_servico/migration.sql`, idempotente via
`ON CONFLICT ... DO NOTHING`), então **o balcão já consegue criar OS assim
que o container sobe**, sem precisar rodar `prisma/seed.ts`.

Acompanhe os logs do primeiro boot:

```bash
docker compose logs -f app
```

## 4. Cadastrar o primeiro mecânico

`prisma/seed.ts` não é o caminho certo para produção (ele exige as 3
variáveis `MECANICO_N_PIN` e sempre cria mecânicos chamados "Mecânico 1/2/3"
— pensado para ambiente de dev/teste). Em produção, cadastre cada mecânico
de verdade com o script interativo (spec: "apenas via seed ou script"):

```bash
docker compose exec app npm run mecanico:criar
```

Ele pergunta nome e PIN de 4 dígitos (o PIN nunca aparece na tela nem é
logado em claro — só o hash bcrypt vai para o banco). Repita uma vez por
mecânico.

## 5. Backup

Siga `infra/backup.md` para o cron de `pg_dump` diário — ele já lê as
credenciais do `.env` em vez de assumir usuário/senha fixos.

## 6. Verificação pós-deploy

- `https://motomais.infinityforge.com.br/balcao/login` carrega e aceita a
  senha definida em `BALCAO_SENHA`.
- `https://motomais.infinityforge.com.br/mecanico/login` lista os mecânicos
  cadastrados no passo 4 e aceita o PIN de cada um.
- `https://motomais.infinityforge.com.br/instalar` mostra um QR code que
  aponta para o domínio real (não `localhost`) — confirma que `APP_URL` foi
  configurado corretamente.
- Crie uma OS de teste pelo balcão e confirme que ela aparece na fila do
  mecânico.

## Notas de segurança (ver também finding I5 da revisão final de branch)

- Um único cookie de sessão vale para balcão e mecânico: fazer login como
  mecânico no mesmo navegador/computador do balcão substitui a sessão de
  balcão ali (e vice-versa). Use dispositivos separados: o computador fixo
  do balcão só deve logar como balcão; cada mecânico loga no próprio
  celular.
- `JWT_SECRET` não tem revogação (sessões são JWT stateless) — se vazar,
  troque-o: isso invalida todas as sessões ativas (todo mundo precisa logar
  de novo), o que é o comportamento correto nesse caso.
