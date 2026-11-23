import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormularioNovoMecanico } from "@/components/balcao/FormularioNovoMecanico";
import { ListaMecanicos } from "@/components/balcao/ListaMecanicos";

export default function PaginaMecanicos() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Cadastrar mecânico</CardTitle>
        </CardHeader>
        <CardContent>
          <FormularioNovoMecanico />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mecânicos cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          <ListaMecanicos />
        </CardContent>
      </Card>
    </div>
  );
}
