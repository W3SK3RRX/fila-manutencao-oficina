// I5 (revisão final de branch): `.env.example` satisfaz todo guard `${VAR:?}`
// de docker-compose.yml com segredos de exemplo fracos
// (JWT_SECRET=dev-secret-change-me, BALCAO_SENHA=0000) — nada impedia
// copiar o arquivo inteiro para um `.env` de produção de verdade. Um
// JWT_SECRET curto ou previsível permite forjar uma sessão de balcão ou de
// mecânico (lib/auth.ts assina/verifica tokens só com esse segredo).
//
// `register()` é a convenção documentada do Next.js para código que deve
// rodar uma única vez, antes do servidor aceitar qualquer requisição
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
// instrumentation.md) — por isso a validação vive aqui, e não dentro de
// lib/auth.ts (que roda a cada chamada, tarde demais para "recusar iniciar").
export function register(): void {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const segredo = process.env.JWT_SECRET ?? "";
  const SEGREDO_EXEMPLO = "dev-secret-change-me";
  const TAMANHO_MINIMO = 32;

  if (segredo.length < TAMANHO_MINIMO || segredo === SEGREDO_EXEMPLO) {
    throw new Error(
      "JWT_SECRET inválido para produção: precisa ter pelo menos " +
        `${TAMANHO_MINIMO} caracteres e não pode ser o valor de exemplo de ` +
        ".env.example. Gere um segredo novo, ex.: `openssl rand -base64 48`.",
    );
  }

  // BALCAO_SENHA (correção de segurança pós-fix-wave, apontada junto com o
  // finding de DoS do limitador de tentativas — ver
  // app/api/auth/balcao/route.ts): o limitador de tentativas torna a força
  // bruta cara em tempo, mas não impede alguém de simplesmente digitar
  // "0000" (o valor de exemplo de .env.example) na primeira tentativa. Não
  // exigimos um tamanho mínimo maior (a spec quer um PIN curto, digitado num
  // teclado numérico na tela) — só recusamos iniciar se ainda for,
  // literalmente, o valor de exemplo.
  const senhaBalcao = process.env.BALCAO_SENHA ?? "";
  const SENHA_EXEMPLO = "0000";

  if (senhaBalcao === "" || senhaBalcao === SENHA_EXEMPLO) {
    throw new Error(
      "BALCAO_SENHA inválida para produção: não pode ficar vazia nem ser o " +
        "valor de exemplo (0000) de .env.example. Defina uma senha real antes " +
        "de implantar.",
    );
  }
}
