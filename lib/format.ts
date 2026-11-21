// Utilitários de formatação compartilhados pelos componentes client-side do
// balcão (AbaFila, AbaEmAndamento, AbaConcluidasHoje). Constraint global:
// "Database: PostgreSQL 16+. All timestamps timestamptz; display timezone
// America/Fortaleza." — qualquer instante (prazo, criadoEm, concluidoEm)
// exibido ao usuário usa `Intl.DateTimeFormat` com `timeZone:
// "America/Fortaleza"` explícito, nunca o fuso local do navegador (que pode
// divergir do fuso real da oficina) nem um `.toLocaleString()` cru sem opção
// de timezone.
const FUSO_OFICINA = "America/Fortaleza";

const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO_OFICINA,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

// Formata um instante ISO (ou Date) como data/hora no fuso da oficina.
// `valor` pode ser null/undefined (ex.: prazo não preenchido, concluidoEm
// antes de concluir) — devolve um placeholder nesse caso.
export function formatarDataHora(valor: string | Date | null | undefined): string {
  if (!valor) return "—";
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return formatadorDataHora.format(data);
}

// Tempo de espera é uma DURAÇÃO (diferença entre dois instantes em
// milissegundos), não um instante absoluto — por isso não depende de
// timezone de exibição: `Date.now() - new Date(criadoEm).getTime()` dá o
// mesmo resultado independentemente do fuso horário usado para formatar
// qualquer um dos dois lados. Não há `Intl.DateTimeFormat` aqui porque não
// estamos exibindo um instante, só a magnitude do intervalo.
export function formatarTempoEspera(criadoEm: string | Date): string {
  const inicio = criadoEm instanceof Date ? criadoEm : new Date(criadoEm);
  if (Number.isNaN(inicio.getTime())) return "—";

  const diffMs = Date.now() - inicio.getTime();
  const minutos = Math.max(0, Math.floor(diffMs / 60000));

  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = minutos % 60;
  return `${horas}h${minutosRestantes.toString().padStart(2, "0")}`;
}
