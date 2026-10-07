"use client";

import { useEffect, useState } from "react";
import {
  completaCalcoloSpedizioneOrdineAction,
  listOrdiniInAttesaCalcoloSpedizioneAction,
  type OrdineInAttesaCalcolo,
} from "@/app/actions/ordine-calcolo-spedizione";
import { notifyPreventiviSpedizioneNav } from "@/lib/amministrazione/preventivi";

export function OrdiniAttesaCalcoloSpedizione() {
  const [items, setItems] = useState<OrdineInAttesaCalcolo[]>([]);
  const [aperto, setAperto] = useState<OrdineInAttesaCalcolo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await listOrdiniInAttesaCalcoloSpedizioneAction();
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems(res.items);
    setError(null);
    notifyPreventiviSpedizioneNav();
  }

  useEffect(() => {
    void reload();
  }, []);

  if (!items.length && !error && !notice) return null;

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-semibold text-amber-950">
        Ordini in attesa del costo di spedizione
      </p>
      <p className="text-xs text-amber-900">
        Come il preventivo: si conferma solo il prezzo. Fattura, proforma e
        mail non partono da qui.
      </p>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-800">{notice}</p> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
          >
            <div className="text-sm">
              <span className="font-medium">{item.numeroInterno}</span>
              <span className="text-[var(--muted)]"> · {item.cliente}</span>
              {item.prodotto ? (
                <span className="block text-xs text-[var(--muted)]">
                  {item.prodotto}
                </span>
              ) : null}
              {item.indirizzoSpedizione ? (
                <span className="block text-xs text-[var(--muted)]">
                  {item.destinatario ? `${item.destinatario} — ` : ""}
                  {item.indirizzoSpedizione}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setAperto(item);
                setNotice(null);
                setError(null);
              }}
              className="rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              Inserisci il costo
            </button>
          </li>
        ))}
      </ul>
      {aperto ? (
        <OrdineCalcoloSpedizioneSheet
          item={aperto}
          onClose={() => setAperto(null)}
          onCompleted={(message) => {
            setAperto(null);
            setNotice(message);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}

function OrdineCalcoloSpedizioneSheet({
  item,
  onClose,
  onCompleted,
}: {
  item: OrdineInAttesaCalcolo;
  onClose: () => void;
  onCompleted: (message: string) => void;
}) {
  const [importo, setImporto] = useState("");
  const [ivaModo, setIvaModo] = useState<"compreso" | "piu_iva">("piu_iva");
  const [conferma, setConferma] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valore = Number(importo.replace(",", "."));
  const pronto = importo.trim() !== "" && Number.isFinite(valore) && valore > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold">
          Calcolo spedizione · {item.numeroInterno}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {item.cliente}
          {item.prodotto ? ` · ${item.prodotto}` : ""}
        </p>
        {item.indirizzoSpedizione ? (
          <p className="mt-2 text-sm">
            {item.destinatario ? `${item.destinatario} — ` : ""}
            {item.indirizzoSpedizione}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-amber-950">
          Confermi solo il costo. Non parte la fattura, non parte la mail e
          non parte lo SDI.
        </p>
        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Importo (€)</span>
          <input
            inputMode="decimal"
            value={importo}
            onChange={(e) => setImporto(e.target.value)}
            className="w-40 rounded-lg border border-[var(--border)] px-3 py-2"
          />
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="ordine-spedizione-iva"
            checked={ivaModo === "compreso"}
            onChange={() => setIvaModo("compreso")}
          />
          Importo compreso
        </label>
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="ordine-spedizione-iva"
            checked={ivaModo === "piu_iva"}
            onChange={() => setIvaModo("piu_iva")}
          />
          Importo + IVA
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={conferma}
            onChange={(e) => setConferma(e.target.checked)}
            className="mt-1"
          />
          Confermo il costo. Nessun documento parte verso il cliente.
        </label>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy || !pronto || !conferma}
            onClick={() => {
              if (!pronto || !conferma) {
                setError(
                  "Inserisci il costo e conferma. Senza conferma non si registra nulla."
                );
                return;
              }
              setBusy(true);
              setError(null);
              void completaCalcoloSpedizioneOrdineAction({
                ordineId: item.id,
                importo: valore,
                ivaModo,
                confermaCosto: true,
              }).then((res) => {
                setBusy(false);
                if (!res.success) {
                  setError(res.error);
                  return;
                }
                onCompleted(res.message);
              });
            }}
            className="rounded-lg bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Salvataggio…" : "Conferma solo il costo"}
          </button>
        </div>
      </div>
    </div>
  );
}
