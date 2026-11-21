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

// Verifica bloqueio e já reserva a tentativa em uma única chamada síncrona
// (sem `await` entre a checagem e o registro), para fechar a corrida TOCTOU
// que existiria se o caller fizesse `estaBloqueado` seguido de, só depois de
// operações assíncronas (bcrypt, DB), `registrarTentativaFalha`: uma rajada
// de requisições concorrentes poderia passar todas pela checagem antes de
// qualquer uma registrar uma falha. Retorna `true` se a tentativa foi
// reservada (não estava bloqueado); `false` se já estava bloqueado (e, nesse
// caso, nada é registrado). Em caso de sucesso do PIN, o caller deve desfazer
// a reserva com `desfazerTentativa`.
export function reservarTentativa(mecanicoId: string): boolean {
  const agora = Date.now();
  const historico = tentativasNaJanela(mecanicoId, agora);
  if (historico.length >= LIMITE_TENTATIVAS) {
    tentativasPorMecanico.set(mecanicoId, historico);
    return false;
  }
  historico.push(agora);
  tentativasPorMecanico.set(mecanicoId, historico);
  return true;
}

// Desfaz a reserva mais recente feita por `reservarTentativa` para este
// mecânico. Usado quando a tentativa reservada acaba se revelando bem
// sucedida (PIN correto), para não contar um login válido como falha.
export function desfazerTentativa(mecanicoId: string): void {
  const historico = tentativasPorMecanico.get(mecanicoId);
  if (historico && historico.length > 0) {
    historico.pop();
    tentativasPorMecanico.set(mecanicoId, historico);
  }
}
