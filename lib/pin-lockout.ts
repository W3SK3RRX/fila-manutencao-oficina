// Bloqueio de tentativas de PIN: 5 falhas por mecânico dentro de uma janela
// de 10 minutos bloqueiam a 6ª tentativa (mesmo que o PIN esteja correto)
// até a janela expirar.
//
// Limitação de protótipo, assumida conscientemente: o Map vive em memória do
// processo Node, então o estado de bloqueio é zerado a cada reinício do
// servidor e não é compartilhado entre múltiplas instâncias/processos. As
// restrições globais do plano não exigem um store persistente/distribuído
// neste escopo, então isso é aceitável aqui.

const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

const tentativasPorMecanico = new Map<string, number[]>();

function tentativasNaJanela(mecanicoId: string, agora: number): number[] {
  const historico = tentativasPorMecanico.get(mecanicoId) ?? [];
  return historico.filter((timestamp) => agora - timestamp < JANELA_MS);
}

export function registrarTentativaFalha(mecanicoId: string): void {
  const agora = Date.now();
  const historico = tentativasNaJanela(mecanicoId, agora);
  historico.push(agora);
  tentativasPorMecanico.set(mecanicoId, historico);
}

export function estaBloqueado(mecanicoId: string): boolean {
  const agora = Date.now();
  const historico = tentativasNaJanela(mecanicoId, agora);
  tentativasPorMecanico.set(mecanicoId, historico);
  return historico.length >= LIMITE_TENTATIVAS;
}
