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
// branch, I5 seguido de correção de segurança pós-fix-wave apontada pelo
// review automatizado, em várias rodadas): originalmente só a rota de PIN do
// mecânico usava este módulo, uma identidade por `mecanicoId` (uma por
// mecânico cadastrado, população pequena e estável). A rota de login do
// balcão (app/api/auth/balcao/route.ts) passou a usar este módulo com uma
// identidade por IP do cliente — mas isso introduz uma população de
// identidades potencialmente MUITO maior e não controlada pela aplicação
// (qualquer IP na internet pode gerar uma identidade nova). Duas
// consequências que o design original (pensado só para `mecanicoId`) não
// cobria, corrigidas abaixo:
//   1. Sem limpeza, cada identidade nova (ex.: um atacante variando de IP)
//      deixava uma entrada no Map para sempre, mesmo depois de expirada —
//      crescimento sem limite (DoS de memória). `limparExpiradasEManterTeto`
//      varre o Map inteiro a cada chamada, removendo entradas totalmente
//      expiradas, e aplica um teto rígido (`LIMITE_MAPA_ENTRADAS`) como
//      último recurso, evictando a reserva mais antiga do Map inteiro
//      enquanto o teto for excedido — cobre tanto o caso comum (expiração
//      natural) quanto o caso patológico (teto atingido antes da janela de
//      10min terminar).
//   2. Nenhum limitador de tentativas por identidade sozinho impede força
//      bruta verdadeiramente distribuída (um atacante com IPs
//      praticamente ilimitados nunca esgota o limite de nenhum IP
//      individual) — isso é tratado na camada de cima (BALCAO_SENHA com
//      tamanho mínimo real, ver instrumentation.ts), não aqui.

import { randomUUID } from "node:crypto";

const LIMITE_TENTATIVAS = 5;
const JANELA_MS = 10 * 60 * 1000;

// Teto rígido de quantas identidades distintas este módulo mantém ao mesmo
// tempo, independente de expiração por tempo — backstop contra um ataque
// que crie identidades novas mais rápido do que a janela de 10min as
// expiraria naturalmente. 5000 é generoso para o uso real deste protótipo
// (poucos mecânicos + o tráfego de um único balcão) e ainda assim limita o
// Map a um tamanho desprezível em memória.
const LIMITE_MAPA_ENTRADAS = 5000;

interface Reserva {
  quando: number;
  id: string;
}

const tentativasPorIdentidade = new Map<string, Reserva[]>();

// Remove do Map inteiro (não só da identidade consultada nesta chamada)
// qualquer reserva mais velha que a janela, apagando a chave por completo
// quando sua lista fica vazia — nunca deixa um array vazio "esquecido" no
// Map. Depois, se o Map ainda exceder o teto rígido, evicta a identidade
// dona da reserva mais antiga (a reserva mais antiga entre TODAS as
// identidades), repetindo até voltar ao teto. Chamada no início de
// `reservarTentativa`, então roda a cada tentativa de login em todo o
// processo — O(tamanho do Map) por chamada, aceitável para a escala deste
// protótipo (o teto acima garante que nunca cresce além de um tamanho
// trivial de se varrer).
function limparExpiradasEManterTeto(agora: number): void {
  for (const [identidade, historico] of tentativasPorIdentidade) {
    const restante = historico.filter((reserva) => agora - reserva.quando < JANELA_MS);
    if (restante.length === 0) {
      tentativasPorIdentidade.delete(identidade);
    } else if (restante.length !== historico.length) {
      tentativasPorIdentidade.set(identidade, restante);
    }
  }

  // `>=`, não `>`: esta função roda ANTES de `reservarTentativa` adicionar a
  // entrada da chamada atual (que pode ser uma identidade nova, crescendo o
  // Map em 1). Usar `>` permitiria o Map terminar a chamada em
  // `LIMITE_MAPA_ENTRADAS + 1` (um a mais que o teto) toda vez que uma
  // identidade nova for adicionada sob pressão — `>=` reserva espaço para
  // essa adição, mantendo o teto exato após cada chamada.
  while (tentativasPorIdentidade.size >= LIMITE_MAPA_ENTRADAS) {
    let identidadeMaisAntiga: string | undefined;
    let quandoMaisAntigo = Number.POSITIVE_INFINITY;

    for (const [identidade, historico] of tentativasPorIdentidade) {
      for (const reserva of historico) {
        if (reserva.quando < quandoMaisAntigo) {
          quandoMaisAntigo = reserva.quando;
          identidadeMaisAntiga = identidade;
        }
      }
    }

    if (identidadeMaisAntiga === undefined) {
      // Não deveria acontecer (toda identidade no Map tem ao menos uma
      // reserva, por construção), mas evita um loop infinito em qualquer
      // estado inesperado.
      break;
    }

    tentativasPorIdentidade.delete(identidadeMaisAntiga);
  }
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
  limparExpiradasEManterTeto(agora);

  const historico = tentativasPorIdentidade.get(identidade) ?? [];
  if (historico.length >= LIMITE_TENTATIVAS) {
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
//
// Apaga a chave do Map por completo se a lista resultante ficar vazia (não
// deixa um array `[]` esquecido ali — mesma disciplina de
// `limparExpiradasEManterTeto`).
export function desfazerTentativa(identidade: string, idDaReserva: string): void {
  const historico = tentativasPorIdentidade.get(identidade);
  if (!historico || historico.length === 0) {
    return;
  }

  const restante = historico.filter((reserva) => reserva.id !== idDaReserva);
  if (restante.length === 0) {
    tentativasPorIdentidade.delete(identidade);
  } else {
    tentativasPorIdentidade.set(identidade, restante);
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

// Exportado só para os testes verificarem o comportamento de limpeza/teto
// do Map sem depender de reimplementar a lógica interna. Não deve ser
// importado fora de testes.
export function __tamanhoMapaParaTestes(): number {
  return tentativasPorIdentidade.size;
}

// Exportado só para os testes de limpeza/teto do Map (ver
// tests/lib/pin-lockout.test.ts) começarem de um estado conhecido e vazio,
// sem depender do estado deixado por outros testes do mesmo arquivo. Não
// deve ser importado fora de testes.
export function __limparTudoParaTestes(): void {
  tentativasPorIdentidade.clear();
}
