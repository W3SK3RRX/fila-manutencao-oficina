"use client";

import { CardPrincipal } from "@/components/mecanico/CardPrincipal";
import { SecaoMinhasPausadas } from "@/components/mecanico/SecaoMinhasPausadas";

// Tela principal do mecânico (Task 25), autenticada: `proxy.ts` já exige
// sessão de mecânico para qualquer /mecanico/* além de /mecanico/login (ver
// app/mecanico/login/page.tsx), então esta página assume que há sessão.
//
// Mobile-first, coluna única — diferente do painel do balcão (desktop-first,
// duas colunas, ver app/balcao/page.tsx), mas mantém o mesmo tratamento
// visual de fundo/padding da tela de login do mecânico (bg-zinc-50/black,
// px-4 py-8). `SecaoMinhasPausadas` (Task 26) fica abaixo do card principal
// e não renderiza nada quando o mecânico não tem nenhuma OS pausada.
export default function PaginaMecanico() {
  return (
    <div className="flex flex-1 items-start justify-center bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <CardPrincipal />
        <SecaoMinhasPausadas />
      </div>
    </div>
  );
}
