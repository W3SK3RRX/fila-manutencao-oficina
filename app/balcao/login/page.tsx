import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioLoginBalcao } from "@/components/balcao/FormularioLoginBalcao";

export default function PaginaLoginBalcao() {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
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
