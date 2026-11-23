-- CreateTable
CREATE TABLE "os_comentarios" (
    "id" UUID NOT NULL,
    "os_id" UUID NOT NULL,
    "autor_tipo" TEXT NOT NULL,
    "autor_nome" TEXT,
    "texto" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "os_comentarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "os_comentarios_os_id_idx" ON "os_comentarios"("os_id");

-- AddForeignKey
ALTER TABLE "os_comentarios" ADD CONSTRAINT "os_comentarios_os_id_fkey" FOREIGN KEY ("os_id") REFERENCES "ordens_servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
