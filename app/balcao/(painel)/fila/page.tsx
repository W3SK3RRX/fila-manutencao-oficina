import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AbaFila } from "@/components/balcao/AbaFila";
import { AbaEmAndamento } from "@/components/balcao/AbaEmAndamento";
import { AbaConcluidasHoje } from "@/components/balcao/AbaConcluidasHoje";

export default function PaginaFilaOs() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fila de OS</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="fila">
          <TabsList>
            <TabsTrigger value="fila">Fila</TabsTrigger>
            <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
            <TabsTrigger value="concluidas_hoje">Concluídas hoje</TabsTrigger>
          </TabsList>
          <TabsContent value="fila">
            <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Carregando fila...</p>}>
              <AbaFila />
            </Suspense>
          </TabsContent>
          <TabsContent value="em_andamento">
            <AbaEmAndamento />
          </TabsContent>
          <TabsContent value="concluidas_hoje">
            <AbaConcluidasHoje />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
