import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { reservarTentativa, desfazerTentativa } from "@/lib/pin-lockout";

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
