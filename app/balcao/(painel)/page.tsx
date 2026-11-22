"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { useResumoBalcao } from "@/hooks/useResumoBalcao";

export default function PaginaHomeBalcao() {
  const { data, isLoading, isError } = useResumoBalcao();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Visão geral</h1>
        <p className="text-sm text-muted-foreground">
          Resumo da fila de manutenção em tempo real.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {isError && (
        <p className="text-sm text-destructive">
          Não foi possível carregar o resumo. Tente novamente em instantes.
        </p>
      )}

      {data && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <CartaoResumo titulo="Na fila agora" valor={data.naFila} />
          <CartaoResumo titulo="Em execução" valor={data.emExecucao} />
          <CartaoResumo titulo="Pausadas" valor={data.pausadas} />
          <CartaoResumo titulo="Concluídas hoje" valor={data.concluidasHoje} />
          <CartaoResumo titulo="Espera da mais antiga" valor={data.esperaMaisAntiga} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Abrir OS</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Cadastre uma nova ordem de serviço para entrar na fila.
            </p>
            <Link href="/balcao/abrir" className={buttonVariants({ className: "self-start" })}>
              Abrir nova OS
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Fila de OS</CardTitle></CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Acompanhe a fila, OS em andamento e concluídas hoje.
            </p>
            <Link href="/balcao/fila" className={buttonVariants({ variant: "outline", className: "self-start" })}>
              Ver fila de OS
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CartaoResumo({ titulo, valor }: { titulo: string; valor: number | string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {titulo}
        </span>
        <span className="font-heading text-2xl font-bold tabular-nums">{valor}</span>
      </CardContent>
    </Card>
  );
}
