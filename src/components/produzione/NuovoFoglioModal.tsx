"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import {
  LOTTI_DEMO,
  ORDINI_DEMO,
  PRODOTTI_USCITA_DEMO,
  toDatetimeLocalValue,
  type MotivoLavorazione,
} from "@/lib/produzione/fogli-lavorazione";

export type NuovoFoglioFormValues = {
  startedAt: string;
  motivo: MotivoLavorazione;
  ordineId: string | null;
  ordineLabel: string | null;
  lottoId: string;
  lottoLabel: string;
  lottoProdotto: string;
  codiceProdottoUscitaId: string;
  codiceProdottoUscita: string;
};

type Props = {
  onClose: () => void;
  onCreate: (values: NuovoFoglioFormValues) => void;
};

export function NuovoFoglioModal({ onClose, onCreate }: Props) {
  const titleId = useId();
  const [startedLocal, setStartedLocal] = useState(() =>
    toDatetimeLocalValue(new Date())
  );
  const [motivo, setMotivo] = useState<MotivoLavorazione>("magazzino");
  const [ordineId, setOrdineId] = useState("");
  const [lottoId, setLottoId] = useState("");
  const [prodottoUscitaId, setProdottoUscitaId] = useState("");

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

  const ordine = useMemo(
    () => ORDINI_DEMO.find((o) => o.id === ordineId) ?? null,
    [ordineId]
  );
  const lotto = useMemo(
    () => LOTTI_DEMO.find((l) => l.id === lottoId) ?? null,
    [lottoId]
  );
  const prodottoUscita = useMemo(
    () => PRODOTTI_USCITA_DEMO.find((p) => p.id === prodottoUscitaId) ?? null,
    [prodottoUscitaId]
  );

  const canSubmit =
    Boolean(startedLocal) &&
    Boolean(lotto) &&
    Boolean(prodottoUscita) &&
    (motivo === "magazzino" || Boolean(ordine));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!lotto || !prodottoUscita) return;
    if (motivo === "ordine" && !ordine) return;

    const startedAt = new Date(startedLocal);
    if (Number.isNaN(startedAt.getTime())) return;

    onCreate({
      startedAt: startedAt.toISOString(),
      motivo,
      ordineId: motivo === "ordine" ? ordine!.id : null,
      ordineLabel:
        motivo === "ordine"
          ? `${ordine!.label} · ${ordine!.cliente}`
          : null,
      lottoId: lotto.id,
      lottoLabel: `${lotto.label} (${lotto.quantitaKg.toLocaleString("it-IT")} kg)`,
      lottoProdotto: lotto.prodotto,
      codiceProdottoUscitaId: prodottoUscita.id,
      codiceProdottoUscita: `${prodottoUscita.codice} — ${prodottoUscita.nome}`,
    });
  }

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
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo foglio di lavorazione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Inserisci i dati fondamentali. Verrà generato un codice FL con fine
          prevista a +24 ore.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-5">
          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">1) Data inizio</span>
            <input
              type="datetime-local"
              value={startedLocal}
              onChange={(e) => setStartedLocal(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2.5 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">
              2) Motivo lavorazione
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMotivo("magazzino")}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  motivo === "magazzino"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] hover:bg-slate-50"
                }`}
              >
                Magazzino
              </button>
              <button
                type="button"
                onClick={() => setMotivo("ordine")}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium ${
                  motivo === "ordine"
                    ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                    : "border-[var(--border)] hover:bg-slate-50"
                }`}
              >
                Ordine
              </button>
            </div>

            {motivo === "ordine" && (
              <label className="block text-sm">
                <span className="mb-1.5 block font-medium">
                  Selezione ordine
                </span>
                <select
                  value={ordineId}
                  onChange={(e) => setOrdineId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 outline-none focus:border-[var(--primary)]"
                >
                  <option value="">Seleziona ordine…</option>
                  {ORDINI_DEMO.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} — {o.cliente}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] text-[var(--muted)]">
                  Collegato all’area Ordini (in arrivo). Elenco demo temporaneo.
                </span>
              </label>
            )}
          </fieldset>

          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">
              3) Seleziona lotto da lavorare
            </span>
            <select
              value={lottoId}
              onChange={(e) => setLottoId(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 outline-none focus:border-[var(--primary)]"
            >
              <option value="">Seleziona lotto…</option>
              {LOTTI_DEMO.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} — {l.prodotto} (
                  {l.quantitaKg.toLocaleString("it-IT")} kg)
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-[var(--muted)]">
              Collegato a Merce in ingresso (in arrivo). Elenco demo temporaneo.
            </span>
          </label>

          <label className="block text-sm">
            <span className="mb-1.5 block font-semibold">
              4) Seleziona codice prodotto in uscita
            </span>
            <select
              value={prodottoUscitaId}
              onChange={(e) => setProdottoUscitaId(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 outline-none focus:border-[var(--primary)]"
            >
              <option value="">Seleziona codice…</option>
              {PRODOTTI_USCITA_DEMO.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codice} — {p.nome}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-[11px] text-[var(--muted)]">
              Elenco prodotti in uscita (in arrivo). Elenco demo temporaneo.
            </span>
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
              disabled={!canSubmit}
              className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-40"
            >
              Crea foglio
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
