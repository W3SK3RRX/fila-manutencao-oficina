// Wrapper fino sobre `fetch` usado pelos hooks de dados do front-end
// (hooks/useFila.ts, hooks/useOs.ts, e futuros hooks de Marco 4+). Toda rota
// de API deste projeto responde erros no formato `{ erro, codigo }` (ver
// app/api/fila/route.ts, app/api/os/route.ts etc.) — este wrapper garante
// que qualquer resposta não-2xx vire uma exceção `ApiError` com esse corpo
// já anexado, para que quem chama possa decidir com base em `codigo` (ex.:
// branch por "NAO_AUTENTICADO", "PERFIL_NAO_AUTORIZADO") em vez de ter que
// checar `response.ok` manualmente em cada hook.
export interface ApiErrorBody {
  erro?: string;
  codigo?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly codigo?: string;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.erro ?? `Erro na requisição (status ${status})`);
    this.name = "ApiError";
    this.status = status;
    this.codigo = body?.codigo;
    this.body = body;
  }
}

export async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(response.status, body);
  }

  // Rotas que não devolvem corpo (ex.: 204) não devem ser chamadas com T
  // diferente de void, mas protegemos mesmo assim contra body vazio.
  const texto = await response.text();
  return (texto ? JSON.parse(texto) : undefined) as T;
}
