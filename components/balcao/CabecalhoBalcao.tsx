"use client";

import { apiFetch } from "@/lib/api-client";
import { Button } from "@/components/ui/button";

// I3 (revisão final de branch): antes deste componente, não havia nenhum
// jeito de sair do balcão — POST /api/auth/logout já existia, mas nada na
// UI o chamava. Diferente de CabecalhoMecanico (que mostra o nome do
// mecânico), a sessão de balcão não identifica um usuário (é um PIN
// compartilhado do computador do balcão — spec), então aqui só o botão
// "Sair" faz sentido.
export function CabecalhoBalcao() {
  async function aoSair() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // Navegação completa (não useRouter().push): precisa descartar o cache
    // do TanStack Query da sessão encerrada e deixar o SerwistProvider/
    // proxy.ts reavaliarem a sessão do zero a partir do cookie já limpo.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/balcao/login";
  }

  return (
    <div className="flex justify-end">
      <Button type="button" variant="outline" size="sm" onClick={aoSair}>
        Sair
      </Button>
    </div>
  );
}
