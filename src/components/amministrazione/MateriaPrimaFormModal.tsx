"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  CODICE_MATERIA_PRIMA_PREFIX,
  composeCodiceMateriaPrima,
  sanitizeCodiceMateriaPrimaBody,
  stripCodiceMateriaPrimaPrefix,
  type MateriaPrima,
  type MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";

type Tipologia = "bio" | "convenzionale";

type Props = {
  mode: "create" | "edit";
  initial?: MateriaPrima | null;
  onClose: () => void;
  onSave: (values: MateriaPrimaInput) => void | Promise<void>;
};

export function MateriaPrimaFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const isEdit = mode === "edit";
  const [codiceBody, setCodiceBody] = useState(
    initial ? stripCodiceMateriaPrimaPrefix(initial.codice) : ""
  );
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [tipologia, setTipologia] = useState<Tipologia | null>(
    initial ? (initial.isBio ? "bio" : "convenzionale") : null
  );
  const [saving, setSaving] = useState(false);

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

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = sanitizeCodiceMateriaPrimaBody(codiceBody);
    if (!body || !nome.trim() || !tipologia || saving) return;
    setSaving(true);
    try {
      await onSave({
        codice: composeCodiceMateriaPrima(body),
        nome: nome.trim(),
        note: note.trim(),
        isBio: tipologia === "bio",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 sm:py-14"
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
          {isEdit ? "Modifica materia prima" : "Nuova materia prima"}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Il prefisso Mp è fisso. Certificato e codice bio si gestiscono nella
          scheda fornitore.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Codice interno</span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)] focus-within:border-[var(--primary)]">
              <span
                className="inline-flex select-none items-center bg-slate-100 px-3 font-mono text-base font-black tracking-wide text-emerald-800"
                title="Prefisso fisso"
              >
                {CODICE_MATERIA_PRIMA_PREFIX}
              </span>
              <input
                value={codiceBody}
                onChange={(e) =>
                  setCodiceBody(sanitizeCodiceMateriaPrimaBody(e.target.value))
                }
                required
                autoFocus
                spellCheck={false}
                autoCapitalize="off"
                placeholder="-01/a"
                aria-label="Parte codice dopo Mp"
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono outline-none"
              />
            </div>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
              placeholder="Descrizione breve"
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

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipologia === "bio"}
                onChange={() => setTipologia("bio")}
                className="rounded border-[var(--border)]"
              />
              Prodotto bio
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={tipologia === "convenzionale"}
                onChange={() => setTipologia("convenzionale")}
                className="rounded border-[var(--border)]"
              />
              Prodotto convenzionale
            </label>
          </div>

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
              disabled={saving || !tipologia}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : isEdit ? "Salva modifiche" : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
