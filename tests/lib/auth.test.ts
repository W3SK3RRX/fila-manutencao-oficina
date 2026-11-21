import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import {
  assinarSessaoBalcao,
  assinarSessaoMecanico,
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
