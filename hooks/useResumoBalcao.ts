import { useFila } from "@/hooks/useFila";
import { useOsPorStatus } from "@/hooks/useOs";
import { formatarTempoEspera } from "@/lib/format";

// Números exibidos no resumo da home do balcão. Derivado de três queries que
// já existem (fila, em_andamento, concluidas_hoje) — sem rota nova.
export interface ResumoBalcao {
  naFila: number;
  emExecucao: number;
  pausadas: number;
  concluidasHoje: number;
  esperaMaisAntiga: string;
}

export function useResumoBalcao(): {
  isLoading: boolean;
  isError: boolean;
  data: ResumoBalcao | undefined;
} {
  const fila = useFila();
  const emAndamento = useOsPorStatus("em_andamento");
  const concluidas = useOsPorStatus("concluidas_hoje");

  const isLoading = fila.isLoading || emAndamento.isLoading || concluidas.isLoading;
  const isError = fila.isError || emAndamento.isError || concluidas.isError;

  if (isLoading || isError || !fila.data || !emAndamento.data || !concluidas.data) {
    return { isLoading, isError, data: undefined };
  }

  const linhasFila = fila.data;
  const linhasEmAndamento = emAndamento.data;

  // Mais antiga = menor criadoEm (maior tempo de espera).
  const maisAntiga = linhasFila.reduce<string | null>((menor, linha) => {
    const criadoEm = linha.criadoEm as string;
    if (menor === null || new Date(criadoEm).getTime() < new Date(menor).getTime()) {
      return criadoEm;
    }
    return menor;
  }, null);

  return {
    isLoading: false,
    isError: false,
    data: {
      naFila: linhasFila.length,
      emExecucao: linhasEmAndamento.filter((os) => os.status === "em_execucao").length,
      pausadas: linhasEmAndamento.filter((os) => os.status === "pausada").length,
      concluidasHoje: concluidas.data.length,
      esperaMaisAntiga: maisAntiga === null ? "—" : formatarTempoEspera(maisAntiga),
    },
  };
}
