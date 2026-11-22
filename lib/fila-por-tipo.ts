// Agrupa a fila (GET /api/fila, ver hooks/useFila.ts) por tipo de serviço
// (GET /api/tipos-servico, ver hooks/useTiposServico.ts) para o gráfico de
// barras "Fila por tipo de serviço" (components/balcao/GraficoFilaPorTipo.tsx).
// Sempre inclui todos os `tipos` recebidos, mesmo com zero OS na fila — assim
// o gráfico não muda de forma conforme a fila esvazia/enche.
export function agruparFilaPorTipo(
  fila: { tipoServicoNome: string }[],
  tipos: { nome: string }[],
): { tipo: string; quantidade: number }[] {
  return tipos
    .map((tipo) => ({
      tipo: tipo.nome,
      quantidade: fila.filter((os) => os.tipoServicoNome === tipo.nome).length,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
}
