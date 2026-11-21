"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { loginBalcaoSchema } from "@/lib/schemas";
import type { z } from "zod";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type LoginBalcaoFormData = z.infer<typeof loginBalcaoSchema>;

// Formulário de login do balcão: um único campo de senha, validado com
// `loginBalcaoSchema` (lib/schemas.ts, Task 10) via React Hook Form +
// zodResolver, seguindo o padrão de formulários deste projeto. Em sucesso,
// redireciona para /balcao; em 401 com codigo "SENHA_INVALIDA" (ver
// app/api/auth/balcao/route.ts, Task 12), mostra o erro inline junto ao
// campo em vez de apenas um toast.
export function FormularioLoginBalcao() {
  const router = useRouter();
  const [erroSenha, setErroSenha] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginBalcaoFormData>({
    resolver: zodResolver(loginBalcaoSchema),
    defaultValues: { senha: "" },
  });

  async function onSubmit(dados: LoginBalcaoFormData) {
    setErroSenha(null);
    try {
      await apiFetch("/api/auth/balcao", {
        method: "POST",
        body: JSON.stringify(dados),
      });
      router.push("/balcao");
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "SENHA_INVALIDA") {
        setErroSenha("Senha incorreta");
        return;
      }
      setErroSenha("Não foi possível entrar. Tente novamente.");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          type="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.senha || erroSenha)}
          {...register("senha")}
        />
        {errors.senha && (
          <p className="text-sm text-destructive">{errors.senha.message}</p>
        )}
        {erroSenha && !errors.senha && (
          <p className="text-sm text-destructive">{erroSenha}</p>
        )}
      </div>
      <Button type="submit" disabled={isSubmitting}>
        Entrar
      </Button>
    </form>
  );
}
