import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  TransicaoInvalidaError,
  PADRAO_VIOLACAO_UNICIDADE,
  criarOs,
  editarOs,
  pegarProximo,
  pausarOs,
  retomarOs,
  devolverOs,
  concluirOs,
  cancelarOs,
} from "@/lib/os-service";

// Cada teste cria seu próprio tipo de serviço / mecânico / OS e os
// desfaz em afterEach (em vez de afterAll único), seguindo o padrão de
// tests/db/*.test.ts mas isolando os registros por teste.
const criadas: { tipoIds: string[]; mecanicoIds: string[]; osIds: string[] } = {
  tipoIds: [],
  mecanicoIds: [],
  osIds: [],
};

afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.mecanicoIds.length) {
    await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
  }
  if (criadas.tipoIds.length) {
    await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  }
  criadas.tipoIds = [];
  criadas.mecanicoIds = [];
  criadas.osIds = [];
});

async function criarTipo(peso = 50) {
  const tipo = await prisma.tipoServico.create({
    data: { nome: `Teste os-service ${randomUUID()}`, peso },
  });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}

async function criarMecanico(nome = "Mecânico Teste") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}

async function criarOsDireta(tipoId: string, status: "na_fila" | "em_execucao" | "pausada", mecanicoId?: string) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 10000)}`,
      modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste",
      clienteTelefone: "00000000000",
      descricao: "Teste os-service",
      tipoServicoId: tipoId,
      status,
      mecanicoId: mecanicoId ?? null,
      iniciadoEm: status === "na_fila" ? null : new Date(),
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

async function contarEventos(osId: string) {
  return prisma.osEvento.findMany({ where: { osId }, orderBy: { criadoEm: "asc" } });
}

describe("pausarOs", () => {
  it("em uma OS em_execucao grava exatamente um evento em_execucao -> pausada", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", mecanico.id);

    const atualizada = await pausarOs(os.id, mecanico.id, "aguardando_peca");

    expect(atualizada.status).toBe("pausada");

    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].deStatus).toBe("em_execucao");
    expect(eventos[0].paraStatus).toBe("pausada");
  });

  it("em uma OS na_fila lança TransicaoInvalidaError e não grava nenhum evento", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "na_fila");

    await expect(pausarOs(os.id, mecanico.id, "aguardando_peca")).rejects.toThrow(
      TransicaoInvalidaError,
    );

    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(0);

    const osAposFalha = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAposFalha.status).toBe("na_fila");
  });

  it("rejeita o mecânico errado (ownership check) mesmo com a OS em_execucao", async () => {
    const tipo = await criarTipo();
    const dono = await criarMecanico("Dono");
    const outro = await criarMecanico("Outro");
    const os = await criarOsDireta(tipo.id, "em_execucao", dono.id);

    await expect(pausarOs(os.id, outro.id, "aguardando_peca")).rejects.toThrow(
      TransicaoInvalidaError,
    );
    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(0);
  });
});

describe("devolverOs", () => {
  it("mantém criado_em inalterado e limpa mecanico_id ao devolver à fila", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", mecanico.id);
    const criadoEmAntes = os.criadoEm;

    // Garante que, se o código (incorretamente) tocasse em criado_em com
    // now(), o teste pegaria a diferença mesmo em execuções muito rápidas.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const devolvida = await devolverOs(os.id, mecanico.id);

    expect(devolvida.status).toBe("na_fila");
    expect(devolvida.mecanicoId).toBeNull();
    expect(devolvida.criadoEm.getTime()).toBe(criadoEmAntes.getTime());
  });

  it("aceita 'balcao' como chamador e não exige mecanico_id", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", mecanico.id);

    const devolvida = await devolverOs(os.id, "balcao");
    expect(devolvida.status).toBe("na_fila");
    expect(devolvida.mecanicoId).toBeNull();

    const eventos = await contarEventos(os.id);
    expect(eventos[0].origem).toBe("balcao");
    expect(eventos[0].mecanicoId).toBeNull();
  });

  it("recusa devolver uma OS pausada que pertence a outro mecânico", async () => {
    const tipo = await criarTipo();
    const dono = await criarMecanico("Dono");
    const outro = await criarMecanico("Outro");
    const os = await criarOsDireta(tipo.id, "pausada", dono.id);

    await expect(devolverOs(os.id, outro.id)).rejects.toThrow(TransicaoInvalidaError);
  });
});

describe("criarOs", () => {
  it("cria a OS com status na_fila e grava um evento de criação", async () => {
    const tipo = await criarTipo();
    const os = await criarOs({
      placa: "ABC1234",
      modeloMoto: "Honda CG 160",
      clienteNome: "Cliente Teste",
      clienteTelefone: "11999999999",
      descricao: "Troca de óleo",
      tipoServicoId: tipo.id,
    });
    criadas.osIds.push(os.id);

    expect(os.status).toBe("na_fila");
    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].deStatus).toBeNull();
    expect(eventos[0].paraStatus).toBe("na_fila");
  });
});

describe("editarOs", () => {
  it("edita uma OS na_fila", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const editada = await editarOs(os.id, {
      placa: "ZZZ9999",
      modeloMoto: "Yamaha Fazer",
      clienteNome: "Outro Cliente",
      clienteTelefone: "11888888888",
      descricao: "Revisão completa",
      tipoServicoId: tipo.id,
    });

    expect(editada.placa).toBe("ZZZ9999");
    expect(editada.descricao).toBe("Revisão completa");
  });

  it("recusa editar uma OS que não está mais na_fila", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", mecanico.id);

    await expect(
      editarOs(os.id, {
        placa: "ZZZ9999",
        modeloMoto: "Yamaha Fazer",
        clienteNome: "Outro Cliente",
        clienteTelefone: "11888888888",
        descricao: "Revisão completa",
        tipoServicoId: tipo.id,
      }),
    ).rejects.toThrow(TransicaoInvalidaError);
  });
});

describe("pegarProximo", () => {
  it("atribui a próxima OS da fila ao mecânico e grava o evento na_fila -> em_execucao", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const atribuida = await pegarProximo(mecanico.id);
    expect(atribuida?.id).toBe(os.id);
    expect(atribuida?.status).toBe("em_execucao");

    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].deStatus).toBe("na_fila");
    expect(eventos[0].paraStatus).toBe("em_execucao");
    expect(eventos[0].mecanicoId).toBe(mecanico.id);
  });

  it("retorna null quando não há OS na fila", async () => {
    const mecanico = await criarMecanico();
    const resultado = await pegarProximo(mecanico.id);
    expect(resultado).toBeNull();
  });

  it("traduz a violação de unicidade em TransicaoInvalidaError quando o mecânico já tem uma OS em_execucao", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    await criarOsDireta(tipo.id, "na_fila");
    await criarOsDireta(tipo.id, "na_fila");

    const primeira = await pegarProximo(mecanico.id);
    expect(primeira).not.toBeNull();

    await expect(pegarProximo(mecanico.id)).rejects.toThrow(TransicaoInvalidaError);
  });
});

describe("retomarOs", () => {
  it("retoma uma OS pausada do próprio mecânico", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", mecanico.id);

    const retomada = await retomarOs(os.id, mecanico.id);
    expect(retomada.status).toBe("em_execucao");

    const eventos = await contarEventos(os.id);
    expect(eventos[0].deStatus).toBe("pausada");
    expect(eventos[0].paraStatus).toBe("em_execucao");
  });

  it("traduz violação de unicidade quando o mecânico já tem outra OS em_execucao", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    await criarOsDireta(tipo.id, "em_execucao", mecanico.id);
    const pausada = await criarOsDireta(tipo.id, "pausada", mecanico.id);

    await expect(retomarOs(pausada.id, mecanico.id)).rejects.toThrow(TransicaoInvalidaError);
  });

  it("rejeita o mecânico errado (ownership check) mesmo com a OS pausada", async () => {
    const tipo = await criarTipo();
    const dono = await criarMecanico("Dono");
    const outro = await criarMecanico("Outro");
    const os = await criarOsDireta(tipo.id, "pausada", dono.id);

    await expect(retomarOs(os.id, outro.id)).rejects.toThrow(TransicaoInvalidaError);
    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(0);

    const osAposFalha = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAposFalha.mecanicoId).toBe(dono.id);
  });
});

describe("concluirOs", () => {
  it("conclui uma OS em_execucao do mecânico responsável e define concluido_em", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", mecanico.id);

    const concluida = await concluirOs(os.id, mecanico.id);
    expect(concluida.status).toBe("concluida");
    expect(concluida.concluidoEm).not.toBeNull();
  });

  it("recusa concluir uma OS pausada", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", mecanico.id);

    await expect(concluirOs(os.id, mecanico.id)).rejects.toThrow(TransicaoInvalidaError);
  });

  it("rejeita o mecânico errado (ownership check) mesmo com a OS em_execucao", async () => {
    const tipo = await criarTipo();
    const dono = await criarMecanico("Dono");
    const outro = await criarMecanico("Outro");
    const os = await criarOsDireta(tipo.id, "em_execucao", dono.id);

    await expect(concluirOs(os.id, outro.id)).rejects.toThrow(TransicaoInvalidaError);
    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(0);

    const osAposFalha = await prisma.ordemServico.findUniqueOrThrow({ where: { id: os.id } });
    expect(osAposFalha.mecanicoId).toBe(dono.id);
  });
});

describe("PADRAO_VIOLACAO_UNICIDADE", () => {
  it("casa apenas a violação da constraint ux_ordens_servico_mecanico_em_execucao", () => {
    const mensagemEsperada =
      'duplicate key value violates unique constraint "ux_ordens_servico_mecanico_em_execucao"';
    expect(PADRAO_VIOLACAO_UNICIDADE.test(mensagemEsperada)).toBe(true);
  });

  it("não casa uma violação de unicidade de outra constraint, mesmo com o mesmo prefixo genérico", () => {
    const mensagemOutraConstraint =
      'duplicate key value violates unique constraint "ordens_servico_placa_key"';
    expect(PADRAO_VIOLACAO_UNICIDADE.test(mensagemOutraConstraint)).toBe(false);
  });
});

describe("cancelarOs", () => {
  it("cancela uma OS na_fila preservando o status de origem no evento", async () => {
    const tipo = await criarTipo();
    const os = await criarOsDireta(tipo.id, "na_fila");

    const cancelada = await cancelarOs(os.id, "Cliente desistiu");
    expect(cancelada.status).toBe("cancelada");

    const eventos = await contarEventos(os.id);
    expect(eventos[0].deStatus).toBe("na_fila");
    expect(eventos[0].paraStatus).toBe("cancelada");
    expect(eventos[0].motivo).toBe("Cliente desistiu");
  });

  it("cancela uma OS pausada preservando 'pausada' como status de origem no evento", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "pausada", mecanico.id);

    const cancelada = await cancelarOs(os.id);
    expect(cancelada.status).toBe("cancelada");

    const eventos = await contarEventos(os.id);
    expect(eventos[0].deStatus).toBe("pausada");
  });

  it("recusa cancelar uma OS em_execucao", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const os = await criarOsDireta(tipo.id, "em_execucao", mecanico.id);

    await expect(cancelarOs(os.id)).rejects.toThrow(TransicaoInvalidaError);
    const eventos = await contarEventos(os.id);
    expect(eventos).toHaveLength(0);
  });
});
