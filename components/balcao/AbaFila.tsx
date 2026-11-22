"use client";

import { useSearchParams } from "next/navigation";
import { useFila } from "@/hooks/useFila";
import { LinhaOsExpandivel } from "@/components/balcao/LinhaOsExpandivel";

// Aba "Fila" do painel do balcão (Task 21): lista as OS com status
// 'na_fila', na ordem já devolvida por GET /api/fila (vw_fila ordena por
// score DESC, criado_em ASC — não reordenamos no cliente). Cada linha é
// expansível (LinhaOsExpandivel) para mostrar o breakdown do score.
//
// Destaque da OS recém-criada: o id vem do query param `?destaque=<id>`
// (o link "Ver na fila →" do FormularioNovaOs aponta para cá). Só a linha
// com esse id recebe o destaque visual. Usa useSearchParams, por isso a
// página `app/balcao/(painel)/fila/page.tsx` envolve esta aba em <Suspense>.
export function AbaFila() {
  const searchParams = useSearchParams();
  const osRecemCriadaId = searchParams.get("destaque");
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
            <th className="px-2 py-2 font-medium">Ações</th>
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
