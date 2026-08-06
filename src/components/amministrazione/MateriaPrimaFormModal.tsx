"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { FaChevronDown } from "react-icons/fa6";
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

const LEGGENDA_PARTI = [
  { pezzo: "Mp", significato: "Materia prima (prefisso fisso)" },
  {
    pezzo: "Cl",
    significato: "Prime 2 consonanti del prodotto (es. Cladodi → Cl)",
  },
  { pezzo: "B / C", significato: "Biologico oppure Convenzionale" },
  { pezzo: "/", significato: "Separatore se presente età o altro dettaglio" },
  { pezzo: "12", significato: "Età o altro dettaglio" },
] as const;

export function MateriaPrimaFormModal({
  mode,
  initial,
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const leggendaId = useId();
  const isEdit = mode === "edit";
  const [codiceBody, setCodiceBody] = useState(
    initial ? stripCodiceMateriaPrimaPrefix(initial.codice) : ""
  );
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [tipologia, setTipologia] = useState<Tipologia | null>(
    initial ? (initial.isBio ? "bio" : "convenzionale") : null
  );
  const [leggendaOpen, setLeggendaOpen] = useState(false);
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
          Prefisso Mp fisso. Esempio completo:{" "}
          <span className="font-mono font-medium text-slate-700">MpClB/12</span>
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <div className="space-y-2">
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
                    setCodiceBody(
                      sanitizeCodiceMateriaPrimaBody(e.target.value)
                    )
                  }
                  required
                  autoFocus
                  spellCheck={false}
                  autoCapitalize="off"
                  placeholder="ClB/12"
                  aria-label="Parte codice dopo Mp"
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 font-mono outline-none"
                />
              </div>
            </label>

            <div className="rounded-lg border border-[var(--border)] bg-slate-50/80">
              <button
                type="button"
                onClick={() => setLeggendaOpen((open) => !open)}
                aria-expanded={leggendaOpen}
                aria-controls={leggendaId}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-[var(--primary)] hover:bg-slate-100/80"
              >
                Suggerisci leggenda
                <FaChevronDown
                  size={12}
                  className={`shrink-0 transition-transform ${leggendaOpen ? "rotate-180" : ""}`}
                />
              </button>
              {leggendaOpen && (
                <div
                  id={leggendaId}
                  className="space-y-2 border-t border-[var(--border)] px-3 py-3"
                >
                  <p className="text-xs text-[var(--muted)]">
                    Struttura del codice — es.{" "}
                    <span className="font-mono font-semibold text-slate-700">
                      MpClB/12
                    </span>
                  </p>
                  <ul className="space-y-1.5">
                    {LEGGENDA_PARTI.map((voce) => (
                      <li
                        key={voce.pezzo}
                        className="flex gap-2 text-xs leading-snug"
                      >
                        <span className="w-10 shrink-0 font-mono font-semibold text-slate-800">
                          {voce.pezzo}
                        </span>
                        <span className="text-[var(--muted)]">
                          {voce.significato}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
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
