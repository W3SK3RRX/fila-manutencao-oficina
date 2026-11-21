// Bloqueio de tentativas de PIN: 5 falhas por mecânico dentro de uma janela
// de 10 minutos bloqueiam a 6ª tentativa (mesmo que o PIN esteja correto)
// até a janela expirar.
//
// Limitação de protótipo, assumida conscientemente: o Map vive em memória do
// processo Node, então o estado de bloqueio é zerado a cada reinício do
// servidor e não é compartilhado entre múltiplas instâncias/processos. As
// restrições globais do plano não exigem um store persistente/distribuído
// neste escopo, então isso é aceitável aqui.

import { randomUUID } from "node:crypto";

const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

interface Reserva {
  quando: number;
  id: string;
}

const tentativasPorMecanico = new Map<string, Reserva[]>();

function tentativasNaJanela(mecanicoId: string, agora: number): Reserva[] {
  const historico = tentativasPorMecanico.get(mecanicoId) ?? [];
  return historico.filter((reserva) => agora - reserva.quando < JANELA_MS);
}

// Verifica bloqueio e já reserva a tentativa em uma única chamada síncrona
// (sem `await` entre a checagem e o registro), para fechar a corrida TOCTOU
// que existiria se o caller fizesse `estaBloqueado` seguido de, só depois de
// operações assíncronas (bcrypt, DB), `registrarTentativaFalha`: uma rajada
// de requisições concorrentes poderia passar todas pela checagem antes de
// qualquer uma registrar uma falha. Retorna o id da reserva feita (string) se
// a tentativa foi reservada (não estava bloqueado); `null` se já estava
// bloqueado (e, nesse caso, nada é registrado). Em caso de sucesso do PIN, o
// caller deve desfazer a reserva passando esse id para `desfazerTentativa`.
//
// O id é gerado com `randomUUID()` em vez de reusar o timestamp como
// identidade: sob concorrência real, duas reservas podem cair no mesmo
// milissegundo (`Date.now()` colide), e identificar a reserva pela posição
// que ela ocupa no array (ex.: "a última") quebra assim que duas requisições
// para o mesmo mecânico se intercalam — ver `desfazerTentativa`.
export function reservarTentativa(mecanicoId: string): string | null {
  const agora = Date.now();
  const historico = tentativasNaJanela(mecanicoId, agora);
  if (historico.length >= LIMITE_TENTATIVAS) {
    tentativasPorMecanico.set(mecanicoId, historico);
    return null;
  }
  const reserva: Reserva = { quando: agora, id: randomUUID() };
  historico.push(reserva);
  tentativasPorMecanico.set(mecanicoId, historico);
  return reserva.id;
}

// Desfaz a reserva identificada por `idDaReserva` (retornado por
// `reservarTentativa`) para este mecânico. Usado quando a tentativa
// reservada acaba se revelando bem sucedida (PIN correto), para não contar
// um login válido como falha.
//
// Remove a entrada pelo seu id, nunca por posição (`pop()`/"última do
// array"): sob concorrência, duas requisições para o mesmo `mecanicoId`
// podem se intercalar de forma que a reserva de A não seja mais a última do
// array quando A chama `desfazerTentativa` (porque a reserva de B, uma
// tentativa errada genuína, foi inserida depois). Remover por posição nesse
// cenário apagaria a falha real de B (sub-contando o bloqueio) e deixaria a
// reserva de A presa no array para sempre (contando como falha fantasma e
// podendo bloquear um mecânico legítimo mais tarde).
export function desfazerTentativa(mecanicoId: string, idDaReserva: string): void {
  const historico = tentativasPorMecanico.get(mecanicoId);
  if (historico && historico.length > 0) {
    tentativasPorMecanico.set(
      mecanicoId,
      historico.filter((reserva) => reserva.id !== idDaReserva),
    );
  }
}
