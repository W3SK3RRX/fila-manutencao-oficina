"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { osEditSchema } from "@/lib/schemas";
import { useTiposServico } from "@/hooks/useTiposServico";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Tipo de entrada do formulário: igual ao schema, mas sem o `.transform` de
// `placa` aplicado ainda (ver mesma nota em FormularioNovaOs.tsx).
type OsEditFormData = z.input<typeof osEditSchema>;

// Shape mínimo necessário para pré-preencher o diálogo: um subconjunto das
// colunas de `ordens_servico` já camelCased (ver FilaLinha em
// hooks/useFila.ts — vw_fila é `os.*` + joins, então toda OS da aba Fila já
// tem estes campos). `prazo` chega como string ISO (ou null) vinda da API.
export interface OsParaEditar {
  id: string;
  placa: string;
  modeloMoto: string;
  clienteNome: string;
  clienteTelefone: string;
  descricao: string;
  tipoServicoId: string;
  prazo?: string | null;
}

export interface DialogoEditarOsProps {
  os: OsParaEditar;
}

// Converte um instante ISO (ou null/undefined) para o formato aceito por
// <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"), usando os componentes
// de data/hora LOCAIS do navegador — mesmo fuso que
// `register("prazo", { setValueAs })` em FormularioNovaOs assume ao
// interpretar o valor de volta como Date no submit (new Date("YYYY-MM-
// DDTHH:mm") é interpretado no fuso local do navegador). Isso é consistente
// com como o prazo foi originalmente criado (Task 20), não com o fuso de
// exibição America/Fortaleza usado por lib/format.ts para leitura — aqui
// precisamos de um valor que o próprio input entenda, não de uma string
// formatada para humanos.
function paraInputDatetimeLocal(valor: string | null | undefined): string {
  if (!valor) return "";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

// Diálogo de edição de uma OS 'na_fila' (Task 22). Reaproveita `osEditSchema`
// (lib/schemas.ts) e o mesmo conjunto de campos de FormularioNovaOs,
// pré-preenchido com os valores atuais da OS — como todos os campos de
// `osEditSchema` são obrigatórios (idêntico a `osCreateSchema`, ver nota do
// Task 10), pré-preencher com os valores já salvos satisfaz essa exigência
// sem precisar de um schema parcial.
//
// Submete via PATCH /api/os/:id. Em sucesso: fecha o diálogo e invalida
// ["fila"] (a OS editada continua 'na_fila' — não afeta a query ["os",
// "em_andamento"]/["os","concluidas_hoje"], então não há necessidade de
// invalidá-las aqui). Em 409 (`TRANSICAO_INVALIDA` — um mecânico pegou a OS
// entre o carregamento da tela e o submit): mostra "A OS mudou de estado,
// atualize a tela." inline dentro do próprio diálogo, sem lib de toast
// instalada (mesmo padrão inline de FormularioNovaOs/Task 20).
export function DialogoEditarOs({ os }: DialogoEditarOsProps) {
  const queryClient = useQueryClient();
  const { data: tipos, isLoading: carregandoTipos } = useTiposServico();
  const [aberto, setAberto] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<OsEditFormData>({
    resolver: zodResolver(osEditSchema),
    defaultValues: {
      placa: os.placa,
      modeloMoto: os.modeloMoto,
      clienteNome: os.clienteNome,
      clienteTelefone: os.clienteTelefone,
      descricao: os.descricao,
      tipoServicoId: os.tipoServicoId,
      prazo: paraInputDatetimeLocal(os.prazo) || undefined,
    },
  });

  function aoMudarAberto(valor: boolean) {
    setAberto(valor);
    if (valor) {
      setErroEnvio(null);
      reset({
        placa: os.placa,
        modeloMoto: os.modeloMoto,
        clienteNome: os.clienteNome,
        clienteTelefone: os.clienteTelefone,
        descricao: os.descricao,
        tipoServicoId: os.tipoServicoId,
        prazo: paraInputDatetimeLocal(os.prazo) || undefined,
      });
    }
  }

  async function onSubmit(dados: OsEditFormData) {
    setErroEnvio(null);
    try {
      await apiFetch(`/api/os/${os.id}`, {
        method: "PATCH",
        body: JSON.stringify(dados),
      });

      await queryClient.invalidateQueries({ queryKey: ["fila"] });
      setAberto(false);
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setErroEnvio("A OS mudou de estado, atualize a tela.");
        return;
      }
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível salvar a OS. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível salvar a OS. Tente novamente.");
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAberto}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        Editar
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Editar OS — {os.placa}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-placa">Placa</Label>
              <Input
                id="editar-placa"
                autoComplete="off"
                aria-invalid={Boolean(errors.placa)}
                {...register("placa")}
              />
              {errors.placa && (
                <p className="text-sm text-destructive">{errors.placa.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-modeloMoto">Modelo da moto</Label>
              <Input
                id="editar-modeloMoto"
                aria-invalid={Boolean(errors.modeloMoto)}
                {...register("modeloMoto")}
              />
              {errors.modeloMoto && (
                <p className="text-sm text-destructive">{errors.modeloMoto.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-clienteNome">Nome do cliente</Label>
              <Input
                id="editar-clienteNome"
                aria-invalid={Boolean(errors.clienteNome)}
                {...register("clienteNome")}
              />
              {errors.clienteNome && (
                <p className="text-sm text-destructive">{errors.clienteNome.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-clienteTelefone">Telefone do cliente</Label>
              <Input
                id="editar-clienteTelefone"
                type="tel"
                aria-invalid={Boolean(errors.clienteTelefone)}
                {...register("clienteTelefone")}
              />
              {errors.clienteTelefone && (
                <p className="text-sm text-destructive">{errors.clienteTelefone.message}</p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="editar-descricao">Descrição</Label>
            <textarea
              id="editar-descricao"
              rows={3}
              aria-invalid={Boolean(errors.descricao)}
              className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30"
              {...register("descricao")}
            />
            {errors.descricao && (
              <p className="text-sm text-destructive">{errors.descricao.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-tipoServicoId">Tipo de serviço</Label>
              <Controller
                control={control}
                name="tipoServicoId"
                render={({ field }) => (
                  <Select
                    value={field.value || null}
                    onValueChange={(valor) => field.onChange(valor ?? "")}
                  >
                    <SelectTrigger
                      id="editar-tipoServicoId"
                      aria-invalid={Boolean(errors.tipoServicoId)}
                      className="w-full"
                    >
                      {/* I7 (revisão final de branch) — ver mesmo comentário
                          em FormularioNovaOs.tsx: sem `items` no
                          <Select.Root> ou children render-prop no
                          <SelectValue>, a base-ui renderiza o `value` cru
                          (o UUID de tipos_servico) em vez do nome. */}
                      <SelectValue>
                        {(valor: string | null) => {
                          if (!valor) {
                            return carregandoTipos ? "Carregando..." : "Selecione o tipo de serviço";
                          }
                          return tipos?.find((tipo) => tipo.id === valor)?.nome ?? valor;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {tipos?.map((tipo) => (
                        <SelectItem key={tipo.id} value={tipo.id}>
                          {tipo.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.tipoServicoId && (
                <p className="text-sm text-destructive">{errors.tipoServicoId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="editar-prazo">Prazo (opcional)</Label>
              <Input
                id="editar-prazo"
                type="datetime-local"
                aria-invalid={Boolean(errors.prazo)}
                {...register("prazo", {
                  setValueAs: (valor: string) => (valor === "" ? undefined : valor),
                })}
              />
              {errors.prazo && (
                <p className="text-sm text-destructive">{errors.prazo.message}</p>
              )}
            </div>
          </div>

          {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              Salvar alterações
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
