"use client";

import { useConexao } from "@/hooks/useConexao";
import { useFila } from "@/hooks/useFila";
import { cn } from "cn";

// Indicador de conexão do cabeçalho da tela do mecânico (Task 27), visível
// independente da aba ativa (app/mecanico/page.tsx). Verde quando
// useConexao().conectado, vermelho com a mensagem exata exigida pelo brief
// caso contrário.
//
// Tratamento do flash inicial (ponto levantado pelo revisor da Task 24):
// useConexao() começa em `conectado: false` até a primeira query da
// aplicação ter sucesso — não existe estado "desconhecido" nesse hook. Sem
// tratamento, isso pintaria o indicador de vermelho por um instante a cada
// carregamento da página, antes do primeiro sucesso. Opção escolhida (b) do
// brief: usamos `isLoading` de useFila() — uma query que esta própria
// página sempre dispara — como um estado neutro "carregando" até a primeira
// resposta chegar; só depois disso o indicador passa a refletir
// `conectado`. Deliberadamente não criamos nenhum hook novo para isso.
export function IndicadorConexao() {
  const { conectado } = useConexao();
  const { isLoading } = useFila();

  if (isLoading) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
        Conectando...
      </span>
    );
  }

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        conectado ? "text-emerald-600 dark:text-emerald-400" : "text-destructive",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          conectado ? "bg-emerald-500" : "bg-destructive",
        )}
      />
      {conectado ? "Conectado" : "Sem conexão — a fila pode estar desatualizada"}
    </span>
  );
}
