"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiError } from "@/lib/api-client";
import { useMinhasOs, type OsMecanico } from "@/hooks/useMinhasOs";
import { DialogoConfirmacao } from "@/components/mecanico/DialogoConfirmacao";

// Rótulos legíveis para os dois motivos fixos de `pausarSchema`
// (lib/schemas.ts); o motivo "outro" é salvo como o próprio texto livre
// digitado pelo mecânico (ver `pausarOs` em lib/os-service.ts:
// `motivo === "outro" ? motivoTexto : motivo`), então não precisa de
// tradução — já é exibível como está.
const ROTULOS_MOTIVO: Record<string, string> = {
  aguardando_peca: "Aguardando peça",
  aguardando_aprovacao: "Aguardando aprovação",
};

function rotuloMotivoPausa(motivoPausa: unknown): string {
  if (typeof motivoPausa !== "string" || !motivoPausa) {
    return "—";
  }
  return ROTULOS_MOTIVO[motivoPausa] ?? motivoPausa;
}

// Seção "Minhas pausadas" da tela do mecânico (Task 26), renderizada logo
// abaixo de CardPrincipal (app/mecanico/page.tsx). Lista `data.pausadas` de
// useMinhasOs() — OS que este mecânico pausou e ainda não retomou nem
// devolveu à fila; `null`/vazio simplesmente não renderiza a seção, sem
// "nenhuma pausada" explícito (usar o painel sem pausas é o caso comum).
export function SecaoMinhasPausadas() {
  const { data } = useMinhasOs();
  const pausadas = data?.pausadas ?? [];

  if (pausadas.length === 0) {
    return null;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Minhas pausadas</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {pausadas.map((os) => (
          <LinhaPausada key={os.id} os={os} />
        ))}
      </CardContent>
    </Card>
  );
}

function LinhaPausada({ os }: { os: OsMecanico }) {
  const queryClient = useQueryClient();
  const [devolverAberto, setDevolverAberto] = useState(false);
  const [retomando, setRetomando] = useState(false);
  const [erroRetomar, setErroRetomar] = useState<string | null>(null);

  const numero = os.numero as number;
  const placa = os.placa as string;
  const modeloMoto = os.modeloMoto as string;
  const tipoServicoNome = os.tipoServico?.nome ?? "—";

  // Retomar: sem diálogo de confirmação (spec), POST direto ao tocar no
  // botão. Em sucesso invalida ["mecanico-atual"] (a OS some desta lista e
  // CardPrincipal passa a mostrá-la como em_execucao). Em 409
  // (`TRANSICAO_INVALIDA` — outra OS já está em_execucao para este
  // mecânico, OU esta OS não é mais `pausada` deste mecânico): erro inline
  // por linha, e também invalidamos ["mecanico-atual"] para refletir o
  // estado real (mesmo padrão de BotaoPegarProximo).
  async function aoRetomar() {
    setRetomando(true);
    setErroRetomar(null);
    try {
      await apiFetch(`/api/os/${os.id}/retomar`, { method: "POST" });
      await queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
    } catch (erro) {
      if (erro instanceof ApiError && erro.codigo === "TRANSICAO_INVALIDA") {
        setErroRetomar("Você já tem outra OS em execução, ou esta OS mudou de estado.");
        await queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] });
        return;
      }
      setErroRetomar("Não foi possível retomar a OS. Tente novamente.");
    } finally {
      setRetomando(false);
    }
  }

  // Devolver à fila: diálogo de confirmação genérico antes do POST. Em
  // sucesso invalida ["mecanico-atual"] (some desta lista) e ["fila"] (volta
  // a aparecer na fila do balcão).
  async function aoConfirmarDevolver() {
    await apiFetch(`/api/os/${os.id}/devolver`, { method: "POST" });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mecanico-atual"] }),
      queryClient.invalidateQueries({ queryKey: ["fila"] }),
    ]);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
      <dl className="flex flex-col gap-1 text-sm">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">OS #{numero}:</dt>
          <dd className="font-medium">{placa}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Modelo:</dt>
          <dd>{modeloMoto}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Tipo:</dt>
          <dd>{tipoServicoNome}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">Motivo da pausa:</dt>
          <dd>{rotuloMotivoPausa(os.motivoPausa)}</dd>
        </div>
      </dl>

      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={retomando}
          onClick={aoRetomar}
          className="min-h-12 flex-1 text-base"
        >
          Retomar
        </Button>
        <Button
          type="button"
          disabled={retomando}
          onClick={() => setDevolverAberto(true)}
          className="min-h-12 flex-1 text-base"
        >
          Devolver à fila
        </Button>
      </div>

      {erroRetomar && <p className="text-sm text-destructive">{erroRetomar}</p>}

      <DialogoConfirmacao
        open={devolverAberto}
        onOpenChange={setDevolverAberto}
        titulo={`Devolver OS #${numero} à fila`}
        descricao="A OS voltará para a fila do balcão, sem mecânico atribuído."
        rotuloConfirmar="Confirmar devolução"
        aoConfirmar={aoConfirmarDevolver}
      />
    </div>
  );
}
