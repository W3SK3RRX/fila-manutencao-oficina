"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useFila, type FilaLinha } from "@/hooks/useFila";
import { formatarDataHora, formatarTempoEspera } from "@/lib/format";

// Aba "Fila" da tela do mecânico (Task 27): mesma fonte de dados
// (useFila()) e o mesmo breakdown de score da aba Fila do balcão
// (components/balcao/AbaFila.tsx + LinhaOsExpandivel.tsx), mas somente
// leitura — sem Editar/Cancelar/Pegar, só para o mecânico entender por que
// uma OS está naquela posição. Adaptada para cartões empilhados em vez de
// linhas de <table>, consistente com o restante da área /mecanico
// (mobile-first, coluna única — ver CardPrincipal.tsx). `useFila()` já
// devolve as linhas ordenadas por score DESC (vw_fila), então não
// reordenamos aqui.
export function AbaFilaMecanico() {
  const { data, isLoading, isError } = useFila();

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando fila...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar a fila. Tente novamente em instantes.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nenhuma OS na fila no momento.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((os, indice) => (
        <CartaoFilaMecanico key={os.id} os={os} posicao={indice + 1} />
      ))}
    </div>
  );
}

interface CartaoFilaMecanicoProps {
  os: FilaLinha;
  posicao: number;
}

// Cada cartão é tocável (role="button", igual ao padrão de clique da
// LinhaOsExpandivel original) e alterna a exibição do breakdown do score
// (pontosTipo + pontosEspera + pontosPrazo = score) logo abaixo dos dados da
// OS.
function CartaoFilaMecanico({ os, posicao }: CartaoFilaMecanicoProps) {
  const [aberta, setAberta] = useState(false);

  const numero = os.numero as number;
  const placa = os.placa as string;
  const modeloMoto = os.modeloMoto as string;
  const criadoEm = os.criadoEm as string;
  const prazo = os.prazo as string | null;

  function alternar() {
    setAberta((valor) => !valor);
  }

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-expanded={aberta}
      onClick={alternar}
      onKeyDown={(evento) => {
        if (evento.key === "Enter" || evento.key === " ") {
          evento.preventDefault();
          alternar();
        }
      }}
      className="w-full cursor-pointer"
    >
      <CardContent className="flex flex-col gap-1.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium">
            #{posicao} — OS #{numero}
          </span>
          <span className="tabular-nums text-muted-foreground">{placa}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Modelo:</span>
          <span>{modeloMoto}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Tipo:</span>
          <span>{os.tipoServicoNome}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Espera:</span>
          <span className="tabular-nums">{formatarTempoEspera(criadoEm)}</span>
        </div>
        <div className="flex gap-1.5">
          <span className="text-muted-foreground">Prazo:</span>
          <span className="tabular-nums">{formatarDataHora(prazo)}</span>
        </div>

        {aberta && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/60 pt-2">
            <span>
              Pontos tipo: <strong className="tabular-nums">{os.pontosTipo}</strong>
            </span>
            <span>
              + Pontos espera: <strong className="tabular-nums">{os.pontosEspera}</strong>
            </span>
            <span>
              + Pontos prazo: <strong className="tabular-nums">{os.pontosPrazo}</strong>
            </span>
            <span>
              = Score: <strong className="tabular-nums">{os.score}</strong>
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
