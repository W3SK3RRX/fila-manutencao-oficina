import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import QRCode from "qrcode";

export const metadata: Metadata = {
  title: "Instalar o app da oficina",
};

// Página pública para imprimir e afixar na oficina (Task 34). Mostra um QR
// code que leva o mecânico direto ao login do PWA em /mecanico. Não passa
// pelo gate de sessão de proxy.ts (o matcher só cobre /balcao e /mecanico).
export default function PaginaInstalar() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-white px-6 py-10 text-center text-black">
      <h1 className="text-3xl font-bold">Fila da Oficina</h1>
      <p className="text-lg">
        Aponte a câmera do celular para o código abaixo e instale o app.
      </p>
      <Suspense fallback={<p className="text-base">Gerando código...</p>}>
        <CodigoQrMecanico />
      </Suspense>
    </div>
  );
}

// Lê APP_URL em tempo de requisição: `connection()` faz a rota ser renderizada
// dinamicamente, para que o valor do ambiente não fique congelado no build
// (cacheComponents está ligado em next.config.ts). O Suspense acima mantém a
// casca da página pré-renderizável.
async function CodigoQrMecanico() {
  await connection();

  const baseUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  const destino = `${baseUrl}/mecanico`;

  // SVG gerado pela própria lib a partir de uma URL de configuração do
  // servidor (APP_URL), não de entrada do usuário, por isso é seguro renderizar
  // via dangerouslySetInnerHTML.
  const qrSvg = await QRCode.toString(destino, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
  });

  return (
    <>
      <div
        className="w-72 max-w-full [&>svg]:h-auto [&>svg]:w-full"
        dangerouslySetInnerHTML={{ __html: qrSvg }}
      />
      <p className="break-all text-base">{destino}</p>
    </>
  );
}
