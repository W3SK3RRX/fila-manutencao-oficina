import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeletorMecanico } from "@/components/mecanico/SeletorMecanico";

// Tela de login do mecânico (Task 23): mobile-first, diferente das telas do
// balcão (desktop-first). `proxy.ts` já exclui este sub-caminho do gate de
// autenticação de /mecanico/*, então esta página carrega sem sessão.
export default function PaginaLoginMecanico() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-black">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Entrar</CardTitle>
        </CardHeader>
        <CardContent>
          <SeletorMecanico />
        </CardContent>
      </Card>
    </div>
  );
}
