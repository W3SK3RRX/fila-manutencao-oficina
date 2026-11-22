import { redirect } from "next/navigation";

// I6 (revisão final de branch): `/` ainda era o boilerplate do
// create-next-app ("Deploy Now"/links da Vercel), visível no domínio de
// produção real. O balcão é o ponto de entrada mais comum (computador fixo
// da loja); o mecânico tem seu próprio link direto (`/mecanico/login`,
// divulgado via QR code em `/instalar`), então não há necessidade de uma
// tela de escolha aqui.
//
// Redireciona para `/balcao` (não direto para `/balcao/login`): o matcher de
// proxy.ts cobre `/balcao/:path*`, então quem já tem sessão de balcão válida
// cai direto no painel, e quem não tem é mandado para `/balcao/login` pelo
// próprio proxy — reaproveita a lógica de autenticação que já existe lá em
// vez de duplicá-la aqui.
export default function Home() {
  redirect("/balcao");
}
