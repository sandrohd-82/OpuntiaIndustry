"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { WebmailBoard } from "@/components/commerciale/WebmailBoard";

export function WebmailScegliModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (msg: { id: string; subject: string }) => Promise<void>;
}) {
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function scegli(msg: { id: string; subject: string }) {
    setBusy(true);
    setErrore(null);
    try {
      await onSelect(msg);
    } catch (err) {
      setErrore(err instanceof Error ? err.message : "Selezione non riuscita.");
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[115] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="webmail-scegli-title"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 id="webmail-scegli-title" className="text-base font-semibold text-slate-900">
            Cerca nella casella
          </h2>
          <p className="text-xs text-slate-500">
            Casella propria, dei sottoposti o di chi hai il diritto di
            visualizzare. Apri la mail, controllala e, se è quella giusta,
            selezionala: la finestra si chiude.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
        >
          Chiudi
        </button>
      </header>
      {errore ? (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}
      <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <WebmailBoard
          pick={{
            onSelect: (msg) => {
              void scegli(msg);
            },
          }}
        />
      </div>
    </div>,
    document.body
  );
}
