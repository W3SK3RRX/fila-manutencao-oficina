import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { assinarSessaoBalcao, assinarSessaoMecanico, NOME_COOKIE_SESSAO } from "@/lib/auth";

function buildRequest(path: string, cookieValue?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (cookieValue) headers.cookie = `${NOME_COOKIE_SESSAO}=${cookieValue}`;
  return new NextRequest(new Request(`http://localhost${path}`, { headers }));
}

const criadas: { tipoIds: string[]; mecanicoIds: string[]; osIds: string[] } = { tipoIds: [], mecanicoIds: [], osIds: [] };
afterEach(async () => {
  if (criadas.osIds.length) {
    await prisma.osEvento.deleteMany({ where: { osId: { in: criadas.osIds } } });
    await prisma.ordemServico.deleteMany({ where: { id: { in: criadas.osIds } } });
  }
  if (criadas.mecanicoIds.length) await prisma.mecanico.deleteMany({ where: { id: { in: criadas.mecanicoIds } } });
  if (criadas.tipoIds.length) await prisma.tipoServico.deleteMany({ where: { id: { in: criadas.tipoIds } } });
  criadas.tipoIds = []; criadas.mecanicoIds = []; criadas.osIds = [];
});

async function criarTipo() {
  const tipo = await prisma.tipoServico.create({ data: { nome: `Teste realizadas ${randomUUID()}`, peso: 50 } });
  criadas.tipoIds.push(tipo.id);
  return tipo;
}
async function criarMecanico(nome = "Mecânico Teste Realizadas") {
  const mecanico = await prisma.mecanico.create({ data: { nome, pinHash: "hash" } });
  criadas.mecanicoIds.push(mecanico.id);
  return mecanico;
}
async function criarOsConcluida(tipoId: string, mecanicoId: string) {
  const os = await prisma.ordemServico.create({
    data: {
      placa: `TST${Math.floor(Math.random() * 100000)}`, modeloMoto: "Modelo Teste",
      clienteNome: "Cliente Teste", clienteTelefone: "00000000000", descricao: "Teste realizadas",
      tipoServicoId: tipoId, status: "concluida", mecanicoId, iniciadoEm: new Date(), concluidoEm: new Date(),
    },
  });
  criadas.osIds.push(os.id);
  return os;
}

describe("GET /api/mecanico/realizadas", () => {
  it("sem sessão: retorna 401", async () => {
    const { GET } = await import("@/app/api/mecanico/realizadas/route");
    const response = await GET(buildRequest("/api/mecanico/realizadas"));
    expect(response.status).toBe(401);
  });

  it("sessão de balcão: retorna 403", async () => {
    const { GET } = await import("@/app/api/mecanico/realizadas/route");
    const token = await assinarSessaoBalcao();
    const response = await GET(buildRequest("/api/mecanico/realizadas", token));
    expect(response.status).toBe(403);
  });

  it("só traz OS concluídas hoje (fuso America/Fortaleza) pelo próprio mecânico", async () => {
    const tipo = await criarTipo();
    const mecanico = await criarMecanico();
    const outroMecanico = await criarMecanico("Outro Mecânico");

    const minhaHoje = await criarOsConcluida(tipo.id, mecanico.id);
    const minhaOntem = await criarOsConcluida(tipo.id, mecanico.id);
    const deOutro = await criarOsConcluida(tipo.id, outroMecanico.id);

    await prisma.$executeRaw`
      UPDATE ordens_servico
      SET concluido_em = (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '23 hours 30 minutes') AT TIME ZONE 'America/Fortaleza'
      WHERE id = ${minhaHoje.id}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE ordens_servico
      SET concluido_em = (date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') + interval '23 hours 30 minutes' - interval '1 day') AT TIME ZONE 'America/Fortaleza'
      WHERE id = ${minhaOntem.id}::uuid
    `;

    const { GET } = await import("@/app/api/mecanico/realizadas/route");
    const token = await assinarSessaoMecanico(mecanico.id);
    const response = await GET(buildRequest("/api/mecanico/realizadas", token));
    const corpo = await response.json();

    expect(response.status).toBe(200);
    const ids = corpo.map((l: { id: string }) => l.id);
    expect(ids).toContain(minhaHoje.id);
    expect(ids).not.toContain(minhaOntem.id);
    expect(ids).not.toContain(deOutro.id);
  });
});
