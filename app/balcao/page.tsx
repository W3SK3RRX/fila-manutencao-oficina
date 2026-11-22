"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormularioNovaOs } from "@/components/balcao/FormularioNovaOs";
import { AbaFila } from "@/components/balcao/AbaFila";
import { AbaEmAndamento } from "@/components/balcao/AbaEmAndamento";
import { AbaConcluidasHoje } from "@/components/balcao/AbaConcluidasHoje";
import { CabecalhoBalcao } from "@/components/balcao/CabecalhoBalcao";

// Painel do balcão (Task 20 + Task 21): layout de duas colunas. Coluna
// esquerda = formulário de nova OS (Task 20). Coluna direita = abas
// Fila/Em andamento/Concluídas hoje (Task 21), via shadcn `Tabs`.
//
// `osRecemCriadaId` é elevado para este componente (em vez de viver dentro
// de FormularioNovaOs ou de AbaFila) porque é o único ancestral comum das
// duas: FormularioNovaOs dispara `onOsCriada(id)` ao criar a OS com sucesso,
// e esse id é repassado para AbaFila destacar a linha correspondente assim
// que ela aparecer na fila. Essa é a plumbing que a Task 20 deixou em aberto
// deliberadamente (ver task-20-report.md).
export default function PaginaBalcao() {
  const [osRecemCriadaId, setOsRecemCriadaId] = useState<string | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-4 bg-background p-4">
      <CabecalhoBalcao />
      <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Nova OS</CardTitle>
          </CardHeader>
          <CardContent>
            <FormularioNovaOs onOsCriada={setOsRecemCriadaId} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acompanhamento</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="fila">
              <TabsList>
                <TabsTrigger value="fila">Fila</TabsTrigger>
                <TabsTrigger value="em_andamento">Em andamento</TabsTrigger>
                <TabsTrigger value="concluidas_hoje">Concluídas hoje</TabsTrigger>
              </TabsList>
              <TabsContent value="fila">
                <AbaFila osRecemCriadaId={osRecemCriadaId} />
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
      </div>
    </div>
  );
}
