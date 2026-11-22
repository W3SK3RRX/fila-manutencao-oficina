// Bloqueio de tentativas: 5 falhas por identidade dentro de uma janela de 10
// minutos bloqueiam a 6ª tentativa (mesmo que a credencial esteja correta)
// até a janela expirar.
//
// Limitação de protótipo, assumida conscientemente: o Map vive em memória do
// processo Node, então o estado de bloqueio é zerado a cada reinício do
// servidor e não é compartilhado entre múltiplas instâncias/processos. As
// restrições globais do plano não exigem um store persistente/distribuído
// neste escopo, então isso é aceitável aqui.
//
// Generalizado de "por mecânico" para "por identidade" (revisão final de
// branch, I5 seguido da correção de segurança pós-fix-wave apontada pelo
// review automatizado): originalmente só a rota de PIN do mecânico usava
// este módulo, uma identidade por `mecanicoId`. A rota de login do balcão
// (app/api/auth/balcao/route.ts) também passou a usar este módulo — mas com
// uma identidade por IP do cliente, nunca uma identidade constante
// compartilhada por todo mundo: uma identidade global bloquearia (mesmo que
// só sob um teto mais alto) o balcão de verdade por causa de tentativas
// vindas de qualquer outro IP, trocando um DoS fácil (um único atacante) por
// um DoS só um pouco mais caro (um atacante distribuído) — mesma classe de
// problema, não uma correção. Cada identidade (mecanicoId, ou IP do
// cliente) tem seu próprio bucket, isolado dos demais.

import { randomUUID } from "node:crypto";

const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

interface Reserva {
  quando: number;
  id: string;
}

const tentativasPorIdentidade = new Map<string, Reserva[]>();

function tentativasNaJanela(identidade: string, agora: number): Reserva[] {
  const historico = tentativasPorIdentidade.get(identidade) ?? [];
  return historico.filter((reserva) => agora - reserva.quando < JANELA_MS);
}

// Verifica bloqueio e já reserva a tentativa em uma única chamada síncrona
// (sem `await` entre a checagem e o registro), para fechar a corrida TOCTOU
// que existiria se o caller fizesse `estaBloqueado` seguido de, só depois de
// operações assíncronas (bcrypt, DB), `registrarTentativaFalha`: uma rajada
// de requisições concorrentes poderia passar todas pela checagem antes de
// qualquer uma registrar uma falha. Retorna o id da reserva feita (string) se
// a tentativa foi reservada (não estava bloqueado); `null` se já estava
// bloqueado (e, nesse caso, nada é registrado). Em caso de sucesso da
// credencial, o caller deve desfazer a reserva passando esse id para
// `desfazerTentativa`.
//
// O id é gerado com `randomUUID()` em vez de reusar o timestamp como
// identidade: sob concorrência real, duas reservas podem cair no mesmo
// milissegundo (`Date.now()` colide), e identificar a reserva pela posição
// que ela ocupa no array (ex.: "a última") quebra assim que duas requisições
// para a mesma identidade se intercalam — ver `desfazerTentativa`.
export function reservarTentativa(identidade: string): string | null {
  const agora = Date.now();
  const historico = tentativasNaJanela(identidade, agora);
  if (historico.length >= LIMITE_TENTATIVAS) {
    tentativasPorIdentidade.set(identidade, historico);
    return null;
  }
  const reserva: Reserva = { quando: agora, id: randomUUID() };
  historico.push(reserva);
  tentativasPorIdentidade.set(identidade, historico);
  return reserva.id;
}

// Desfaz a reserva identificada por `idDaReserva` (retornado por
// `reservarTentativa`) para esta identidade. Usado quando a tentativa
// reservada acaba se revelando bem sucedida (credencial correta), para não
// contar um login válido como falha.
//
// Remove a entrada pelo seu id, nunca por posição (`pop()`/"última do
// array"): sob concorrência, duas requisições para a mesma identidade podem
// se intercalar de forma que a reserva de A não seja mais a última do array
// quando A chama `desfazerTentativa` (porque a reserva de B, uma tentativa
// errada genuína, foi inserida depois). Remover por posição nesse cenário
// apagaria a falha real de B (sub-contando o bloqueio) e deixaria a reserva
// de A presa no array para sempre (contando como falha fantasma e podendo
// bloquear alguém legítimo mais tarde).
export function desfazerTentativa(identidade: string, idDaReserva: string): void {
  const historico = tentativasPorIdentidade.get(identidade);
  if (historico && historico.length > 0) {
    tentativasPorIdentidade.set(
      identidade,
      historico.filter((reserva) => reserva.id !== idDaReserva),
    );
  }
}

// Exportado só para os testes isolarem cenários de bloqueio entre si. Os
// testes do mecânico (tests/api/auth.test.ts) evitam colisão usando um
// `randomUUID()` novo por teste como identidade — mas os testes da rota do
// balcão usam IPs fixos (simulados via header), então precisam limpar essas
// identidades entre si explicitamente. Não deve ser importado fora de
// testes.
export function __resetTentativasParaTestes(identidade: string): void {
  tentativasPorIdentidade.delete(identidade);
}
