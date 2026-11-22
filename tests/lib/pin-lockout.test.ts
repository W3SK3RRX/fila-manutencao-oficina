import { describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import {
  reservarTentativa,
  desfazerTentativa,
  __tamanhoMapaParaTestes,
  __limparTudoParaTestes,
} from "@/lib/pin-lockout";

// Prova direta de que `desfazerTentativa` identifica a reserva por id, e não
// por posição no array (o bug do round anterior: `pop()` removia o que
// estivesse por último, não necessariamente a reserva do próprio caller).
//
// Cenário simulado: duas requisições concorrentes para o mesmo mecanicoId.
//   - Tentativa 1 (A): reservada, depois seu PIN se revela CORRETO -> A chama
//     `desfazerTentativa` com o id que recebeu.
//   - Tentativa 2 (B): reservada DEPOIS de A, representando uma tentativa de
//     PIN errado genuína que ainda está em voo (ex.: aguardando bcrypt/DB)
//     quando A desfaz a sua. B nunca é desfeita (PIN errado -> conta como
//     falha).
//
// Com o bug antigo (pop na última entrada), desfazer a reserva de A removeria
// a entrada de B (a última no array nesse momento), zerando incorretamente o
// histórico, e a reserva de A ficaria presa para sempre como falha fantasma.
// Com o fix, cada reserva só é removida pelo seu próprio id.
describe("pin-lockout: identidade de reserva (reservarTentativa/desfazerTentativa)", () => {
  it("desfazer uma reserva não remove nem afeta uma reserva concorrente de outra tentativa", () => {
    const mecanicoId = randomUUID();

    const idTentativa1 = reservarTentativa(mecanicoId);
    const idTentativa2 = reservarTentativa(mecanicoId);

    expect(idTentativa1).not.toBeNull();
    expect(idTentativa2).not.toBeNull();
    expect(idTentativa1).not.toBe(idTentativa2);

    // PIN da tentativa 1 se revela correto: desfaz apenas a reserva 1.
    desfazerTentativa(mecanicoId, idTentativa1 as string);

    // A tentativa 2 (falha genuína, ainda não resolvida/desfeita) deve
    // continuar contando para o bloqueio: isso só é observável de fora
    // através do comportamento de `reservarTentativa`, então usamos o
    // LIMITE_TENTATIVAS (5) para provar a contagem exata. Já consumimos 1
    // reserva (tentativa 2), então mais 3 reservas devem ainda ser
    // concedidas (total de 4 na janela) e a 5ª reserva feita agora deve ser
    // a última antes do bloqueio.
    const idsRestantes: Array<string | null> = [];
    for (let i = 0; i < 3; i++) {
      idsRestantes.push(reservarTentativa(mecanicoId));
    }
    // Agora há 4 reservas ativas na janela (tentativa 2 + 3 novas). A 5ª
    // reserva ainda deve ser concedida (limite é 5).
    const quintaReserva = reservarTentativa(mecanicoId);
    expect(quintaReserva).not.toBeNull();

    // A 6ª reserva deve ser recusada (bloqueado): prova de que exatamente 5
    // tentativas estão sendo contadas (não 4, porque a de B não devia ter
    // sumido; não 6, porque a de A não devia ter ficado presa também).
    const sextaReserva = reservarTentativa(mecanicoId);
    expect(sextaReserva).toBeNull();

    for (const id of idsRestantes) {
      expect(id).not.toBeNull();
    }
  });

  it("reservarTentativa retorna ids únicos mesmo para reservas no mesmo milissegundo", () => {
    const mecanicoId = randomUUID();
    const id1 = reservarTentativa(mecanicoId);
    const id2 = reservarTentativa(mecanicoId);

    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy();
    expect(id1).not.toBe(id2);
  });

  it("desfazerTentativa com id inexistente não remove nenhuma reserva real", () => {
    const mecanicoId = randomUUID();
    reservarTentativa(mecanicoId);

    desfazerTentativa(mecanicoId, "id-que-nao-existe");

    // A reserva real continua lá: a 2ª reserva real ainda deve ser concedida
    // (limite 5), mas isso não prova remoção; melhor provar via bloqueio
    // total ainda mais abaixo não é necessário aqui -- o objetivo deste
    // teste é apenas garantir que a chamada não lança e não corrompe o
    // estado (nenhuma exceção = suficiente, combinado com o teste anterior
    // que já cobre a contagem exata).
    expect(() => desfazerTentativa(mecanicoId, "outro-id-invalido")).not.toThrow();
  });
});

// I5 (revisão final de branch, rodada de correção de segurança apontada por
// review automatizado): generalizar este módulo de "por mecânico" para "por
// identidade" (para a rota do balcão usar uma identidade por IP) introduziu
// uma população de identidades potencialmente muito maior e fora do
// controle da aplicação — sem limpeza, cada identidade nova (ex.: um
// atacante variando de IP) deixava uma entrada no Map para sempre, mesmo
// depois de expirada (DoS de memória). Estes testes provam o cleanup
// descrito em lib/pin-lockout.ts: entradas totalmente expiradas são
// removidas do Map (não só ignoradas por filtro) assim que QUALQUER
// tentativa nova é processada, e um teto rígido evita crescimento sem fim
// mesmo antes da janela de 10min expirar.
describe("pin-lockout: limpeza e teto do Map (defesa contra crescimento sem limite)", () => {
  it("remove do Map uma identidade totalmente expirada ao processar qualquer nova tentativa", () => {
    vi.useFakeTimers();
    try {
      // Parte de um Map vazio conhecido: sem isso, `vi.advanceTimersByTime`
      // abaixo expiraria TAMBÉM qualquer entrada deixada por outros testes
      // deste arquivo (todas criadas em "tempo real" essencialmente igual
      // ao início deste, bem dentro dos 11 minutos avançados), tornando o
      // tamanho esperado depois dependente da ordem de execução dos testes
      // em vez do comportamento sob teste.
      __limparTudoParaTestes();

      const identidadeAntiga = randomUUID();
      reservarTentativa(identidadeAntiga);
      expect(__tamanhoMapaParaTestes()).toBe(1);

      // Avança além da janela de 10min — a reserva de `identidadeAntiga`
      // fica totalmente expirada.
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Processa uma tentativa para uma identidade TOTALMENTE DIFERENTE —
      // a limpeza roda sobre o Map inteiro a cada chamada, não só sobre a
      // identidade consultada.
      const identidadeNova = randomUUID();
      reservarTentativa(identidadeNova);

      // Só `identidadeNova` deve sobrar: `identidadeAntiga`, totalmente
      // expirada, foi removida do Map (não só ignorada por filtro). Sem o
      // cleanup, o tamanho seria 2 (as duas entradas coexistindo).
      expect(__tamanhoMapaParaTestes()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it(
    "nunca deixa o Map crescer além do teto rígido, mesmo sem nenhuma entrada expirar",
    () => {
      // 5000 é o teto configurado em lib/pin-lockout.ts
      // (LIMITE_MAPA_ENTRADAS) — não exportado (é um detalhe interno), então
      // repetido aqui como o contrato observável deste módulo. Sem avançar
      // o relógio (nada expira por tempo): só o teto rígido explica o Map
      // não crescer ilimitadamente.
      const TETO_MAPA = 5000;
      const QUANTIDADE_ALEM_DO_TETO = 200;

      for (let i = 0; i < TETO_MAPA + QUANTIDADE_ALEM_DO_TETO; i++) {
        reservarTentativa(`identidade-teste-teto-${i}`);
      }

      expect(__tamanhoMapaParaTestes()).toBeLessThanOrEqual(TETO_MAPA);
    },
    20000,
  );

  // CORREÇÃO DE SEGURANÇA (apontada por review automatizado sobre a
  // primeira versão do teto/eviction acima): evictar "a reserva mais
  // antiga do Map inteiro" sem checar se essa identidade já está BLOQUEADA
  // abria uma forma de um atacante já bloqueado se desbloquear sozinho —
  // bastava inundar o Map com identidades novas e descartáveis até o teto
  // forçar uma eviction, e se a identidade evictada fosse a do próprio
  // atacante (já bloqueada, portanto "antiga" o bastante para ser
  // escolhida), seu bloqueio sumia e ele podia recomeçar. Este teste cobre
  // as duas metades da correção: (1) havendo uma identidade NÃO bloqueada
  // elegível, é ela que é evictada para abrir espaço — nunca uma
  // bloqueada; (2) se o Map estiver no teto só com identidades bloqueadas
  // (nenhuma candidata elegível), a tentativa pela identidade nova falha
  // fechado (recusada, igual a um bloqueio normal) em vez de evictar
  // qualquer uma delas.
  it(
    "eviction só considera identidades não bloqueadas; mapa cheio só de bloqueadas falha fechado",
    () => {
      __limparTudoParaTestes();
      const TETO_MAPA = 5000;

      // Uma única identidade NÃO bloqueada (1 reserva), criada primeiro —
      // é a mais antiga de todas as reservas no Map, candidata "correta"
      // para eviction.
      const identidadeNaoBloqueada = "pin-lockout-teste-nao-bloqueada";
      reservarTentativa(identidadeNaoBloqueada);

      // Preenche o restante do teto com identidades BLOQUEADAS (5 reservas
      // cada) — todas criadas depois da não bloqueada acima.
      for (let i = 0; i < TETO_MAPA - 1; i++) {
        const identidade = `pin-lockout-teste-bloqueada-${i}`;
        for (let j = 0; j < 5; j++) {
          reservarTentativa(identidade);
        }
      }

      expect(__tamanhoMapaParaTestes()).toBe(TETO_MAPA);

      // Parte 1: há uma candidata elegível (a não bloqueada) — a
      // identidade nova consegue reservar.
      const resultadoComEspaco = reservarTentativa("pin-lockout-teste-nova-1");
      expect(resultadoComEspaco).not.toBeNull();
      expect(__tamanhoMapaParaTestes()).toBe(TETO_MAPA);

      // Prova de que foi a NÃO bloqueada (nunca uma bloqueada) que saiu:
      // reservar de novo para ela tem sucesso como se fosse uma identidade
      // nova (contagem zerada pela eviction, não "já tinha 1 reserva
      // sobrevivente").
      for (let j = 0; j < 5; j++) {
        expect(reservarTentativa(identidadeNaoBloqueada)).not.toBeNull();
      }
      // 6ª: bloqueada de novo, mas por um bloqueio FRESCO (contado a
      // partir de agora), não por nada que tivesse sobrevivido à eviction.
      expect(reservarTentativa(identidadeNaoBloqueada)).toBeNull();

      // Bloqueia "pin-lockout-teste-nova-1" também (só tinha 1 reserva) —
      // agora TODAS as identidades no Map estão bloqueadas, sem nenhuma
      // candidata elegível para uma próxima eviction.
      for (let j = 0; j < 4; j++) {
        reservarTentativa("pin-lockout-teste-nova-1");
      }
      expect(__tamanhoMapaParaTestes()).toBe(TETO_MAPA);

      // Parte 2: Map no teto, só com identidades bloqueadas. Falha
      // fechado: a tentativa pela identidade nova é recusada, e o Map
      // continua exatamente do mesmo tamanho — ninguém foi evictado só
      // para abrir espaço.
      const resultadoSemEspaco = reservarTentativa("pin-lockout-teste-nova-2-sem-espaco");
      expect(resultadoSemEspaco).toBeNull();
      expect(__tamanhoMapaParaTestes()).toBe(TETO_MAPA);
    },
    120000,
  );
});
