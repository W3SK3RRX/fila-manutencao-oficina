"use client";

import { useState } from "react";
import type { FilaLinha } from "@/hooks/useFila";
import { cn } from "cn";
import { formatarDataHora, formatarTempoEspera } from "@/lib/format";
import { DialogoEditarOs } from "@/components/balcao/DialogoEditarOs";
import { DialogoCancelarOs } from "@/components/balcao/DialogoCancelarOs";

interface LinhaOsExpandivelProps {
  os: FilaLinha;
  posicao: number;
  destacada?: boolean;
}

// Uma linha da tabela da aba Fila (AbaFila), expansível ao clicar: mostra o
// breakdown do score (pontosTipo + pontosEspera + pontosPrazo = score) numa
// segunda <tr> logo abaixo. `destacada` (Task 21, ver nota em
// FormularioNovaOs.tsx) pinta a linha recém-criada para dar feedback visual
// de que ela entrou na fila.
//
// Coluna "Ações" (Task 22): botões Editar/Cancelar, únicos ativos por aqui
// porque toda OS desta tabela está 'na_fila' (vw_fila já filtra por isso —
// ver prisma/migrations/*_vw_fila). A célula de ações tem
// `onClick={stopPropagation}` porque a <tr> inteira já tem um onClick que
// expande/recolhe o breakdown do score; sem isso, clicar em Editar/Cancelar
// também alternaria a linha.
export function LinhaOsExpandivel({ os, posicao, destacada }: LinhaOsExpandivelProps) {
  const [aberta, setAberta] = useState(false);

  const numero = os.numero as number;
  const placa = os.placa as string;
  const modeloMoto = os.modeloMoto as string;
  const tipoServicoNome = os.tipoServicoNome;
  const criadoEm = os.criadoEm as string;
  const prazo = os.prazo as string | null;

  return (
    <>
      <tr
        onClick={() => setAberta((valor) => !valor)}
        aria-expanded={aberta}
        className={cn(
          "cursor-pointer border-b border-border/60 text-sm transition-colors hover:bg-muted/50",
          destacada && "bg-emerald-50 dark:bg-emerald-950/40",
        )}
      >
        <td className="px-2 py-2 tabular-nums text-muted-foreground">{posicao}</td>
        <td className="px-2 py-2 tabular-nums">{numero}</td>
        <td className="px-2 py-2 font-medium">{placa}</td>
        <td className="px-2 py-2">{modeloMoto}</td>
        <td className="px-2 py-2">{tipoServicoNome}</td>
        <td className="px-2 py-2 tabular-nums">{formatarTempoEspera(criadoEm)}</td>
        <td className="px-2 py-2 tabular-nums">{formatarDataHora(prazo)}</td>
        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-2">
            <DialogoEditarOs
              os={{
                id: os.id,
                placa,
                modeloMoto,
                clienteNome: os.clienteNome as string,
                clienteTelefone: os.clienteTelefone as string,
                descricao: os.descricao as string,
                tipoServicoId: os.tipoServicoId as string,
                prazo,
              }}
            />
            <DialogoCancelarOs os={{ id: os.id, placa }} />
          </div>
        </td>
      </tr>
      {aberta && (
        <tr className="border-b border-border/60 bg-muted/30 text-sm">
          <td colSpan={8} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span>
                Pontos tipo: <strong className="tabular-nums">{os.pontosTipo}</strong>
              </span>
              <span>
                + Pontos espera:{" "}
                <strong className="tabular-nums">{os.pontosEspera}</strong>
              </span>
              <span>
                + Pontos prazo:{" "}
                <strong className="tabular-nums">{os.pontosPrazo}</strong>
              </span>
              <span>
                = Score: <strong className="tabular-nums">{os.score}</strong>
              </span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
