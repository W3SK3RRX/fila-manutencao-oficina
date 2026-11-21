"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { pausarSchema } from "@/lib/schemas";
import { apiFetch, ApiError } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// `pausarSchema` (lib/schemas.ts) não tem `.transform`, diferente de
// `osCreateSchema`/`osEditSchema` — então `z.infer` e `z.input` coincidem
// aqui; usamos `z.infer` por ser o caso comum.
type PausarFormData = z.infer<typeof pausarSchema>;

const MOTIVOS: { valor: PausarFormData["motivo"]; rotulo: string }[] = [
  { valor: "aguardando_peca", rotulo: "Aguardando peça" },
  { valor: "aguardando_aprovacao", rotulo: "Aguardando aprovação" },
  { valor: "outro", rotulo: "Outro" },
];

export interface DialogoPausarProps {
  osId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Diálogo de pausa da OS em execução do mecânico (Task 26), aberto pelo
// botão Pausar de CardPrincipal — totalmente controlado via
// `open`/`onOpenChange` (sem trigger próprio), já que o botão que abre já
// existe em CardPrincipal.
//
// Usa `pausarSchema` com RHF + zodResolver (mesma estrutura de
// DialogoEditarOs: `Controller` para o único campo não-nativo, aqui o
// `RadioGroup` dos 3 motivos). O `Textarea` de "outro" só aparece quando
// esse motivo está selecionado (`motivoSelecionado`, espelhado em state
// local — ver nota abaixo); sua exigência de não-vazio vem do `superRefine`
// do próprio schema e aparece como erro normal em `motivoTexto` via
// zodResolver.
//
// Submete via POST /api/os/:id/pausar. Em sucesso: invalida
// ["mecanico-atual"] (o card principal volta a mostrar "pegar próximo") e
// fecha o diálogo. Em 409 (`TRANSICAO_INVALIDA` — a OS não é mais a
// em_execucao deste mecânico): erro inline, mesmo padrão sem lib de toast já
// usado por DialogoCancelarOs/DialogoEditarOs.
export function DialogoPausar({ osId, open, onOpenChange }: DialogoPausarProps) {
  const queryClient = useQueryClient();
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  // Espelha o campo `motivo` do form em state local só para decidir se
  // mostra o Textarea de "outro" — evitamos `watch()`/`useWatch()` do RHF
  // aqui porque o eslint-plugin-react-hooks (React Compiler) sinaliza
  // `watch()` como incompatível com memoização (ver aviso do lint); como o
  // `Controller` do campo `motivo` já expõe `field.onChange`, espelhar o
  // valor ali é suficiente e não precisa de uma segunda fonte de verdade.
  const [motivoSelecionado, setMotivoSelecionado] = useState<
    PausarFormData["motivo"] | undefined
  >(undefined);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PausarFormData>({
    resolver: zodResolver(pausarSchema),
    defaultValues: { motivo: undefined, motivoTexto: "" },
  });

  function aoMudarAberto(valor: boolean) {
    onOpenChange(valor);
    if (valor) {
      setErroEnvio(null);
      setMotivoSelecionado(undefined);
      reset({ motivo: undefined, motivoTexto: "" });
    }
  }

  async function onSubmit(dados: PausarFormData) {
    setErroEnvio(null);
    try {
      await apiFetch(`/api/os/${osId}/pausar`, {
        method: "POST",
        body: JSON.stringify(dados),
      });

      await queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
      onOpenChange(false);
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setErroEnvio("A OS mudou de estado, atualize a tela.");
        return;
      }
      if (erro instanceof ApiError) {
        setErroEnvio(erro.message || "Não foi possível pausar a OS. Tente novamente.");
        return;
      }
      setErroEnvio("Não foi possível pausar a OS. Tente novamente.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={aoMudarAberto}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Pausar OS</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label>Motivo da pausa</Label>
            <Controller
              control={control}
              name="motivo"
              render={({ field }) => (
                // `value={field.value ?? null}` (nunca `undefined`): mesmo
                // truque de DialogoEditarOs com o Select — o Base UI decide
                // se o componente é controlado ou não controlado no
                // primeiro render a partir de `value !== undefined`; sem
                // isso, o primeiro render (nenhum motivo selecionado ainda)
                // ficaria não controlado e a primeira seleção do usuário
                // dispararia o aviso "changing from uncontrolled to
                // controlled".
                <RadioGroup
                  value={field.value ?? null}
                  onValueChange={(valor) => {
                    field.onChange(valor);
                    setMotivoSelecionado(valor);
                  }}
                >
                  {MOTIVOS.map((motivo) => (
                    <div key={motivo.valor} className="flex items-center gap-2">
                      <RadioGroupItem
                        id={`pausar-motivo-${motivo.valor}`}
                        value={motivo.valor}
                        aria-invalid={Boolean(errors.motivo)}
                      />
                      <Label htmlFor={`pausar-motivo-${motivo.valor}`} className="font-normal">
                        {motivo.rotulo}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
            />
            {errors.motivo && (
              <p className="text-sm text-destructive">{errors.motivo.message}</p>
            )}
          </div>

          {motivoSelecionado === "outro" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pausar-motivoTexto">Descreva o motivo</Label>
              <Textarea
                id="pausar-motivoTexto"
                rows={3}
                aria-invalid={Boolean(errors.motivoTexto)}
                {...register("motivoTexto")}
              />
              {errors.motivoTexto && (
                <p className="text-sm text-destructive">{errors.motivoTexto.message}</p>
              )}
            </div>
          )}

          {erroEnvio && <p className="text-sm text-destructive">{erroEnvio}</p>}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting} className="min-h-12 w-full text-base">
              Confirmar pausa
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
