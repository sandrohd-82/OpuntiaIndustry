"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { unlockLockedAreaAction } from "@/app/actions/data-scope";

type Props = {
  open: boolean;
  area: "fiscale" | "rs";
  onClose: () => void;
};

export function UnlockSensitiveAreaDialog({ open, area, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const title =
    area === "fiscale" ? "Area fiscale (blindata)" : "Ricerca e sviluppo (blindata)";

  function close() {
    setStep(1);
    setError(null);
    onClose();
  }

  function confirmUnlock(isCommercialista?: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await unlockLockedAreaAction({
        area,
        confirm1: true,
        confirm2: true,
        isCommercialista,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-labelledby="unlock-sensitive-title"
        className="w-full max-w-md rounded-xl border-2 border-amber-400 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Area riservata
        </p>
        <h3
          id="unlock-sensitive-title"
          className="mt-1 text-lg font-semibold text-slate-900"
        >
          {title}
        </h3>
        {step === 1 ? (
          <p className="mt-3 text-sm text-slate-600">
            Questa area è blindata di default e non è accessibile a nessuno.
            Confermi di volerla sbloccare per questo profilo?
          </p>
        ) : null}
        {step === 2 ? (
          <p className="mt-3 text-sm text-slate-600">
            Conferma definitiva: il profilo potrà accedere a dati riservati.
            L’operazione viene registrata in audit. Procedere?
          </p>
        ) : null}
        {step === 3 ? (
          <p className="mt-3 text-sm text-slate-600">
            Il profilo è un <strong>commercialista</strong>? Se sì, si apre tutta
            l’area fiscale tranne Disponi bonifico e Pagamenti dipendenti. Se no,
            comparirà «Gestisci autorizzazioni» per ogni voce di visualizzazione.
          </p>
        ) : null}
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          >
            Annulla
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStep(2)}
              className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Confermo (1/2)
            </button>
          ) : null}
          {step === 2 && area === "rs" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => confirmUnlock()}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Conferma definitiva
            </button>
          ) : null}
          {step === 2 && area === "fiscale" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setStep(3)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              Conferma definitiva
            </button>
          ) : null}
          {step === 3 ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirmUnlock(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                No, non è commercialista
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => confirmUnlock(true)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Sì, è commercialista
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
