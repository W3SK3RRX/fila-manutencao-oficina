"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

// `beforeinstallprompt` não está tipado no lib.dom do TypeScript. Só o
// Chromium (Android/desktop) dispara este evento; no iOS ele nunca aparece.
interface EventoBeforeInstallPrompt extends Event {
  prompt: () => Promise<void>;
}

// Botão de instalação do PWA do mecânico (Task 34). Guarda o evento
// `beforeinstallprompt` quando o navegador o dispara e o usa no clique.
// Sem evento: só no iOS (que nunca dispara o evento) mostra o passo a passo
// manual; em qualquer outro caso não mostra nada. Dentro do app já instalado
// não mostra nada.
const MODO_STANDALONE = "(display-mode: standalone)";

// Detecção de iOS pelo user agent (abordagem pragmática: não existe um
// sinal confiável sem UA para distinguir "sem suporte" de "não elegível").
const REGEX_IOS = /iPad|iPhone|iPod/;

function ehIos() {
  return REGEX_IOS.test(navigator.userAgent);
}

function semAssinatura() {
  return () => {};
}

// Estado de "já está rodando instalado" vem do próprio navegador, então é
// lido com useSyncExternalStore (no servidor assume false, sem divergência
// de hidratação).
function assinarModoStandalone(aoMudar: () => void) {
  const mq = window.matchMedia(MODO_STANDALONE);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

export function BotaoInstalar() {
  const [evento, setEvento] = useState<EventoBeforeInstallPrompt | null>(null);
  const [instaladoAgora, setInstaladoAgora] = useState(false);
  const rodandoInstalado = useSyncExternalStore(
    assinarModoStandalone,
    () => window.matchMedia(MODO_STANDALONE).matches,
    () => false,
  );
  const instalado = rodandoInstalado || instaladoAgora;
  // User agent é fixo na sessão, então não há assinatura: lido via
  // useSyncExternalStore com snapshot de servidor `false` (sem divergência
  // de hidratação).
  const iOS = useSyncExternalStore(semAssinatura, ehIos, () => false);

  useEffect(() => {
    function aoReceberPrompt(e: Event) {
      // Impede a mini-infobar automática; a instalação passa pelo nosso botão.
      e.preventDefault();
      setEvento(e as EventoBeforeInstallPrompt);
    }

    function aoInstalar() {
      setEvento(null);
      setInstaladoAgora(true);
    }

    window.addEventListener("beforeinstallprompt", aoReceberPrompt);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoReceberPrompt);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  if (instalado) {
    return null;
  }

  if (evento) {
    return (
      <Button
        type="button"
        className="min-h-12 w-full text-base"
        onClick={async () => {
          // O evento só pode ser usado uma vez: depois de `prompt()` ele
          // fica inválido, então limpamos o estado logo em seguida.
          const prompt = evento;
          setEvento(null);
          await prompt.prompt();
        }}
      >
        Instalar aplicativo
      </Button>
    );
  }

  if (!iOS) {
    return null;
  }

  return (
    <div className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">Instalar no celular</p>
      <p className="mt-1">
        Abra no Safari, toque em Compartilhar, depois em &quot;Adicionar à Tela de Início&quot;.
      </p>
    </div>
  );
}
