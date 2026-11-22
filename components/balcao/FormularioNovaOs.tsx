"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { osCreateSchema } from "@/lib/schemas";
import { useTiposServico } from "@/hooks/useTiposServico";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Tipo de entrada do formulário: igual ao schema, mas sem o `.transform` de
// `placa` aplicado ainda (o input do usuário é a string crua; o zodResolver
// roda o parse — incluindo o transform — antes de chamar onSubmit).
type NovaOsFormData = z.input<typeof osCreateSchema>;

// Formulário de criação de nova OS (coluna esquerda de /balcao, Task 20).
// Usa `osCreateSchema` (lib/schemas.ts) + React Hook Form, igual ao padrão de
// FormularioLoginBalcao. O campo tipo_servico é um <Select> (base-ui, não um
// <select> nativo), por isso usa Controller em vez de `register` direto. O
// campo prazo é opcional: o input HTML `datetime-local` manda "" quando
// vazio, e `setValueAs` converte isso para `undefined` antes do parse do
// zod — sem isso, `z.coerce.date()` tentaria `new Date("")` (Invalid Date) e
// bloquearia o submit mesmo com o campo sendo opcional.
//
// Em sucesso: limpa o formulário, invalida a query key ["fila"] (para que a
// aba Fila, construída na Task 21, puxe a nova linha) e mostra uma
// confirmação inline simples (sem lib de toast instalada).
//
// `onOsCriada` (Task 21): callback opcional disparado com o `id` da OS recém
// criada, para que `app/balcao/page.tsx` eleve esse id como estado
// compartilhado e passe para `AbaFila`, que destaca visualmente a linha
// nova assim que ela aparecer na fila.
export interface FormularioNovaOsProps {
  onOsCriada?: (id: string) => void;
}

export function FormularioNovaOs({ onOsCriada }: FormularioNovaOsProps = {}) {
  const queryClient = useQueryClient();
  const { data: tipos, isLoading: carregandoTipos } = useTiposServico();
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NovaOsFormData>({
    resolver: zodResolver(osCreateSchema),
    defaultValues: {
      placa: "",
      modeloMoto: "",
      clienteNome: "",
      clienteTelefone: "",
      descricao: "",
      tipoServicoId: "",
      prazo: undefined,
    },
  });

  async function onSubmit(dados: NovaOsFormData) {
    setErroEnvio(null);
    setSucesso(null);
    try {
      const os = await apiFetch<{ id: string; placa: string }>("/api/os", {
        method: "POST",
        body: JSON.stringify(dados),
      });

      reset();
      await queryClient.invalidateQueries({ queryKey: ["fila"] });
      setSucesso(`OS criada com sucesso para a placa ${os.placa}.`);
      onOsCriada?.(os.id);
    } catch (erro) {
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível criar a OS. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível criar a OS. Tente novamente.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="placa">Placa</Label>
          <Input
            id="placa"
            autoComplete="off"
            aria-invalid={Boolean(errors.placa)}
            {...register("placa")}
          />
          {errors.placa && (
            <p className="text-sm text-destructive">{errors.placa.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="modeloMoto">Modelo da moto</Label>
          <Input
            id="modeloMoto"
            aria-invalid={Boolean(errors.modeloMoto)}
            {...register("modeloMoto")}
          />
          {errors.modeloMoto && (
            <p className="text-sm text-destructive">{errors.modeloMoto.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clienteNome">Nome do cliente</Label>
          <Input
            id="clienteNome"
            aria-invalid={Boolean(errors.clienteNome)}
            {...register("clienteNome")}
          />
          {errors.clienteNome && (
            <p className="text-sm text-destructive">{errors.clienteNome.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="clienteTelefone">Telefone do cliente</Label>
          <Input
            id="clienteTelefone"
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
        <Label htmlFor="descricao">Descrição</Label>
        <textarea
          id="descricao"
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
          <Label htmlFor="tipoServicoId">Tipo de serviço</Label>
          <Controller
            control={control}
            name="tipoServicoId"
            render={({ field }) => (
              <Select
                value={field.value || null}
                onValueChange={(valor) => field.onChange(valor ?? "")}
              >
                <SelectTrigger
                  id="tipoServicoId"
                  aria-invalid={Boolean(errors.tipoServicoId)}
                  className="w-full"
                >
                  {/* I7 (revisão final de branch): <Select.Value> da base-ui
                      só resolve um rótulo a partir do `value` (aqui, o UUID
                      de tipos_servico) se receber `items` no `<Select.Root>`
                      ou uma children render-prop própria — sem nenhum dos
                      dois, ela cai no fallback de renderizar o valor cru
                      (o UUID), como o revisor da Task 22 observou ao vivo.
                      A render-prop resolve o nome a partir da mesma lista
                      `tipos` já carregada por useTiposServico(), e também
                      assume o papel do placeholder (que é ignorado quando
                      `children` é informado, por design da lib). */}
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
          <Label htmlFor="prazo">Prazo (opcional)</Label>
          <Input
            id="prazo"
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
      {sucesso && <p className="text-sm text-emerald-600 dark:text-emerald-400">{sucesso}</p>}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        Criar OS
      </Button>
    </form>
  );
}
