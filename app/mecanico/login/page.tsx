import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeletorMecanico } from "@/components/mecanico/SeletorMecanico";
import { BotaoInstalar } from "@/components/mecanico/BotaoInstalar";

// Tela de login do mecânico (Task 23): mobile-first, diferente das telas do
// balcão (desktop-first). `proxy.ts` já exclui este sub-caminho do gate de
// autenticação de /mecanico/*, então esta página carrega sem sessão.
export default function PaginaLoginMecanico() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-8">
      <div className="flex flex-col items-center gap-2">
        <img src="/logo.jpg" alt="Moto & Mais" className="size-16 rounded-xl object-cover" />
        <div className="flex flex-col items-center">
          <span className="font-heading text-xl font-bold tracking-wide">
            MOTO <span className="text-primary">&amp;</span> MAIS
          </span>
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Painel do Mecânico
          </span>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center">Entrar</CardTitle>
        </CardHeader>
        <CardContent>
          <SeletorMecanico />
          <div className="mt-6">
            <BotaoInstalar />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
