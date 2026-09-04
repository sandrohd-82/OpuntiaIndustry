"use client";

import { useTransition } from "react";
import { setMacchinaPowerAction } from "@/app/actions/produzione-macchinari";
import {
  macchinaIsOn,
  type AttivitaOrigine,
  type ProduzioneMacchinario,
} from "@/lib/produzione/macchinari";

type Props = {
  macchina: ProduzioneMacchinario;
  origine: AttivitaOrigine;
  eventoLineaId?: string | null;
  forceOff?: boolean;
  forceOn?: boolean;
  size?: "sm" | "md";
  onChanged?: (item: ProduzioneMacchinario) => void;
  onError?: (message: string) => void;
};

export function MachinePowerToggle({
  macchina,
  origine,
  eventoLineaId,
  forceOff = false,
  forceOn = false,
  size = "md",
  onChanged,
  onError,
}: Props) {
  const [pending, start] = useTransition();
  const on = macchinaIsOn(macchina.statoIot);
  const compact = size === "sm";

  function toggle() {
    if (pending) return;
    if (forceOff && !on) return;
    if (forceOn && on) return;
    start(async () => {
      const res = await setMacchinaPowerAction({
        macchinarioId: macchina.id,
        on: forceOn ? true : forceOff ? false : !on,
        origine,
        eventoLineaId,
      });
      if (!res.success) {
        onError?.(res.error);
        return;
      }
      onChanged?.(res.item);
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${macchina.nome}: ${on ? "On" : "Off"}`}
      disabled={pending || (forceOff && !on) || (forceOn && on)}
      onClick={toggle}
      className={`relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-70 ${
        compact ? "h-8 w-17" : "h-9 w-19"
      } ${on ? "bg-emerald-500" : "bg-slate-300"}`}
    >
      <span
        className={`pointer-events-none absolute font-semibold uppercase tracking-wide text-white transition-opacity ${
          compact ? "text-[10px]" : "text-xs"
        } ${on ? "left-2 opacity-100" : "left-2 opacity-0"}`}
      >
        On
      </span>
      <span
        className={`pointer-events-none absolute font-semibold uppercase tracking-wide text-slate-600 transition-opacity ${
          compact ? "text-[10px]" : "text-xs"
        } ${on ? "right-2 opacity-0" : "right-2.5 opacity-100"}`}
      >
        Off
      </span>
      <span
        className={`absolute top-0.5 rounded-full bg-white shadow-sm ring-1 ring-black/10 transition-transform duration-200 ${
          compact ? "h-7 w-7" : "h-8 w-8"
        } ${on ? (compact ? "translate-x-[2.15rem]" : "translate-x-[2.4rem]") : "translate-x-0.5"}`}
      />
    </button>
  );
}
