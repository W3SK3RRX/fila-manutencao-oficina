import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioNovaOs } from "@/components/balcao/FormularioNovaOs";

export default function PaginaAbrirOs() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Abrir OS</CardTitle>
      </CardHeader>
      <CardContent>
        <FormularioNovaOs />
      </CardContent>
    </Card>
  );
}
