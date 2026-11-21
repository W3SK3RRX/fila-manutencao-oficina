import { prisma } from "./db";
import { StatusOs, type OrdemServico } from "./generated/prisma/client";

// Máquina de estados das ordens de serviço (OS). Cada função representa uma
// transição válida do fluxo: faz um UPDATE condicional (no padrão
// `WHERE id = $1 AND status = '<status_origem>' [AND mecanico_id = $2]`) e,
// na mesma transação, grava um registro de auditoria em `os_eventos`. Se o
// UPDATE condicional não afetar nenhuma linha (ou seja, a OS não está no
// estado esperado, ou pertence a outro mecânico), a transação é abortada e
// nenhum evento é gravado — ver `TransicaoInvalidaError`.
//
// Cálculo de score e escolha de "próxima OS" (pegar_proximo) são SQL puro
// (ver prisma/migrations) e nunca devem ser reimplementados aqui: este
// módulo apenas invoca a função via `$queryRaw`.

export class TransicaoInvalidaError extends Error {
  constructor(mensagem = "Transição de status inválida") {
    super(mensagem);
    this.name = "TransicaoInvalidaError";
  }
}

export type OsCreateInput = {
  placa: string;
  modeloMoto: string;
  clienteNome: string;
  clienteTelefone: string;
  descricao: string;
  tipoServicoId: string;
  prazo?: Date;
};

export type OsEditInput = OsCreateInput;

// Regex usada para reconhecer uma violação da unique constraint parcial
// `ux_ordens_servico_mecanico_em_execucao` (um mecânico só pode ter uma OS
// em_execucao por vez), levantada pelo Postgres (código 23505) e propagada
// pelo Prisma como erro de query bruta. Traduzimos essa violação, que é uma
// regra de negócio (mecânico já tem outra OS em andamento), para o mesmo
// tipo de erro usado em qualquer outra transição inválida. O nome da
// constraint é verificado explicitamente para que uma violação de unicidade
// de qualquer outra constraint (hoje inexistente nestes caminhos de código,
// mas não impossível no futuro) nunca seja mascarada como esta regra de
// negócio — ela deve propagar como erro inesperado.
// Exportada apenas para permitir um teste unitário direto da especificidade
// do padrão (ver tests/lib/os-service.test.ts); não é parte da API pública
// do módulo.
export const PADRAO_VIOLACAO_UNICIDADE =
  /duplicate key value violates unique constraint "ux_ordens_servico_mecanico_em_execucao"/;

function traduzirViolacaoUnicidade(err: unknown, mensagem: string): never {
  const textoErro = err instanceof Error ? err.message : String(err);
  if (PADRAO_VIOLACAO_UNICIDADE.test(textoErro)) {
    throw new TransicaoInvalidaError(mensagem);
  }
  throw err;
}

export async function criarOs(dados: OsCreateInput): Promise<OrdemServico> {
  return prisma.$transaction(async (tx) => {
    const os = await tx.ordemServico.create({ data: dados });
    await tx.osEvento.create({
      data: {
        osId: os.id,
        deStatus: null,
        paraStatus: StatusOs.na_fila,
        mecanicoId: null,
        origem: "balcao",
      },
    });
    return os;
  });
}

export async function editarOs(id: string, dados: OsEditInput): Promise<OrdemServico> {
  return prisma.$transaction(async (tx) => {
    const linhasAfetadas = await tx.$executeRaw`
      UPDATE ordens_servico
      SET placa = ${dados.placa},
          modelo_moto = ${dados.modeloMoto},
          cliente_nome = ${dados.clienteNome},
          cliente_telefone = ${dados.clienteTelefone},
          descricao = ${dados.descricao},
          tipo_servico_id = ${dados.tipoServicoId}::uuid,
          prazo = ${dados.prazo ?? null}
      WHERE id = ${id}::uuid AND status = 'na_fila'
    `;

    if (linhasAfetadas === 0) {
      throw new TransicaoInvalidaError("Só é possível editar uma OS enquanto ela está na fila");
    }

    await tx.osEvento.create({
      data: {
        osId: id,
        deStatus: StatusOs.na_fila,
        paraStatus: StatusOs.na_fila,
        mecanicoId: null,
        origem: "balcao",
      },
    });

    return tx.ordemServico.findUniqueOrThrow({ where: { id } });
  });
}

export async function pegarProximo(mecanicoId: string): Promise<OrdemServico | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const resultado = await tx.$queryRaw<
        OrdemServico[]
      >`SELECT * FROM pegar_proximo(${mecanicoId}::uuid)`;

      if (resultado.length === 0) {
        return null;
      }

      const os = resultado[0];
      await tx.osEvento.create({
        data: {
          osId: os.id,
          deStatus: StatusOs.na_fila,
          paraStatus: StatusOs.em_execucao,
          mecanicoId,
          origem: "mecanico",
        },
      });
      return os;
    });
  } catch (err) {
    return traduzirViolacaoUnicidade(err, "Mecânico já possui uma OS em execução");
  }
}

export async function pausarOs(
  id: string,
  mecanicoId: string,
  motivo: string,
  motivoTexto?: string,
): Promise<OrdemServico> {
  const motivoPausa = motivo === "outro" ? (motivoTexto ?? "") : motivo;

  return prisma.$transaction(async (tx) => {
    const linhasAfetadas = await tx.$executeRaw`
      UPDATE ordens_servico
      SET status = 'pausada', motivo_pausa = ${motivoPausa}
      WHERE id = ${id}::uuid AND status = 'em_execucao' AND mecanico_id = ${mecanicoId}::uuid
    `;

    if (linhasAfetadas === 0) {
      throw new TransicaoInvalidaError(
        "Só é possível pausar uma OS em execução pelo mecânico responsável",
      );
    }

    await tx.osEvento.create({
      data: {
        osId: id,
        deStatus: StatusOs.em_execucao,
        paraStatus: StatusOs.pausada,
        mecanicoId,
        origem: "mecanico",
        motivo: motivoPausa,
      },
    });

    return tx.ordemServico.findUniqueOrThrow({ where: { id } });
  });
}

export async function retomarOs(id: string, mecanicoId: string): Promise<OrdemServico> {
  try {
    return await prisma.$transaction(async (tx) => {
      const linhasAfetadas = await tx.$executeRaw`
        UPDATE ordens_servico
        SET status = 'em_execucao', motivo_pausa = NULL
        WHERE id = ${id}::uuid AND status = 'pausada' AND mecanico_id = ${mecanicoId}::uuid
      `;

      if (linhasAfetadas === 0) {
        throw new TransicaoInvalidaError(
          "Só é possível retomar uma OS pausada pelo mecânico responsável",
        );
      }

      await tx.osEvento.create({
        data: {
          osId: id,
          deStatus: StatusOs.pausada,
          paraStatus: StatusOs.em_execucao,
          mecanicoId,
          origem: "mecanico",
        },
      });

      return tx.ordemServico.findUniqueOrThrow({ where: { id } });
    });
  } catch (err) {
    if (err instanceof TransicaoInvalidaError) {
      throw err;
    }
    return traduzirViolacaoUnicidade(err, "Mecânico já possui outra OS em execução");
  }
}

export async function devolverOs(
  id: string,
  mecanicoIdOuBalcao: string | "balcao",
): Promise<OrdemServico> {
  const ehBalcao = mecanicoIdOuBalcao === "balcao";

  return prisma.$transaction(async (tx) => {
    const linhasAfetadas = ehBalcao
      ? await tx.$executeRaw`
          UPDATE ordens_servico
          SET status = 'na_fila', mecanico_id = NULL, motivo_pausa = NULL
          WHERE id = ${id}::uuid AND status = 'pausada'
        `
      : await tx.$executeRaw`
          UPDATE ordens_servico
          SET status = 'na_fila', mecanico_id = NULL, motivo_pausa = NULL
          WHERE id = ${id}::uuid AND status = 'pausada' AND mecanico_id = ${mecanicoIdOuBalcao}::uuid
        `;

    if (linhasAfetadas === 0) {
      throw new TransicaoInvalidaError("Só é possível devolver à fila uma OS pausada");
    }

    await tx.osEvento.create({
      data: {
        osId: id,
        deStatus: StatusOs.pausada,
        paraStatus: StatusOs.na_fila,
        mecanicoId: ehBalcao ? null : mecanicoIdOuBalcao,
        origem: ehBalcao ? "balcao" : "mecanico",
      },
    });

    return tx.ordemServico.findUniqueOrThrow({ where: { id } });
  });
}

export async function concluirOs(id: string, mecanicoId: string): Promise<OrdemServico> {
  return prisma.$transaction(async (tx) => {
    const linhasAfetadas = await tx.$executeRaw`
      UPDATE ordens_servico
      SET status = 'concluida', concluido_em = now()
      WHERE id = ${id}::uuid AND status = 'em_execucao' AND mecanico_id = ${mecanicoId}::uuid
    `;

    if (linhasAfetadas === 0) {
      throw new TransicaoInvalidaError(
        "Só é possível concluir uma OS em execução pelo mecânico responsável",
      );
    }

    await tx.osEvento.create({
      data: {
        osId: id,
        deStatus: StatusOs.em_execucao,
        paraStatus: StatusOs.concluida,
        mecanicoId,
        origem: "mecanico",
      },
    });

    return tx.ordemServico.findUniqueOrThrow({ where: { id } });
  });
}

export async function cancelarOs(id: string, motivo?: string): Promise<OrdemServico> {
  return prisma.$transaction(async (tx) => {
    // `status IN ('na_fila', 'pausada')` aceita duas origens possíveis, então
    // travamos a linha antes do UPDATE para capturar de qual delas a OS
    // estava partindo (necessário para `de_status` no evento) sem abrir uma
    // janela de corrida entre a leitura e o UPDATE condicional abaixo.
    const atual = await tx.$queryRaw<
      { status: StatusOs }[]
    >`SELECT status FROM ordens_servico WHERE id = ${id}::uuid FOR UPDATE`;
    const statusAnterior = atual[0]?.status;

    const linhasAfetadas = await tx.$executeRaw`
      UPDATE ordens_servico
      SET status = 'cancelada'
      WHERE id = ${id}::uuid AND status IN ('na_fila', 'pausada')
    `;

    if (linhasAfetadas === 0 || !statusAnterior) {
      throw new TransicaoInvalidaError("Só é possível cancelar uma OS na fila ou pausada");
    }

    await tx.osEvento.create({
      data: {
        osId: id,
        deStatus: statusAnterior,
        paraStatus: StatusOs.cancelada,
        mecanicoId: null,
        origem: "balcao",
        motivo: motivo ?? null,
      },
    });

    return tx.ordemServico.findUniqueOrThrow({ where: { id } });
  });
}
