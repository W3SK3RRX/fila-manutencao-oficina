import type { Metadata } from "next";
import { Inter, Oswald } from "next/font/google";
import { SerwistProvider } from "@serwist/next/react";
import { Providers } from "./providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      className={`${inter.variable} ${oswald.variable} dark h-full antialiased`}
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
