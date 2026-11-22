"use client";

import { apiFetch } from "@/lib/api-client";
import { useMinhasOs } from "@/hooks/useMinhasOs";
import { IndicadorConexao } from "@/components/mecanico/IndicadorConexao";
import { Button } from "@/components/ui/button";

// I3 (revisão final de branch): spec (Telas) exige "Topo: nome do mecânico e
// indicador de conexão" e "identificado até sair" — antes deste componente,
// app/mecanico/page.tsx só renderizava <IndicadorConexao />, sem nome nem
// nenhum jeito de sair. Reaproveita useMinhasOs() (já buscado por
// CardPrincipal/SecaoMinhasPausadas logo abaixo — mesma query, sem round-trip
// extra) para ler `mecanico.nome` (adicionado a GET /api/mecanico/atual nesta
// mesma revisão).
//
// "Sair": POST /api/auth/logout (já existia, mas nada na UI o chamava) e
// navegação completa (window.location, não router.push) para /mecanico/login
// — precisa recarregar a página para o SerwistProvider/proxy.ts reavaliarem
// a sessão (o cookie já foi removido pela resposta do logout) e para
// descartar qualquer estado em memória do TanStack Query da sessão anterior.
export function CabecalhoMecanico() {
  const { data } = useMinhasOs();

  async function aoSair() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {
      // Mesmo que o POST falhe (ex.: já sem sessão/rede instável), ainda
      // navegamos para o login — não há nada pior a perder aqui.
    });
    // Navegação completa (não useRouter().push): mesma razão de
    // components/balcao/CabecalhoBalcao.tsx.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/mecanico/login";
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="truncate text-sm font-medium">{data?.mecanico?.nome ?? ""}</span>
      <div className="flex items-center gap-3">
        <IndicadorConexao />
        <Button type="button" variant="outline" size="sm" onClick={aoSair}>
          Sair
        </Button>
      </div>
    </div>
  );
}
