-- CreateEnum
CREATE TYPE "status_os" AS ENUM ('na_fila', 'em_execucao', 'pausada', 'concluida', 'cancelada');

-- CreateTable
CREATE TABLE "tipos_servico" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "peso" INTEGER NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mecanicos" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mecanicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordens_servico" (
    "id" UUID NOT NULL,
    "numero" SERIAL NOT NULL,
    "placa" TEXT NOT NULL,
    "modelo_moto" TEXT NOT NULL,
    "cliente_nome" TEXT NOT NULL,
    "cliente_telefone" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo_servico_id" UUID NOT NULL,
    "prazo" TIMESTAMPTZ,
    "status" "status_os" NOT NULL DEFAULT 'na_fila',
    "mecanico_id" UUID,
    "motivo_pausa" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciado_em" TIMESTAMPTZ,
    "concluido_em" TIMESTAMPTZ,
    "atualizado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordens_servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "os_eventos" (
    "id" UUID NOT NULL,
    "os_id" UUID NOT NULL,
    "de_status" "status_os",
    "para_status" "status_os" NOT NULL,
    "mecanico_id" UUID,
    "origem" TEXT NOT NULL,
    "motivo" TEXT,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "os_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_servico_nome_key" ON "tipos_servico"("nome");

-- CreateIndex
CREATE INDEX "ordens_servico_status_idx" ON "ordens_servico"("status");

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_tipo_servico_id_fkey" FOREIGN KEY ("tipo_servico_id") REFERENCES "tipos_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_mecanico_id_fkey" FOREIGN KEY ("mecanico_id") REFERENCES "mecanicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "os_eventos" ADD CONSTRAINT "os_eventos_mecanico_id_fkey" FOREIGN KEY ("mecanico_id") REFERENCES "mecanicos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
