"use client";

import { CardPrincipal } from "@/components/mecanico/CardPrincipal";
import { SecaoMinhasPausadas } from "@/components/mecanico/SecaoMinhasPausadas";
import { AbaFilaMecanico } from "@/components/mecanico/AbaFilaMecanico";
import { CabecalhoMecanico } from "@/components/mecanico/CabecalhoMecanico";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Tela principal do mecânico (Task 25), autenticada: `proxy.ts` já exige
// sessão de mecânico para qualquer /mecanico/* além de /mecanico/login (ver
// app/mecanico/login/page.tsx), então esta página assume que há sessão.
//
// Mobile-first, coluna única — diferente do painel do balcão (desktop-first,
// duas colunas, ver app/balcao/page.tsx), mas mantém o mesmo tratamento
// visual de fundo/padding da tela de login do mecânico (bg-zinc-50/black,
// px-4 py-8).
//
// Task 27 introduz as abas "Principal"/"Fila" (mesmo componente `Tabs` do
// balcão, ver app/balcao/page.tsx) e um cabeçalho fora das abas, para ficar
// visível independente de qual aba está ativa. A aba "Principal" contém o
// conteúdo inteiro de antes desta task (CardPrincipal + SecaoMinhasPausadas,
// inalterados); a aba "Fila" é somente leitura (AbaFilaMecanico), sem
// nenhuma ação.
//
// I3 (revisão final de branch): `IndicadorConexao` sozinho virou
// `CabecalhoMecanico` (nome do mecânico + indicador + "Sair"), para atender
// a spec ("Topo: nome do mecânico e indicador de conexão").
export default function PaginaMecanico() {
  return (
    <div className="flex flex-1 items-start justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <CabecalhoMecanico />

        <Tabs defaultValue="principal">
          <TabsList>
            <TabsTrigger value="principal">Principal</TabsTrigger>
            <TabsTrigger value="fila">Fila</TabsTrigger>
          </TabsList>
          <TabsContent value="principal">
            <div className="flex flex-col gap-4">
              <CardPrincipal />
              <SecaoMinhasPausadas />
            </div>
          </TabsContent>
          <TabsContent value="fila">
            <AbaFilaMecanico />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
