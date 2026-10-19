"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import {
  impostaMailProfessionaleAction,
  opzioniMailProfessionaleAction,
  type OpzioneMailProfessionale,
} from "@/app/actions/mail-professionale";

export function MailProfessionaleModal({
  onConfermata,
  onAnnulla,
}: {
  onConfermata: (email: string) => void;
  onAnnulla: () => void;
}) {
  const titleId = useId();
  const [opzioni, setOpzioni] = useState<OpzioneMailProfessionale[]>([]);
  const [scelta, setScelta] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [salvataggio, setSalvataggio] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void opzioniMailProfessionaleAction().then((res) => {
      if (cancelled) return;
      setCaricamento(false);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setOpzioni(res.opzioni);
      if (res.opzioni.length === 1) setScelta(res.opzioni[0].email);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function conferma() {
    if (!scelta || salvataggio) return;
    setSalvataggio(true);
    setErrore(null);
    const res = await impostaMailProfessionaleAction(scelta);
    setSalvataggio(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    onConfermata(res.email);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl bg-white p-5 text-slate-900 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Mail professionale
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Su preventivi, fatture e comunicazioni in uscita compare solo la mail
          lavorativa. Scegli quella ufficiale tra le mail a cui hai accesso.
          Può essere uguale alla mail di accesso oppure una casella diversa.
        </p>
        {caricamento ? (
          <p className="mt-4 text-sm text-slate-500">Caricamento…</p>
        ) : (
          <fieldset className="mt-4 space-y-2">
            <legend className="sr-only">Mail professionale</legend>
            {opzioni.length === 0 ? (
              <p className="text-sm text-red-700">
                Non risultano mail a cui hai accesso. Chiedi una casella
                aziendale prima di creare il documento.
              </p>
            ) : (
              opzioni.map((opzione) => (
                <label
                  key={opzione.email}
                  className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50"
                >
                  <input
                    type="radio"
                    name="mail-professionale"
                    className="mt-1"
                    checked={scelta === opzione.email}
                    onChange={() => setScelta(opzione.email)}
                  />
                  <span>
                    <span className="block font-medium">{opzione.etichetta}</span>
                    <span className="text-slate-600">{opzione.email}</span>
                  </span>
                </label>
              ))
            )}
          </fieldset>
        )}
        {errore ? (
          <p className="mt-3 text-sm text-red-700">{errore}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onAnnulla}
            disabled={salvataggio}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => void conferma()}
            disabled={salvataggio || caricamento || !scelta}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {salvataggio ? "Salvataggio…" : "Usa questa mail"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
