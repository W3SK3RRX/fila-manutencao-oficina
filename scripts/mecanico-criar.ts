import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface, type Interface } from "node:readline";

import { prisma } from "../lib/db";

// Cadastro de mecânicos (spec: "apenas via seed ou script"). Uso:
//   npm run mecanico:criar
// O PIN nunca é impresso nem gravado em claro: só o hash bcrypt vai para o banco.

const PIN_REGEX = /^\d{4}$/;

type EstadoEco = { mascarar: boolean };

// readline não tem modo de entrada oculta. Sobrescrevemos o eco interno
// (`_writeToOutput`, método do protótipo do Interface) para descartar o que é
// digitado enquanto `mascarar` estiver ligado, deixando passar quebras de linha
// para o cursor ir para a linha seguinte.
function criarInterface(estado: EstadoEco): Interface {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const interno = rl as unknown as { _writeToOutput: (s: string) => void };
  const escreverOriginal = interno._writeToOutput.bind(rl);
  interno._writeToOutput = (s: string) => {
    if (estado.mascarar && !/[\r\n]/.test(s)) return;
    escreverOriginal(s);
  };
  return rl;
}

// Pergunta uma linha; se a entrada fechar antes da resposta (ex.: Ctrl+D ou
// stdin encerrado), rejeita em vez de deixar o processo sair em silêncio.
function perguntar(
  rl: Interface,
  estado: EstadoEco,
  texto: string,
  secreto = false,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const onClose = () => reject(new Error("entrada encerrada antes do fim do cadastro"));
    rl.once("close", onClose);
    if (secreto) {
      process.stdout.write(texto);
      estado.mascarar = true;
    }
    rl.question(secreto ? "" : texto, (resposta) => {
      estado.mascarar = false;
      rl.off("close", onClose);
      resolve(resposta);
    });
  });
}

async function main() {
  const estado: EstadoEco = { mascarar: false };
  const rl = criarInterface(estado);

  try {
    let nome = "";
    while (!nome) {
      nome = (await perguntar(rl, estado, "Nome do mecânico: ")).trim();
      if (!nome) console.log("O nome não pode ficar vazio.");
    }

    let pin = "";
    while (!PIN_REGEX.test(pin)) {
      pin = (await perguntar(rl, estado, "PIN de 4 dígitos: ", true)).trim();
      if (!PIN_REGEX.test(pin)) console.log("O PIN deve ter exatamente 4 dígitos numéricos.");
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await prisma.mecanico.create({ data: { nome, pinHash } });

    console.log(`Mecânico ${nome} criado com sucesso.`);
  } finally {
    rl.close();
  }
}

main()
  .catch((err) => {
    console.error("Falha ao criar mecânico:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
