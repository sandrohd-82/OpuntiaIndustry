"use client";

import { useEffect, useId, useState } from "react";

type Props = {
  essiccatoreName: string;
  currentKg: number;
  onClose: () => void;
  onConfirm: (deltaKg: number) => void;
};

function formatDisplay(raw: string) {
  if (!raw) return "0";
  const n = Number(raw);
  if (Number.isNaN(n)) return raw;
  return n.toLocaleString("it-IT", { maximumFractionDigits: 1 });
}

export function ProdottoCalcolatriceModal({
  essiccatoreName,
  currentKg,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [sign, setSign] = useState<"+" | "-">("+");
  const [digits, setDigits] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function press(key: string) {
    if (key === "C") {
      setDigits("");
      return;
    }
    if (key === "⌫") {
      setDigits((d) => d.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (digits.includes(".")) return;
      setDigits((d) => (d ? `${d}.` : "0."));
      return;
    }
    if (digits.replace(".", "").length >= 7) return;
    setDigits((d) => (d === "0" ? key : `${d}${key}`));
  }

  function submit() {
    const qty = Number(digits);
    if (!Number.isFinite(qty) || qty <= 0) return;
    const delta = sign === "+" ? qty : -qty;
    onConfirm(delta);
  }

  const qty = Number(digits) || 0;
  const preview = Math.max(0, currentKg + (sign === "+" ? qty : -qty));
  const keys = ["7", "8", "9", "4", "5", "6", "1", "2", "3", ".", "0", "⌫"] as const;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Prodotto caricato
            </h2>
            <p className="text-sm text-[var(--muted)]">{essiccatoreName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <div className="rounded-2xl border border-slate-300 bg-gradient-to-b from-slate-100 to-slate-200 p-3 shadow-inner">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSign("+")}
              className={`rounded-xl py-3 text-2xl font-bold transition-colors ${
                sign === "+"
                  ? "bg-emerald-500 text-white shadow"
                  : "bg-white text-emerald-700 ring-1 ring-slate-300"
              }`}
              aria-pressed={sign === "+"}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setSign("-")}
              className={`rounded-xl py-3 text-2xl font-bold transition-colors ${
                sign === "-"
                  ? "bg-red-500 text-white shadow"
                  : "bg-white text-red-700 ring-1 ring-slate-300"
              }`}
              aria-pressed={sign === "-"}
            >
              −
            </button>
          </div>

          <div className="mb-3 rounded-xl bg-slate-900 px-3 py-4 text-right shadow-inner">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">
              Quantità (kg)
            </p>
            <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-300">
              {sign === "+" ? "+" : "−"}
              {formatDisplay(digits)}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Totale previsto:{" "}
              <span className="font-medium text-slate-200">
                {preview.toLocaleString("it-IT", { maximumFractionDigits: 1 })}{" "}
                kg
              </span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {keys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => press(k)}
                className="rounded-xl bg-white py-3 text-lg font-semibold text-slate-800 shadow-sm ring-1 ring-slate-300 active:bg-slate-100"
              >
                {k}
              </button>
            ))}
            <button
              type="button"
              onClick={() => press("C")}
              className="col-span-3 rounded-xl bg-slate-700 py-2.5 text-sm font-semibold text-white"
            >
              Cancella
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={qty <= 0}
          className="mt-4 w-full rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
        >
          Conferma
        </button>
      </div>
    </div>
  );
}
