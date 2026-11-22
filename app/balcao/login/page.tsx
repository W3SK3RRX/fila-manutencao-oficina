import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioLoginBalcao } from "@/components/balcao/FormularioLoginBalcao";

export default function PaginaLoginBalcao() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4">
      <div className="mb-6 flex flex-col items-center gap-2">
        <img src="/logo.jpg" alt="Moto & Mais" className="size-16 rounded-xl object-cover" />
        <div className="flex flex-col items-center">
          <span className="font-heading text-xl font-bold tracking-wide">
            MOTO <span className="text-primary">&amp;</span> MAIS
          </span>
          <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">
            Painel do Balcão
          </span>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Entrar no balcão</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioLoginBalcao />
        </CardContent>
      </Card>
    </div>
  );
}
