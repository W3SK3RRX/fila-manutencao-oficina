"use client";

import { useFila } from "@/hooks/useFila";
import { LinhaOsExpandivel } from "@/components/balcao/LinhaOsExpandivel";

interface AbaFilaProps {
  // Id da OS recém-criada pelo formulário à esquerda (ver
  // FormularioNovaOs.tsx's onOsCriada), usado só para destacar visualmente
  // a linha correspondente quando ela aparecer aqui. Estado é elevado e
  // mantido em app/balcao/page.tsx, não nesta aba.
  osRecemCriadaId?: string | null;
}

// Aba "Fila" do painel do balcão (Task 21): lista as OS com status
// 'na_fila', na ordem já devolvida por GET /api/fila (vw_fila ordena por
// score DESC, criado_em ASC — não reordenamos no cliente). Cada linha é
// expansível (LinhaOsExpandivel) para mostrar o breakdown do score.
export function AbaFila({ osRecemCriadaId }: AbaFilaProps) {
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
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-border text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-2 py-2 font-medium">Pos.</th>
            <th className="px-2 py-2 font-medium">Número</th>
            <th className="px-2 py-2 font-medium">Placa</th>
            <th className="px-2 py-2 font-medium">Modelo</th>
            <th className="px-2 py-2 font-medium">Tipo</th>
            <th className="px-2 py-2 font-medium">Tempo de espera</th>
            <th className="px-2 py-2 font-medium">Prazo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((os, indice) => (
            <LinhaOsExpandivel
              key={os.id}
              os={os}
              posicao={indice + 1}
              destacada={os.id === osRecemCriadaId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
