import { describe, it, expect } from "vitest";
import {
  osCreateSchema,
  osEditSchema,
  pausarSchema,
  loginBalcaoSchema,
  loginMecanicoSchema,
} from "@/lib/schemas";

const osValida = {
  placa: "abc-1d23",
  modeloMoto: "Honda CG 160",
  clienteNome: "Cliente Teste",
  clienteTelefone: "11999999999",
  descricao: "Troca de óleo",
  tipoServicoId: "11111111-1111-4111-8111-111111111111",
};

describe("pausarSchema", () => {
  it("exige motivoTexto quando motivo é outro", () => {
    const result = pausarSchema.safeParse({ motivo: "outro" });
    expect(result.success).toBe(false);
  });

  it("aceita outro com motivoTexto e motivos fixos sem texto", () => {
    expect(pausarSchema.safeParse({ motivo: "outro", motivoTexto: "Cliente ligou" }).success).toBe(true);
    expect(pausarSchema.safeParse({ motivo: "aguardando_peca" }).success).toBe(true);
  });
});

describe("osCreateSchema", () => {
  it("normaliza placa para maiúscula sem hífens", () => {
    const result = osCreateSchema.parse(osValida);
    expect(result.placa).toBe("ABC1D23");
  });

  it("torna prazo opcional e converte string em Date quando informado", () => {
    const semPrazo = osCreateSchema.parse(osValida);
    expect(semPrazo.prazo).toBeUndefined();

    const comPrazo = osCreateSchema.parse({ ...osValida, prazo: "2026-11-25T18:00:00-03:00" });
    expect(comPrazo.prazo).toBeInstanceOf(Date);
  });
});

describe("osEditSchema", () => {
  it("também normaliza placa e exige tipoServicoId válido", () => {
    expect(osEditSchema.parse(osValida).placa).toBe("ABC1D23");
    expect(osEditSchema.safeParse({ ...osValida, tipoServicoId: "nao-uuid" }).success).toBe(false);
  });
});

describe("loginBalcaoSchema", () => {
  it("exige senha não vazia", () => {
    expect(loginBalcaoSchema.safeParse({ senha: "" }).success).toBe(false);
    expect(loginBalcaoSchema.safeParse({ senha: "x" }).success).toBe(true);
  });
});

describe("loginMecanicoSchema", () => {
  const mecanicoId = "22222222-2222-4222-8222-222222222222";

  it("aceita PIN de 4 dígitos numéricos", () => {
    expect(loginMecanicoSchema.safeParse({ mecanicoId, pin: "0420" }).success).toBe(true);
  });

  it("rejeita PIN com tamanho diferente de 4 ou com não dígitos", () => {
    expect(loginMecanicoSchema.safeParse({ mecanicoId, pin: "123" }).success).toBe(false);
    expect(loginMecanicoSchema.safeParse({ mecanicoId, pin: "12345" }).success).toBe(false);
    expect(loginMecanicoSchema.safeParse({ mecanicoId, pin: "12a4" }).success).toBe(false);
  });
});
