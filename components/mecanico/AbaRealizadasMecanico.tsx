"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useMinhasRealizadas } from "@/hooks/useMinhasRealizadas";
import { formatarDataHora } from "@/lib/format";

// Aba "Realizadas" da tela do mecânico (Task 8): OS que ELE concluiu hoje
// (fuso America/Fortaleza, ver app/api/mecanico/realizadas/route.ts),
// somente leitura — mesma estrutura de carregamento/erro/vazio de
// AbaFilaMecanico, cartões empilhados sem expandir.
export function AbaRealizadasMecanico() {
  const { data, isLoading, isError } = useMinhasRealizadas();

  if (isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Carregando...</p>;
  }

  if (isError) {
    return (
      <p className="p-4 text-sm text-destructive">
        Não foi possível carregar suas OS realizadas. Tente novamente em instantes.
      </p>
    );
  }

  if (!data || data.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">Nenhuma OS concluída hoje.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {data.map((os) => (
        <Card key={os.id} className="w-full">
          <CardContent className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">OS #{os.numero}</span>
              <span className="tabular-nums text-muted-foreground">{os.placa}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground">Modelo:</span>
              <span>{os.modeloMoto}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground">Tipo:</span>
              <span>{os.tipoServicoNome}</span>
            </div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground">Concluída em:</span>
              <span className="tabular-nums">{formatarDataHora(os.concluidoEm)}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
