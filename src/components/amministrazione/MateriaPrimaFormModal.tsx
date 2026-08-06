"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { listFornitoriAction } from "@/app/actions/fornitori";
import type { Fornitore } from "@/lib/amministrazione/fornitori";
import {
  sanitizeCodiceMateriaPrima,
  type MateriaPrima,
  type MateriaPrimaInput,
} from "@/lib/amministrazione/materie-prime";

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
  const [codice, setCodice] = useState(initial?.codice ?? "");
  const [nome, setNome] = useState(initial?.nome ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [isBio, setIsBio] = useState(initial?.isBio ?? false);
  const [fornitoreBioId, setFornitoreBioId] = useState(
    initial?.fornitoreBioId ?? ""
  );
  const [fornitori, setFornitori] = useState<Fornitore[]>([]);
  const [fornitoriLoading, setFornitoriLoading] = useState(false);
  const [fornitoriError, setFornitoriError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!isBio) return;
    let cancelled = false;
    void (async () => {
      setFornitoriLoading(true);
      const result = await listFornitoriAction();
      if (cancelled) return;
      if (result.success) {
        setFornitori(result.fornitori);
        setFornitoriError(null);
      } else {
        setFornitori([]);
        setFornitoriError(result.error);
      }
      setFornitoriLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isBio]);

  const selectedFornitore = useMemo(
    () => fornitori.find((f) => f.id === fornitoreBioId) ?? null,
    [fornitori, fornitoreBioId]
  );

  const bioCertificato =
    selectedFornitore?.bioCertificato ??
    (isEdit && initial?.fornitoreBioId === fornitoreBioId
      ? initial.bioCertificato
      : "");
  const bioCodice =
    selectedFornitore?.bioCodice ??
    (isEdit && initial?.fornitoreBioId === fornitoreBioId
      ? initial.bioCodice
      : "");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codice.trim() || !nome.trim() || saving) return;
    if (isBio && !fornitoreBioId) return;
    setSaving(true);
    try {
      await onSave({
        codice: sanitizeCodiceMateriaPrima(codice.trim()),
        nome: nome.trim(),
        note: note.trim(),
        isBio,
        fornitoreBioId: isBio ? fornitoreBioId : null,
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
          Codice alfanumerico (minuscole, maiuscole e cifre), usato nei tag
          “Fornitore di”.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Codice interno</span>
            <input
              value={codice}
              onChange={(e) =>
                setCodice(sanitizeCodiceMateriaPrima(e.target.value))
              }
              required
              autoFocus
              spellCheck={false}
              autoCapitalize="off"
              placeholder="Es. Mp01a"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono outline-none focus:border-[var(--primary)]"
            />
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

          <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
            <legend className="px-1 text-sm font-medium">Bio</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isBio}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsBio(checked);
                  if (!checked) setFornitoreBioId("");
                }}
                className="rounded border-[var(--border)]"
              />
              Materia prima biologica
            </label>

            {isBio && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Fornitore di riferimento
                  </span>
                  <select
                    value={fornitoreBioId}
                    onChange={(e) => setFornitoreBioId(e.target.value)}
                    required
                    disabled={fornitoriLoading}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)] disabled:opacity-60"
                  >
                    <option value="">
                      {fornitoriLoading
                        ? "Caricamento fornitori…"
                        : "Seleziona fornitore"}
                    </option>
                    {fornitori.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.codiceTarga} — {f.ragioneSociale}
                      </option>
                    ))}
                  </select>
                </label>
                {fornitoriError && (
                  <p className="text-xs text-red-600">{fornitoriError}</p>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Certificato</span>
                    <input
                      value={bioCertificato}
                      readOnly
                      placeholder="Dal fornitore selezionato"
                      className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-[var(--muted)] outline-none"
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium">Codice bio</span>
                    <input
                      value={bioCodice}
                      readOnly
                      placeholder="Dal fornitore selezionato"
                      className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-[var(--muted)] outline-none"
                    />
                  </label>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  Certificato e codice bio vengono presi automaticamente dalla
                  scheda del fornitore.
                </p>
              </>
            )}
          </fieldset>

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
              disabled={saving || (isBio && !fornitoreBioId)}
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
