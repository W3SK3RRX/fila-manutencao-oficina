"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch, ApiError } from "@/lib/api-client";

interface TecladoPinProps {
  mecanicoId: string;
  mecanicoNome: string;
  onVoltar: () => void;
}

const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "apagar", "0", "ok"] as const;

// Teclado numérico on-screen para digitar o PIN de 4 dígitos do mecânico
// (Task 23). Auto-submete para POST /api/auth/mecanico assim que o 4º
// dígito é digitado (loginMecanicoSchema-shaped body: { mecanicoId, pin }).
// Em 401 (PIN_INVALIDO) o campo "treme" (classe `animate-shake`, ver
// app/globals.css) e limpa, mostrando "PIN incorreto". Em 429
// (BLOQUEADO_TEMPORARIAMENTE) mostra a mensagem de bloqueio sem tremer —
// não é um PIN errado, é a conta temporariamente bloqueada por tentativas
// anteriores (ver lib/pin-lockout.ts, Task 12).
//
// Botões grandes (min-h-14 = 56px) e com bastante espaçamento entre si: esta
// tela é usada por mecânicos no celular, muitas vezes com as mãos sujas ou
// com luvas, então os alvos de toque precisam ser folgados (constraint
// global do Marco 5: ≥48px).
export function TecladoPin({ mecanicoId, mecanicoNome, onVoltar }: TecladoPinProps) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [tremendo, setTremendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function submeter(pinCompleto: string) {
    setEnviando(true);
    try {
      await apiFetch("/api/auth/mecanico", {
        method: "POST",
        body: JSON.stringify({ mecanicoId, pin: pinCompleto }),
      });
      router.push("/mecanico");
      // Não limpamos `enviando`/`pin` no caminho de sucesso: a navegação já
      // está em andamento e o componente será desmontado.
    } catch (erroCapturado) {
      setPin("");
      setEnviando(false);
      if (erroCapturado instanceof ApiError && erroCapturado.codigo === "PIN_INVALIDO") {
        setErro("PIN incorreto");
        setTremendo(true);
        window.setTimeout(() => setTremendo(false), 400);
        return;
      }
      if (erroCapturado instanceof ApiError && erroCapturado.codigo === "BLOQUEADO_TEMPORARIAMENTE") {
        setErro("Muitas tentativas, aguarde alguns minutos.");
        return;
      }
      setErro("Não foi possível entrar. Tente novamente.");
    }
  }

  function aoApertarTecla(tecla: (typeof TECLAS)[number]) {
    if (enviando) {
      return;
    }

    if (tecla === "ok") {
      // Tecla "ok" só existe para preencher a grade (12 posições = 4
      // dígitos de espaço mantido); o envio já acontece sozinho ao
      // completar 4 dígitos, então ela não faz nada.
      return;
    }

    if (tecla === "apagar") {
      setErro(null);
      setPin((atual) => atual.slice(0, -1));
      return;
    }

    setErro(null);
    setPin((atual) => {
      if (atual.length >= 4) {
        return atual;
      }
      const novoPin = atual + tecla;
      if (novoPin.length === 4) {
        void submeter(novoPin);
      }
      return novoPin;
    });
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">Digite o PIN de</p>
        <p className="text-lg font-medium">{mecanicoNome}</p>
      </div>

      <div
        className={`flex gap-3 ${tremendo ? "animate-shake" : ""}`}
        role="status"
        aria-label={`${pin.length} de 4 dígitos digitados`}
      >
        {[0, 1, 2, 3].map((indice) => (
          <div
            key={indice}
            className={`flex size-4 items-center justify-center rounded-full border-2 ${
              indice < pin.length ? "border-primary bg-primary" : "border-border bg-transparent"
            }`}
          />
        ))}
      </div>

      <div aria-live="polite" className="h-5 text-sm text-destructive">
        {erro}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {TECLAS.map((tecla) => {
          if (tecla === "ok") {
            return <div key="ok" aria-hidden className="min-h-14 min-w-14" />;
          }
          return (
            <button
              key={tecla}
              type="button"
              disabled={enviando}
              onClick={() => aoApertarTecla(tecla)}
              className="flex min-h-14 min-w-14 items-center justify-center rounded-lg bg-secondary text-xl font-medium text-secondary-foreground transition-colors active:bg-muted disabled:pointer-events-none disabled:opacity-50"
              aria-label={tecla === "apagar" ? "Apagar" : tecla}
            >
              {tecla === "apagar" ? "⌫" : tecla}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onVoltar}
        className="min-h-12 px-4 text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Não é você? Trocar
      </button>
    </div>
  );
}
