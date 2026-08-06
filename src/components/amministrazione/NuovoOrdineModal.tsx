"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

export type NuovoOrdineValues = {
  cliente: string;
  dataOrdine: string;
  importoEuro: number;
  note: string;
};

type Props = {
  onClose: () => void;
  onCreate: (values: NuovoOrdineValues) => void;
};

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function NuovoOrdineModal({ onClose, onCreate }: Props) {
  const titleId = useId();
  const [cliente, setCliente] = useState("");
  const [dataOrdine, setDataOrdine] = useState(todayInputValue);
  const [importo, setImporto] = useState("");
  const [note, setNote] = useState("");

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

  function submit(e: FormEvent) {
    e.preventDefault();
    const importoEuro = Number(importo.replace(",", "."));
    if (!cliente.trim() || !dataOrdine || !Number.isFinite(importoEuro)) return;
    onCreate({
      cliente: cliente.trim(),
      dataOrdine,
      importoEuro,
      note: note.trim(),
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo ordine ricevuto
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Inserisci i dati dell’ordine. Il numero verrà generato automaticamente.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Cliente</span>
            <input
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data ordine</span>
            <input
              type="date"
              value={dataOrdine}
              onChange={(e) => setDataOrdine(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Importo (€)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={importo}
              onChange={(e) => setImporto(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Salva ordine
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
