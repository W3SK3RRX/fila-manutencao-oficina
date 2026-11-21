// Fallback offline do service worker (Task 33). Página 100% estática — sem
// dados, sem acesso a cookies/headers/params — para garantir que prerenderiza
// como HTML estático e entre no manifesto de precache do Serwist junto com o
// resto do app shell (ver `app/sw.ts`, opção `fallbacks`).
export default function PaginaOffline() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 bg-zinc-50 p-4 text-center dark:bg-black">
      <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
        Sem conexão. Tente novamente.
      </p>
    </div>
  );
}
