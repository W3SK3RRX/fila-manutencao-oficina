"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { mecanicoCreateSchema } from "@/lib/schemas";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type NovoMecanicoFormData = z.infer<typeof mecanicoCreateSchema>;

// Formulário de cadastro de mecânico pelo balcão (Task 10), mesma estrutura
// de FormularioNovaOs: RHF + zodResolver(mecanicoCreateSchema). Em sucesso:
// limpa o formulário, invalida ["mecanicos"] (mesma query key de
// ListaMecanicos e de SeletorMecanico, que lê a lista de mecânicos para o
// login do mecânico) e mostra uma confirmação inline com o nome cadastrado.
export function FormularioNovoMecanico() {
  const queryClient = useQueryClient();
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NovoMecanicoFormData>({
    resolver: zodResolver(mecanicoCreateSchema),
    defaultValues: { nome: "", pin: "" },
  });

  async function onSubmit(dados: NovoMecanicoFormData) {
    setErroEnvio(null);
    setSucesso(null);
    try {
      const mecanico = await apiFetch<{ id: string; nome: string }>("/api/mecanicos", {
        method: "POST",
        body: JSON.stringify(dados),
      });

      reset();
      await queryClient.invalidateQueries({ queryKey: ["mecanicos"] });
      setSucesso(`Mecânico ${mecanico.nome} cadastrado com sucesso.`);
    } catch (erro) {
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível cadastrar o mecânico. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível cadastrar o mecânico. Tente novamente.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" aria-invalid={Boolean(errors.nome)} {...register("nome")} />
        {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="pin">PIN (4 dígitos)</Label>
        <Input
          id="pin"
          inputMode="numeric"
          maxLength={4}
          aria-invalid={Boolean(errors.pin)}
          {...register("pin")}
        />
        {errors.pin && <p className="text-sm text-destructive">{errors.pin.message}</p>}
      </div>

      {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}
      {sucesso && <p className="text-sm text-success">{sucesso}</p>}

      <Button type="submit" disabled={isSubmitting} className="self-start">
        Cadastrar mecânico
      </Button>
    </form>
  );
}
