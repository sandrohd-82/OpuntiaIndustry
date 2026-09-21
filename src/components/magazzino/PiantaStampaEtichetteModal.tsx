"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { FaPrint } from "react-icons/fa6";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import {
  POSTO_ELEMENTO_TIPO_LABEL,
  etichettaPayloadElemento,
  etichettaPayloadPallet,
  fetchDettaglioOccupazionePosto,
  type PostoOccupazione,
  type ProdottoLottoElenco,
} from "@/lib/magazzino/posto-occupazione";
import {
  formatKgIt,
  pesoOccupazioneKg,
  stampaEtichettePosto,
} from "@/lib/magazzino/stampa-etichette-posto";

type Props = {
  ubicazioneId: string;
  postoCodice?: string;
  postoNome?: string;
  occupazioneIniziale?: PostoOccupazione | null;
  onClose: () => void;
};

export function PiantaStampaEtichetteModal({
  ubicazioneId,
  postoCodice,
  postoNome,
  occupazioneIniziale = null,
  onClose,
}: Props) {
  const titleId = useId();
  const [occ, setOcc] = useState<PostoOccupazione | null>(occupazioneIniziale);
  const [prodotto, setProdotto] = useState<ProdottoLottoElenco | null>(null);
  const [load, setLoad] = useState(!occupazioneIniziale);
  const [errore, setErrore] = useState("");
  const [includePallet, setIncludePallet] = useState(true);
  const [includeColli, setIncludeColli] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    setLoad(true);
    void fetchDettaglioOccupazionePosto(ubicazioneId)
      .then((res) => {
        if (!live) return;
        setLoad(false);
        if (!res.success) {
          setErrore(res.error);
          return;
        }
        setOcc(res.dettaglio.occupazione);
        setProdotto(res.dettaglio.prodotto);
        setErrore("");
      })
      .catch(() => {
        if (!live) return;
        setLoad(false);
        setErrore("Occupazione non disponibile.");
      });
    return () => {
      live = false;
    };
  }, [ubicazioneId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  async function stampa() {
    if (!occ) return;
    const elementi = includeColli ? occ.elementi : [];
    if (!includePallet && elementi.length === 0) {
      setErrore("Seleziona il pallet cumulativo e/o i colli da stampare.");
      return;
    }
    setBusy(true);
    setErrore("");
    try {
      await stampaEtichettePosto({
        occ,
        prodotto,
        postoCodice,
        postoNome,
        includePallet,
        elementi,
      });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Stampa non riuscita.");
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div
      className="fixed inset-0 z-[280] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-base font-semibold">
          Stampa etichette
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Etichetta cumulativa del pallet e etichette dei singoli colli. QR e
          codice a barre su ogni foglio.
          {postoCodice
            ? ` Posto ${postoCodice}${postoNome?.trim() ? ` — ${postoNome.trim()}` : ""}.`
            : ""}
        </p>

        {load ? (
          <p className="mt-4 text-sm text-slate-600">Caricamento occupazione…</p>
        ) : !occ ? (
          <p className="mt-4 text-sm text-amber-900">
            Il posto è libero oppure non ha una scheda materiale: non ci sono
            etichette da stampare.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includePallet}
                  onChange={(e) => setIncludePallet(e.target.checked)}
                />
                Pallet cumulativo
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={includeColli}
                  onChange={(e) => setIncludeColli(e.target.checked)}
                  disabled={occ.elementi.length === 0}
                />
                Tutti i colli
                {occ.elementi.length
                  ? ` (${occ.elementi.length})`
                  : " (nessuno)"}
              </label>
            </div>

            <div className="mt-4 max-h-[min(58vh,32rem)] space-y-4 overflow-y-auto pr-1">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pallet cumulativo
                </p>
                <p className="mt-1 text-lg font-semibold text-slate-900">
                  {occ.movimentazioneNome || "Pallet"} {occ.codicePallet}
                </p>
                <p className="mt-0.5 text-sm text-slate-700">
                  {prodotto
                    ? `${prodotto.codice}${prodotto.nome ? ` — ${prodotto.nome}` : ""}`
                    : "Prodotto —"}
                  {" · "}
                  {occ.quantitaElementi ?? occ.elementi.length} colli · peso{" "}
                  {formatKgIt(pesoOccupazioneKg(occ))}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  Lotto int. {occ.lottoInternoCodice || "—"} · est.{" "}
                  {occ.lottoEsternoCodice || "—"} ·{" "}
                  {POSTO_ELEMENTO_TIPO_LABEL[occ.tipoElemento]}
                  {occ.imballaggioNome ? ` · ${occ.imballaggioNome}` : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">QR pallet</p>
                    <BarcodePreview
                      value={etichettaPayloadPallet(occ.codicePallet)}
                      format="qrcode"
                      scale={2}
                      compact
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium text-slate-600">
                      Barre cumulative
                    </p>
                    <BarcodePreview
                      value={occ.codicePallet}
                      format="code128"
                      compact
                    />
                  </div>
                </div>
              </article>

              {occ.elementi.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {occ.elementi.map((el) => (
                    <article
                      key={el.id}
                      className="rounded-xl border border-slate-200 bg-white p-3"
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Collo
                      </p>
                      <p className="mt-1 font-mono text-base font-semibold">
                        {el.numero}
                        {el.pesoKg != null ? ` · ${formatKgIt(el.pesoKg)}` : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        <BarcodePreview
                          value={etichettaPayloadElemento(
                            occ.codicePallet,
                            el.numero
                          )}
                          format="qrcode"
                          scale={2}
                          compact
                        />
                        <BarcodePreview
                          value={el.numero}
                          format="code128"
                          compact
                        />
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Nessun collo numerato: si stampa solo l’etichetta cumulativa
                  del pallet
                  {occ.pesoMotivazione ? ` (${occ.pesoMotivazione})` : ""}.
                </p>
              )}
            </div>
          </>
        )}

        {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Chiudi
          </button>
          <button
            type="button"
            disabled={busy || load || !occ}
            onClick={() => void stampa()}
            className="inline-flex items-center gap-2 rounded-lg bg-green-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            <FaPrint size={14} />
            {busy ? "Preparazione stampa…" : "Stampa"}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modal, document.body);
}
