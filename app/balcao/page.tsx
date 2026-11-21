import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioNovaOs } from "@/components/balcao/FormularioNovaOs";

// Painel do balcão (Task 20): layout de duas colunas. Coluna esquerda = o
// formulário de nova OS desta task. Coluna direita = placeholder — a aba
// Fila/em-andamento/concluídas-hoje é construída na Task 21, não aqui.
export default function PaginaBalcao() {
  return (
    <div className="flex flex-1 flex-col gap-4 bg-zinc-50 p-4 dark:bg-black">
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nova OS</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioNovaOs />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fila</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Em construção (Task 21).
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
