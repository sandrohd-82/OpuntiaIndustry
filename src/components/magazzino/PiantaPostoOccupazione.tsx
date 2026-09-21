"use client";

import { useEffect, useMemo, useState } from "react";
import {
  liberaPostoAction,
  listImballaggiPostoAction,
  listLottiDaSistemareAction,
  listMovimentazioniPostoAction,
  occupaPostoAction,
} from "@/app/actions/magazzino-posto-occupazione";
import { PiantaPostoMaterialeCard } from "@/components/magazzino/PiantaPostoMaterialeCard";
import { PiantaStampaEtichetteModal } from "@/components/magazzino/PiantaStampaEtichetteModal";
import {
  fetchDettaglioOccupazionePosto,
  type ImballaggioPostoOpt,
  type LottoDaSistemare,
  type PostoOccupazione,
  type PostoPesoModo,
  type ProdottoLottoElenco,
  type RiepilogoElencoPosto,
} from "@/lib/magazzino/posto-occupazione";
import type { MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";

export function PiantaPostoOccupazione({
  posto,
  riepilogo,
  onCambioStato,
  onChiudi,
}: {
  posto: MappaAreaDisegnata;
  riepilogo?: RiepilogoElencoPosto | null;
  onCambioStato: (occupazione: "libero" | "occupato") => void;
  onChiudi: () => void;
}) {
  const [occ, setOcc] = useState<PostoOccupazione | null>(null);
  const [prodotto, setProdotto] = useState<ProdottoLottoElenco | null>(null);
  const [loading, setLoading] = useState(!riepilogo);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [movimenti, setMovimenti] = useState<ImballaggioPostoOpt[]>([]);
  const [elementiCat, setElementiCat] = useState<ImballaggioPostoOpt[]>([]);
  const [lotti, setLotti] = useState<LottoDaSistemare[]>([]);
  const [movId, setMovId] = useState("");
  const [elId, setElId] = useState("");
  const [qty, setQty] = useState("1");
  const [pesoModo, setPesoModo] = useState<PostoPesoModo>("per_elemento");
  const [pesi, setPesi] = useState<string[]>([""]);
  const [pesoTot, setPesoTot] = useState("");
  const [motivo, setMotivo] = useState("");
  const [lottoKey, setLottoKey] = useState("");
  const [stampaModal, setStampaModal] = useState(false);

  const qtyN = Math.max(1, Math.min(200, Math.round(Number(qty) || 1)));
  const movSel = movimenti.find((m) => m.id === movId) ?? null;
  const confezioniCat = useMemo(
    () =>
      elementiCat
        .filter((v) => v.stadio === "confezione")
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [elementiCat]
  );
  const isolamentiCat = useMemo(
    () =>
      elementiCat
        .filter((v) => v.stadio === "isolamento")
        .slice()
        .sort((a, b) => a.nome.localeCompare(b.nome, "it")),
    [elementiCat]
  );

  useEffect(() => {
    setPesi((prev) => {
      const next = [...prev];
      while (next.length < qtyN) next.push("");
      return next.slice(0, qtyN);
    });
  }, [qtyN]);

  useEffect(() => {
    let live = true;
    setLoading(!riepilogo);
    void fetchDettaglioOccupazionePosto(posto.ubicazioneId)
      .then((o) => {
        if (!live) return;
        if (o.success) {
          setOcc(o.dettaglio.occupazione);
          setProdotto(o.dettaglio.prodotto);
          setErrore("");
        } else {
          setErrore(o.error);
        }
        setLoading(false);
        if (o.success && o.dettaglio.occupazione) return;
        void Promise.all([
          listImballaggiPostoAction(),
          listMovimentazioniPostoAction(posto.ubicazioneId),
        ])
          .then(([cat, amm]) => {
            if (!live) return;
            if (cat.success) setElementiCat(cat.elementi);
            if (amm.success) {
              setMovimenti(amm.voci);
              setMovId((prev) => prev || amm.voci[0]?.id || "");
            }
          })
          .catch(() => {
            /* catalogo solo per occupare un posto libero */
          });
        void listLottiDaSistemareAction()
          .then((lot) => {
            if (!live) return;
            if (lot.success) setLotti(lot.lotti);
          })
          .catch(() => {
            /* elenco lotti solo per nuova occupazione */
          });
      })
      .catch(() => {
        if (!live) return;
        setLoading(false);
        setErrore("Occupazione non disponibile.");
      });
    return () => {
      live = false;
    };
  }, [posto.ubicazioneId]);

  function scegliLotto(value: string) {
    setLottoKey(value);
  }

  const lottoAttivo =
    lotti.find((l) => `${l.prodottoId}|${l.lottoInterno}` === lottoKey) ??
    lotti.find((l) => l.lottoEsternoId === lottoKey) ??
    null;

  async function occupa() {
    setBusy(true);
    setErrore("");
    const pesiKg = pesi.map((p) => Number(String(p).replace(",", ".")));
    const tot = Number(pesoTot.replace(",", "."));
    const res = await occupaPostoAction({
      ubicazioneId: posto.ubicazioneId,
      movimentazioneVoceId: movId,
      elementoVoceId: elId,
      quantitaElementi: qtyN,
      pesoModo,
      pesiElementiKg:
        pesoModo === "per_elemento"
          ? pesiKg.filter((n) => Number.isFinite(n) && n > 0)
          : undefined,
      pesoComplessivoKg:
        pesoModo === "complessivo" && Number.isFinite(tot) && tot > 0
          ? tot
          : null,
      pesoMotivazione: motivo,
      prodottoId: lottoAttivo?.prodottoId,
      lottoInternoCodice: lottoAttivo?.lottoInterno ?? null,
      lottoEsternoId: lottoAttivo?.lottoEsternoId ?? null,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setOcc(res.occupazione);
    onCambioStato("occupato");
  }

  async function libera() {
    setBusy(true);
    setErrore("");
    const res = await liberaPostoAction(posto.ubicazioneId);
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setOcc(null);
    onCambioStato("libero");
  }

  return (
    <div className="rounded-xl border border-green-700 bg-green-50 px-3 py-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-start justify-between gap-2 bg-green-50 pb-2">
        <div>
          <p className="text-sm font-semibold text-green-950">
            Occupazione {posto.codice}
            {posto.nome.trim() ? ` — ${posto.nome.trim()}` : ""}
          </p>
          {occ || riepilogo ? (
            <p className="mt-0.5 text-xs text-green-900">
              Stessi dati del dettaglio in elenco, in formato compatto.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-green-900">
              Solo le movimentazioni del settaggio. Un tipo elemento (cartone o
              sacchetto). Lotto obbligatorio: interno ed esterno si compilano
              insieme.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
        >
          Chiudi
        </button>
      </div>

      {loading && !occ && !riepilogo ? (
        <p className="mt-3 text-sm text-green-900">Caricamento…</p>
      ) : occ || riepilogo ? (
        <div className="mt-3 space-y-3">
          <PiantaPostoMaterialeCard
            occ={occ}
            prodotto={prodotto}
            riepilogo={riepilogo}
          />
          {occ ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setStampaModal(true)}
                className="rounded-lg border border-green-800 bg-white px-3 py-1.5 text-sm font-medium text-green-950"
              >
                Stampa etichette
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void libera()}
                className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                Libera posto
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {movimenti.length === 0 ? (
            <p className="text-sm text-amber-900">
              Nel catalogo Imballaggi non ci sono movimentazioni (pallet, bins,
              …). Aggiungile lì: il settaggio del posto non è obbligatorio.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-0 flex-col gap-1 text-xs font-medium">
                <span>
                  1) Tipo movimentazione
                </span>
                <select
                  value={movId}
                  onChange={(e) => setMovId(e.target.value)}
                  className="mt-auto w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Scegli…</option>
                  {movimenti.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.nome} ({v.codice})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-h-0 flex-col gap-1 text-xs font-medium">
                <span>
                  2) Numero elementi su {movSel?.nome || "…"}
                </span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="mt-auto w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs font-medium sm:col-span-2">
                3) Tipo elemento (cartone o sacchetto, non movimentazione)
                <select
                  value={elId}
                  onChange={(e) => setElId(e.target.value)}
                  className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Scegli uno…</option>
                  {confezioniCat.length ? (
                    <optgroup label="Confezioni">
                      {confezioniCat.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome} ({v.codice})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {isolamentiCat.length ? (
                    <optgroup label="Isolamenti">
                      {isolamentiCat.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome} ({v.codice})
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <div className="sm:col-span-2">
                <p className="text-xs font-medium">4) Peso</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPesoModo("per_elemento")}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                      pesoModo === "per_elemento"
                        ? "border-green-900 bg-green-800 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    Peso per elemento
                  </button>
                  <button
                    type="button"
                    onClick={() => setPesoModo("complessivo")}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                      pesoModo === "complessivo"
                        ? "border-green-900 bg-green-800 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    Peso complessivo {movSel?.nome || ""}
                  </button>
                </div>
                {pesoModo === "per_elemento" ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {pesi.map((p, i) => (
                      <label key={i} className="text-xs">
                        Peso elemento {i + 1} (kg)
                        <input
                          type="number"
                          min={0.001}
                          step="any"
                          value={p}
                          onChange={(e) =>
                            setPesi((prev) => {
                              const next = [...prev];
                              next[i] = e.target.value;
                              return next;
                            })
                          }
                          className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs">
                      Peso complessivo {movSel?.nome || ""} (kg)
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        value={pesoTot}
                        onChange={(e) => setPesoTot(e.target.value)}
                        className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                      />
                    </label>
                    <label className="text-xs">
                      Motivazione (obbligatoria)
                      <input
                        value={motivo}
                        onChange={(e) => setMotivo(e.target.value)}
                        className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                      />
                    </label>
                  </div>
                )}
              </div>
              <label className="text-xs font-medium">
                5) Lotto interno
                <select
                  value={lottoAttivo ? `${lottoAttivo.prodottoId}|${lottoAttivo.lottoInterno}` : ""}
                  onChange={(e) => scegliLotto(e.target.value)}
                  className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Scegli lotto…</option>
                  {lotti.map((l) => (
                    <option
                      key={`${l.prodottoId}|${l.lottoInterno}`}
                      value={`${l.prodottoId}|${l.lottoInterno}`}
                    >
                      {l.prodottoCodice || l.prodottoNome} · {l.lottoInterno}
                      {l.lottoEsternoCodice
                        ? ` · est. ${l.lottoEsternoCodice}`
                        : ""}{" "}
                      · {l.kgDaSistemare.toLocaleString("it-IT")} kg da sistemare
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium">
                5) Lotto esterno
                <select
                  value={lottoAttivo?.lottoEsternoId ?? ""}
                  onChange={(e) => scegliLotto(e.target.value)}
                  className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
                >
                  <option value="">Scegli lotto…</option>
                  {lotti
                    .filter((l) => l.lottoEsternoId)
                    .map((l) => (
                      <option key={l.lottoEsternoId!} value={l.lottoEsternoId!}>
                        {l.prodottoCodice || l.prodottoNome} ·{" "}
                        {l.lottoEsternoCodice} · int. {l.lottoInterno} ·{" "}
                        {l.kgDaSistemare.toLocaleString("it-IT")} kg da
                        sistemare
                      </option>
                    ))}
                </select>
              </label>
              {lottoAttivo ? (
                <p className="sm:col-span-2 text-xs text-green-900">
                  Collegati: interno <strong>{lottoAttivo.lottoInterno}</strong>
                  {lottoAttivo.lottoEsternoCodice
                    ? ` · esterno ${lottoAttivo.lottoEsternoCodice}`
                    : " · esterno non ancora associato"}
                  . Residuo {lottoAttivo.kgDaSistemare.toLocaleString("it-IT")} kg
                  su {lottoAttivo.kgCaricati.toLocaleString("it-IT")} kg caricati.
                </p>
              ) : lotti.length === 0 ? (
                <p className="sm:col-span-2 text-xs text-amber-900">
                  Nessun lotto da sistemare. Carica quantità da Magazzino →
                  Prodotti Agrinsicilia → Inserisci Quantità.
                </p>
              ) : null}
            </div>
          )}
          <button
            type="button"
            disabled={busy || !movId || !elId || !lottoAttivo}
            onClick={() => void occupa()}
            className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Occupazione…" : "Occupa posto"}
          </button>
        </div>
      )}
      {errore ? <p className="mt-2 text-sm text-red-700">{errore}</p> : null}
      {stampaModal && occ ? (
        <PiantaStampaEtichetteModal
          ubicazioneId={posto.ubicazioneId}
          postoCodice={posto.codice}
          postoNome={posto.nome}
          occupazioneIniziale={occ}
          onClose={() => setStampaModal(false)}
        />
      ) : null}
    </div>
  );
}
