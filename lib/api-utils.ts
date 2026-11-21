// Utilitários compartilhados pelos route handlers de leitura que consultam
// `vw_fila`/`ordens_servico` via `$queryRaw` (em vez do client tipado do
// Prisma). `$queryRaw` devolve as linhas com os nomes de coluna crus do
// banco (snake_case, como definidos na view/tabela), diferente do client
// tipado do Prisma, que já mapeia para camelCase via `@map` no schema. Para
// manter a resposta JSON destas rotas no mesmo estilo camelCase usado em
// todo o resto da API (e pelos tipos gerados do Prisma), convertemos as
// chaves das linhas cruas aqui.
function paraCamelCase(chave: string): string {
  return chave.replace(/_([a-z0-9])/g, (_match, letra: string) => letra.toUpperCase());
}

export function linhaParaCamelCase<T = Record<string, unknown>>(
  linha: Record<string, unknown>,
): T {
  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(linha)) {
    resultado[paraCamelCase(chave)] = valor;
  }
  return resultado as T;
}
