import { describe, it, expect, afterEach, vi } from "vitest";
import { register } from "@/instrumentation";

// I5 (revisão final de branch): `.env.example` ship com JWT_SECRET
// (`dev-secret-change-me`) e BALCAO_SENHA (`0000`) fracos e satisfaz todo
// `${VAR:?}` de docker-compose.yml sem nenhum aviso. `register()`
// (instrumentation.ts) deve recusar iniciar o servidor em produção com
// qualquer um dos dois ainda no valor de exemplo (ou um JWT_SECRET curto) —
// nunca deve se aplicar em dev/test (onde ambos os valores de exemplo são
// esperados e usados pelos próprios testes de auth).
//
// `vi.stubEnv` (não atribuição direta a `process.env.NODE_ENV`): `@types/node`
// tipa `NODE_ENV` como somente leitura, e `vi.unstubAllEnvs()` no afterEach
// restaura exatamente o valor original — evita vazar NODE_ENV/JWT_SECRET/
// BALCAO_SENHA trocados para outros testes do mesmo worker (ex.:
// tests/lib/auth.test.ts, tests/api/auth.test.ts).
//
// Cada teste estuba explicitamente TANTO JWT_SECRET QUANTO BALCAO_SENHA com
// valores válidos por padrão (mesmo quando o foco do teste é o outro guard):
// sem isso, um teste que só estuba JWT_SECRET herdaria o BALCAO_SENHA real
// de .env.test (que é "0000", o próprio valor de exemplo) e lançaria pelo
// guard errado.
const JWT_SECRET_VALIDO = "a".repeat(48);
const BALCAO_SENHA_VALIDA = "uma-senha-bem-diferente-de-0000";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("instrumentation.register (guard de JWT_SECRET em produção)", () => {
  it("não lança fora de produção, mesmo com segredo fraco", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("JWT_SECRET", "dev-secret-change-me");
    vi.stubEnv("BALCAO_SENHA", "0000");

    expect(() => register()).not.toThrow();
  });

  it("em produção, lança se JWT_SECRET for o valor de exemplo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "dev-secret-change-me");
    vi.stubEnv("BALCAO_SENHA", BALCAO_SENHA_VALIDA);

    expect(() => register()).toThrow(/JWT_SECRET/);
  });

  it("em produção, lança se JWT_SECRET tiver menos de 32 caracteres", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "curto-demais");
    vi.stubEnv("BALCAO_SENHA", BALCAO_SENHA_VALIDA);

    expect(() => register()).toThrow(/JWT_SECRET/);
  });

  it("em produção, não lança com um segredo longo e diferente do exemplo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", BALCAO_SENHA_VALIDA);

    expect(() => register()).not.toThrow();
  });
});

describe("instrumentation.register (guard de BALCAO_SENHA em produção)", () => {
  it("não lança fora de produção, mesmo com o valor de exemplo", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", "0000");

    expect(() => register()).not.toThrow();
  });

  it("em produção, lança se BALCAO_SENHA for o valor de exemplo (0000)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", "0000");

    expect(() => register()).toThrow(/BALCAO_SENHA/);
  });

  it("em produção, lança se BALCAO_SENHA estiver vazia/ausente", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", "");

    expect(() => register()).toThrow(/BALCAO_SENHA/);
  });

  // Design final (3ª rodada de correção de segurança): o bloqueio por IP
  // sozinho não impede força bruta verdadeiramente distribuída — quem faz
  // esse trabalho é a própria senha, por isso um tamanho mínimo real (6),
  // não só a checagem do valor de exemplo literal "0000" (que também
  // passaria nesse teste, mas por um motivo diferente — este teste prova
  // especificamente a checagem de TAMANHO, com uma senha curta que NÃO é o
  // valor de exemplo).
  it("em produção, lança se BALCAO_SENHA tiver menos de 6 caracteres (mesmo que diferente do exemplo)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", "ab12");

    expect(() => register()).toThrow(/BALCAO_SENHA/);
  });

  it("em produção, não lança com uma senha diferente do valor de exemplo", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", JWT_SECRET_VALIDO);
    vi.stubEnv("BALCAO_SENHA", BALCAO_SENHA_VALIDA);

    expect(() => register()).not.toThrow();
  });
});
