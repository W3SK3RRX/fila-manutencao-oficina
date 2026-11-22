import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// I6 (revisão final de branch): título da aba e `lang` ainda eram o
// boilerplate do create-next-app — "Create Next App" no título e `lang="en"`
// numa UI inteiramente em português faziam o Chrome oferecer "traduzir desta
// página" para a equipe da oficina.
export const metadata: Metadata = {
  title: "Fila da Oficina",
  description: "Fila de manutenção — MotoMais",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Service worker (Task 33): registra apenas em produção. O gate
            não é algo inventado aqui — `disable` é a opção que o próprio
            @serwist/next/react expõe para exatamente este caso. */}
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV !== "production"}
        >
          <Providers>{children}</Providers>
        </SerwistProvider>
      </body>
    </html>
  );
}
