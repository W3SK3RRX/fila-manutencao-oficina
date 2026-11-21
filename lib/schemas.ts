import { z } from "zod";

// Fonte única de verdade para validação de OS e autenticação.
// Importado tanto por route handlers da API quanto por formulários (React Hook Form + zodResolver).

const osBaseShape = {
  placa: z
    .string()
    .min(1, "Placa é obrigatória")
    .transform((valor) => valor.toUpperCase().replace(/-/g, "")),
  modeloMoto: z.string().min(1, "Modelo da moto é obrigatório"),
  clienteNome: z.string().min(1, "Nome do cliente é obrigatório"),
  clienteTelefone: z.string().min(1, "Telefone do cliente é obrigatório"),
  descricao: z.string().min(1, "Descrição é obrigatória"),
  tipoServicoId: z.string().uuid("Tipo de serviço inválido"),
  prazo: z.coerce.date().optional(),
};

export const osCreateSchema = z.object(osBaseShape);

export const osEditSchema = z.object(osBaseShape);

export const pausarSchema = z
  .object({
    motivo: z.enum(["aguardando_peca", "aguardando_aprovacao", "outro"], {
      message: "Motivo da pausa inválido",
    }),
    motivoTexto: z.string().optional(),
  })
  .superRefine((dados, ctx) => {
    if (dados.motivo === "outro" && !dados.motivoTexto?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["motivoTexto"],
        message: "Informe o motivo da pausa",
      });
    }
  });

export const loginBalcaoSchema = z.object({
  senha: z.string().min(1, "Senha é obrigatória"),
});

export const loginMecanicoSchema = z.object({
  mecanicoId: z.string().uuid("Mecânico inválido"),
  pin: z
    .string()
    .length(4, "PIN deve ter 4 dígitos")
    .regex(/^\d+$/, "PIN deve conter apenas dígitos"),
});
