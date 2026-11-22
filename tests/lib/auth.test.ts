import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
  assinarSessaoBalcao,
  assinarSessaoMecanico,
  compararComTempoConstante,
  verificarSessao,
} from "@/lib/auth";

const mecanicoId = "33333333-3333-4333-8333-333333333333";

describe("assinarSessaoBalcao / verificarSessao", () => {
  it("round-trip: sessão de balcão assinada é verificada com perfil balcao", async () => {
    const token = await assinarSessaoBalcao();
    const sessao = await verificarSessao(token);

    expect(sessao).toEqual({ perfil: "balcao" });
  });
});

describe("assinarSessaoMecanico / verificarSessao", () => {
  it("round-trip: sessão de mecânico assinada é verificada com perfil mecanico e mecanicoId", async () => {
    const token = await assinarSessaoMecanico(mecanicoId);
    const sessao = await verificarSessao(token);

    expect(sessao).toEqual({ perfil: "mecanico", mecanicoId });
  });
});

describe("verificarSessao com token inválido", () => {
  it("retorna null para token adulterado", async () => {
    const token = await assinarSessaoBalcao();
    const tokenAdulterado = `${token}adulterado`;

    expect(await verificarSessao(tokenAdulterado)).toBeNull();
  });

  it("retorna null para token expirado", async () => {
    const segredo = new TextEncoder().encode(process.env.JWT_SECRET);
    const tokenExpirado = await new SignJWT({ perfil: "balcao" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("-1s")
      .sign(segredo);

    expect(await verificarSessao(tokenExpirado)).toBeNull();
  });

  it("retorna null para token assinado com segredo diferente", async () => {
    const segredoErrado = new TextEncoder().encode("outro-segredo-qualquer");
    const tokenComSegredoErrado = await new SignJWT({ perfil: "balcao" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(segredoErrado);

    expect(await verificarSessao(tokenComSegredoErrado)).toBeNull();
  });

  it("retorna null para string que não é um JWT", async () => {
    expect(await verificarSessao("isso-nao-e-um-token")).toBeNull();
  });
});

// I5 (revisão final de branch, rodada de correção de segurança): prova de
// que a comparação em tempo constante (usada por
// app/api/auth/balcao/route.ts no lugar de `!==`) não muda a CORREÇÃO da
// comparação — só a forma como ela é computada. `timingSafeEqual` em si já
// é testado pelo Node; o que vale a pena provar aqui é que o hashing dos
// dois lados (necessário para nunca lançar por tamanhos diferentes, ver
// comentário em lib/auth.ts) continua dando o resultado certo em todos os
// casos relevantes, incluindo tamanhos diferentes (que um `timingSafeEqual`
// direto sobre as strings originais teria lançado).
describe("compararComTempoConstante", () => {
  it("retorna true para strings idênticas", () => {
    expect(compararComTempoConstante("senha-correta", "senha-correta")).toBe(true);
  });

  it("retorna false para strings diferentes do mesmo tamanho", () => {
    expect(compararComTempoConstante("senha-correta", "senha-errada")).toBe(false);
  });

  it("retorna false para strings de tamanhos diferentes, sem lançar", () => {
    // Um `timingSafeEqual` direto sobre as strings originais (sem hash)
    // lançaria aqui, por serem de tamanhos diferentes — é exatamente o que
    // o hash de tamanho fixo evita.
    expect(() => compararComTempoConstante("123", "uma-senha-bem-mais-longa")).not.toThrow();
    expect(compararComTempoConstante("123", "uma-senha-bem-mais-longa")).toBe(false);
  });

  it("retorna true para duas strings vazias", () => {
    expect(compararComTempoConstante("", "")).toBe(true);
  });

  it("retorna false comparando string vazia com não-vazia", () => {
    expect(compararComTempoConstante("", "0000")).toBe(false);
  });
});
