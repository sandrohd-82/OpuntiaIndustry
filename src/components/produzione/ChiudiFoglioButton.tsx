"use client";

import { useState } from "react";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  listSottoprodottiPerChiusuraAction,
  registraSottoprodottiChiusuraAction,
} from "@/app/actions/produzione-sottoprodotti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import type { FoglioLavorazione } from "@/lib/produzione/fogli-lavorazione";
import type { SottoprodottoPrenotazione } from "@/lib/produzione/sottoprodotti";

type Draft = {
  qtyConsumata: string;
  prodottoId: string;
  qtySottoprodotto: string;
};

type Props = {
  foglio: FoglioLavorazione;
  className: string;
  label?: string;
  onCloseFoglio: (
    id: string
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  onError: (message: string | null) => void;
};

function numeroPositivo(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

export function ChiudiFoglioButton({
  foglio,
  className,
  label = "Chiudi foglio",
  onCloseFoglio,
  onError,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [prenotazioni, setPrenotazioni] = useState<SottoprodottoPrenotazione[]>(
    []
  );
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function chiediChiusura() {
    setBusy(true);
    onError(null);
    const listed = await listSottoprodottiPerChiusuraAction({
      codiceProdottoUscita: foglio.codiceProdottoUscita,
    });
    if (!listed.success) {
      setBusy(false);
      onError(listed.error);
      return;
    }
    if (listed.items.length === 0) {
      const closed = await onCloseFoglio(foglio.id);
      setBusy(false);
      if (!closed.ok) onError(closed.error);
      return;
    }
    const catalogo = await listProdottiPropriAction();
    setBusy(false);
    if (!catalogo.success) {
      onError(catalogo.error);
      return;
    }
    setProdotti(catalogo.prodotti);
    setDraft(
      Object.fromEntries(
        listed.items.map((item) => [
          item.id,
          { qtyConsumata: "", prodottoId: "", qtySottoprodotto: "" },
        ])
      )
    );
    setFormError(null);
    setPrenotazioni(listed.items);
  }

  async function registraEChiudi() {
    setFormError(null);
    const righe = [];
    for (const item of prenotazioni) {
      const row = draft[item.id];
      const qtyConsumata = numeroPositivo(row?.qtyConsumata ?? "");
      const qtySottoprodotto = numeroPositivo(row?.qtySottoprodotto ?? "");
      if (!row?.prodottoId || qtyConsumata == null || qtySottoprodotto == null) {
        setFormError(
          `Compila consumo, secondo prodotto e quantità per ${item.numeroDocumento}.`
        );
        return;
      }
      righe.push({
        id: item.id,
        qtyConsumata,
        prodottoSottoprodottoId: row.prodottoId,
        qtySottoprodotto,
      });
    }
    setBusy(true);
    const saved = await registraSottoprodottiChiusuraAction({
      foglioId: foglio.id,
      codiceProdottoUscita: foglio.codiceProdottoUscita,
      righe,
    });
    if (!saved.success) {
      setBusy(false);
      setFormError(saved.error);
      return;
    }
    const closed = await onCloseFoglio(foglio.id);
    setBusy(false);
    if (!closed.ok) {
      setFormError(closed.error);
      return;
    }
    setPrenotazioni([]);
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void chiediChiusura()}
        className={className}
      >
        {busy ? "Verifica chiusura…" : label}
      </button>
      {prenotazioni.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
          >
            <h3 className="text-base font-semibold">Secondo prodotto di lavorazione</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              La quantità consumata del prodotto di partenza non coincide con
              la quantità uscita. Indica quanto è stato usato e quale secondo
              prodotto è nato. Non è uno scarto.
            </p>
            <div className="mt-4 space-y-4">
              {prenotazioni.map((item) => {
                const esclusi = new Set(
                  [item.prodottoIngressoId, item.prodottoUscitaId].filter(
                    (id): id is string => Boolean(id)
                  )
                );
                const scelte = prodotti.filter((p) => {
                  if (esclusi.has(p.id)) return false;
                  const codice = p.codice.trim().toUpperCase();
                  return (
                    codice !== item.prodottoIngressoCodice.trim().toUpperCase() &&
                    codice !== item.prodottoUscitaCodice.trim().toUpperCase()
                  );
                });
                const row = draft[item.id] ?? {
                  qtyConsumata: "",
                  prodottoId: "",
                  qtySottoprodotto: "",
                };
                return (
                  <fieldset
                    key={item.id}
                    className="rounded-lg border border-[var(--border)] px-3 py-3 text-sm"
                  >
                    <legend className="px-1 font-medium">
                      {item.numeroDocumento} · {item.prodottoIngressoCodice} →{" "}
                      {item.prodottoUscitaCodice}
                    </legend>
                    <p className="text-xs text-[var(--muted)]">
                      Uscita prevista {item.qtyUscita.toLocaleString("it-IT")}{" "}
                      {item.unita}
                      {item.processoNome ? ` · ${item.processoNome}` : ""}
                    </p>
                    <label className="mt-3 block">
                      <span className="mb-1 block font-medium">
                        {item.prodottoIngressoCodice} consumato ({item.unita})
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.qtyConsumata}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: { ...row, qtyConsumata: e.target.value },
                          }))
                        }
                        className="w-36 rounded-lg border border-[var(--border)] px-3 py-2"
                      />
                    </label>
                    <label className="mt-3 block">
                      <span className="mb-1 block font-medium">
                        Secondo prodotto
                      </span>
                      <select
                        value={row.prodottoId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: { ...row, prodottoId: e.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2"
                      >
                        <option value="">Seleziona prodotto…</option>
                        {scelte.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codice} — {p.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="mt-3 block">
                      <span className="mb-1 block font-medium">
                        Quantità del secondo prodotto ({item.unita})
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="0.001"
                        value={row.qtySottoprodotto}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...row,
                              qtySottoprodotto: e.target.value,
                            },
                          }))
                        }
                        className="w-36 rounded-lg border border-[var(--border)] px-3 py-2"
                      />
                    </label>
                  </fieldset>
                );
              })}
            </div>
            {formError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {formError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPrenotazioni([])}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void registraEChiudi()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {busy ? "Salvataggio…" : "Registra e chiudi"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
