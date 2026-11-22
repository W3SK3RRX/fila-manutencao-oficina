import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "@/instrumentation";

// I5 (revisão final de branch): `.env.example` ship com JWT_SECRET fraco
// (`dev-secret-change-me`) e satisfaz todo `${VAR:?}` de docker-compose.yml
// sem nenhum aviso. `register()` (instrumentation.ts) deve recusar iniciar o
// servidor em produção com um segredo curto ou igual ao valor de exemplo —
// nunca deve se aplicar em dev/test (onde o segredo de exemplo é esperado e
// usado pelos próprios testes de auth).
//
// `vi.stubEnv` (não atribuição direta a `process.env.NODE_ENV`): `@types/node`
// tipa `NODE_ENV` como somente leitura, e `vi.unstubAllEnvs()` no afterEach
// restaura exatamente o valor original — evita vazar NODE_ENV/JWT_SECRET
// trocados para outros testes do mesmo worker (ex.: tests/lib/auth.test.ts).
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation.register (guard de JWT_SECRET em produção)", () => {
  it("não lança fora de produção, mesmo com segredo fraco", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("JWT_SECRET", "dev-secret-change-me");

    expect(() => register()).not.toThrow();
  });

  it("em produção, lança se JWT_SECRET for o valor de exemplo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "dev-secret-change-me");

    expect(() => register()).toThrow(/JWT_SECRET/);
  });

  it("em produção, lança se JWT_SECRET tiver menos de 32 caracteres", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "curto-demais");

    expect(() => register()).toThrow(/JWT_SECRET/);
  });

  it("em produção, não lança com um segredo longo e diferente do exemplo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "a".repeat(48));

    expect(() => register()).not.toThrow();
  });
});
