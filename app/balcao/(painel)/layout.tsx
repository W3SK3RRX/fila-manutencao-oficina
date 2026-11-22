import type { ReactNode } from "react";
import { CabecalhoBalcao } from "@/components/balcao/CabecalhoBalcao";

// Route group `(painel)` agrupa as 3 telas autenticadas (Home, Abrir OS,
// Fila de OS) sob um único header/nav sem alterar nenhuma URL; `/balcao/login`
// é irmão fora do grupo e mantém seu próprio wrapper independente.
export default function LayoutPainelBalcao({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col gap-4 bg-background p-4">
      <CabecalhoBalcao />
      {children}
    </div>
  );
}
