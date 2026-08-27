"use client";

import { useEffect, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import type { SchedaPayload } from "@/lib/chat/share";
import type { SchedaSharePreview } from "@/lib/chat/scheda-share-fields";
import { schedaEntityLabel } from "@/lib/chat/types";

type Props = {
  open: boolean;
  preview: SchedaSharePreview | null;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: SchedaPayload) => void;
};

export function ChatSchedaShareFieldsModal({
  open,
  preview,
  busy = false,
  onClose,
  onConfirm,
}: Props) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [includePrice, setIncludePrice] = useState(false);

  useEffect(() => {
    if (!open || !preview) return;
    setSelectedFields(
      new Set(
        preview.fields.filter((f) => f.defaultSelected).map((f) => f.key)
      )
    );
    setSelectedRefs(
      new Set(
        preview.referenti
          .filter((r) => r.defaultSelected)
          .map((r) => r.id)
      )
    );
    setIncludePrice(Boolean(preview.price?.defaultSelected));
  }, [open, preview]);

  const canSend = Boolean(preview);

  if (!open || !preview) return null;

  function toggleField(key: string) {
    setSelectedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRef(id: string) {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectBasics() {
    setSelectedFields(
      new Set(
        preview!.fields.filter((f) => f.defaultSelected).map((f) => f.key)
      )
    );
    setSelectedRefs(new Set());
    setIncludePrice(false);
  }

  function selectAll() {
    setSelectedFields(new Set(preview!.fields.map((f) => f.key)));
    setSelectedRefs(new Set(preview!.referenti.map((r) => r.id)));
    setIncludePrice(Boolean(preview!.price));
  }

  function confirm() {
    if (!preview || !canSend) return;
    const fields = preview.fields
      .filter((f) => selectedFields.has(f.key))
      .map((f) => ({ key: f.key, label: f.label, value: f.value }));
    const referenti = preview.referenti
      .filter((r) => selectedRefs.has(r.id))
      .map((r) => ({
        id: r.id,
        label: r.label,
        dettaglio: r.dettaglio,
      }));
    const priceOn = includePrice && Boolean(preview.price);
    onConfirm({
      entityType: preview.entityType,
      entityId: preview.entityId,
      title: preview.title,
      subtitle: preview.subtitle,
      fields,
      referenti,
      includePrice: priceOn,
      priceLabel: priceOn ? preview.price!.label : "",
      priceValue: priceOn ? preview.price!.value : "",
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal
        aria-label="Cosa condividere"
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Cosa condividere?
            </p>
            <p className="text-[11px] text-slate-500">
              {schedaEntityLabel[preview.entityType]} · {preview.title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectBasics}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Solo anagrafica base
            </button>
            <button
              type="button"
              onClick={selectAll}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
            >
              Seleziona tutto
            </button>
          </div>

          <section className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Campi
            </p>
            {preview.fields.length === 0 ? (
              <p className="text-xs text-slate-400">Nessun campo disponibile.</p>
            ) : (
              preview.fields.map((f) => (
                <label
                  key={f.key}
                  className="flex cursor-pointer gap-2.5 rounded-lg border border-[var(--border)] px-2.5 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedFields.has(f.key)}
                    onChange={() => toggleField(f.key)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-800">
                      {f.label}
                    </span>
                    <span className="block whitespace-pre-wrap break-words text-[11px] text-slate-500">
                      {f.value}
                    </span>
                  </span>
                </label>
              ))
            )}
          </section>

          {preview.referenti.length > 0 ? (
            <section className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Referenti
              </p>
              {preview.referenti.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer gap-2.5 rounded-lg border border-[var(--border)] px-2.5 py-2 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedRefs.has(r.id)}
                    onChange={() => toggleRef(r.id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-800">
                      {r.label}
                    </span>
                    {r.dettaglio ? (
                      <span className="block text-[11px] text-slate-500">
                        {r.dettaglio}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </section>
          ) : null}

          {preview.price ? (
            <section className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Prezzo
              </p>
              <label className="flex cursor-pointer gap-2.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-2 hover:bg-amber-50">
                <input
                  type="checkbox"
                  checked={includePrice}
                  onChange={() => setIncludePrice((v) => !v)}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-slate-800">
                    {preview.price.label}
                  </span>
                  <span className="block text-[11px] text-slate-600">
                    {preview.price.value}
                  </span>
                </span>
              </label>
            </section>
          ) : null}
        </div>

        <div className="flex gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !canSend}
            className="flex-1 rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Invio…" : "Condividi"}
          </button>
        </div>
      </div>
    </div>
  );
}
