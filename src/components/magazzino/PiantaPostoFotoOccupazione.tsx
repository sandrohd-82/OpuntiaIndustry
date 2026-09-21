"use client";

import { useEffect, useState } from "react";
import {
  dettaglioElencoPostoAction,
  listLottiDaSistemareAction,
  rettificaOccupazionePostoAction,
} from "@/app/actions/magazzino-posto-occupazione";
import {
  formatKgIt,
  pesoOccupazioneKg,
  targaProdottoOccupazione,
  type DettaglioElencoPosto,
  type LottoDaSistemare,
  type PostoPesoModo,
} from "@/lib/magazzino/posto-occupazione";

function riga(label: string, value: string) {
  return (
    <li className="flex flex-wrap gap-x-2 text-sm">
      <span className="min-w-[9rem] text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </li>
  );
}

export function PiantaPostoFotoOccupazione({
  ubicazioneId,
  onCambio,
}: {
  ubicazioneId: string;
  onCambio: () => void;
}) {
  const [det, setDet] = useState<DettaglioElencoPosto | null>(null);
  const [load, setLoad] = useState(true);
  const [errore, setErrore] = useState("");
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lotti, setLotti] = useState<LottoDaSistemare[]>([]);
  const [qty, setQty] = useState("1");
  const [pesoModo, setPesoModo] = useState<PostoPesoModo>("per_elemento");
  const [pesi, setPesi] = useState<string[]>([""]);
  const [pesoTot, setPesoTot] = useState("");
  const [note, setNote] = useState("");
  const [lottoKey, setLottoKey] = useState("");
  const [giustificazione, setGiustificazione] = useState("");

  async function reload() {
    setLoad(true);
    const [d, lot] = await Promise.all([
      dettaglioElencoPostoAction(ubicazioneId),
      listLottiDaSistemareAction(),
    ]);
    setLoad(false);
    if (!d.success) {
      setErrore(d.error);
      return;
    }
    setDet(d.dettaglio);
    setErrore("");
    if (lot.success) setLotti(lot.lotti);
    const occ = d.dettaglio.occupazione;
    if (occ) {
      const q = occ.quantitaElementi ?? occ.elementi.length ?? 1;
      setQty(String(Math.max(1, q)));
      setPesoModo(occ.pesoModo);
      setPesi(
        occ.pesoModo === "per_elemento" && occ.elementi.length
          ? occ.elementi.map((e) => (e.pesoKg != null ? String(e.pesoKg) : ""))
          : Array.from({ length: Math.max(1, q) }, () => "")
      );
      setPesoTot(
        occ.pesoComplessivoKg != null ? String(occ.pesoComplessivoKg) : ""
      );
      setNote(occ.note || "");
      setLottoKey(
        occ.prodottoId && occ.lottoInternoCodice
          ? `${occ.prodottoId}|${occ.lottoInternoCodice}`
          : occ.lottoEsternoId || ""
      );
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicazioneId]);

  const qtyN = Math.max(1, Math.min(200, Math.round(Number(qty) || 1)));
  useEffect(() => {
    if (pesoModo !== "per_elemento") return;
    setPesi((prev) => {
      const next = [...prev];
      while (next.length < qtyN) next.push("");
      return next.slice(0, qtyN);
    });
  }, [qtyN, pesoModo]);

  const occ = det?.occupazione ?? null;
  const prod = det?.prodotto ?? null;

  async function salva() {
    if (!occ) return;
    const g = giustificazione.trim();
    if (g.length < 8) {
      setErrore("La giustificazione è obbligatoria (almeno 8 caratteri).");
      return;
    }
    setBusy(true);
    setErrore("");
    const lotto =
      lotti.find((l) => `${l.prodottoId}|${l.lottoInterno}` === lottoKey) ??
      lotti.find((l) => l.lottoEsternoId === lottoKey) ??
      null;
    const pesiKg = pesi.map((p) => Number(String(p).replace(",", ".")));
    const tot = Number(String(pesoTot).replace(",", "."));
    const res = await rettificaOccupazionePostoAction({
      occupazioneId: occ.id,
      giustificazione: g,
      quantitaElementi: qtyN,
      pesoModo,
      pesiElementiKg: pesoModo === "per_elemento" ? pesiKg : undefined,
      pesoComplessivoKg:
        pesoModo === "complessivo" && Number.isFinite(tot) && tot > 0
          ? tot
          : null,
      note,
      prodottoId: lotto?.prodottoId ?? occ.prodottoId ?? undefined,
      lottoInternoCodice:
        lotto?.lottoInterno ?? occ.lottoInternoCodice ?? null,
      lottoEsternoId: lotto?.lottoEsternoId ?? occ.lottoEsternoId ?? null,
    });
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setGiustificazione("");
    setEdit(false);
    await reload();
    onCambio();
  }

  const lottiOpts = [...lotti];
  if (
    occ?.lottoInternoCodice &&
    occ.prodottoId &&
    !lottiOpts.some(
      (l) =>
        l.prodottoId === occ.prodottoId &&
        l.lottoInterno === occ.lottoInternoCodice
    )
  ) {
    lottiOpts.unshift({
      prodottoId: occ.prodottoId,
      prodottoCodice: prod?.codice ?? "",
      prodottoNome: prod?.nome ?? "",
      lottoInterno: occ.lottoInternoCodice,
      lottoEsternoId: occ.lottoEsternoId,
      lottoEsternoCodice: occ.lottoEsternoCodice,
      kgCaricati: 0,
      kgSistemati: 0,
      kgDaSistemare: Number(occ.kgAllocati ?? 0),
    });
  }

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Occupazione</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Dati sotto la foto. Rettifica solo con giustificazione (ISO 9001).
          </p>
        </div>
        {occ && !edit ? (
          <button
            type="button"
            onClick={() => setEdit(true)}
            className="rounded-lg border border-green-800 bg-white px-3 py-1.5 text-sm font-medium text-green-950"
          >
            Modifica
          </button>
        ) : null}
      </div>

      {load ? (
        <p className="mt-3 text-sm text-slate-600">Caricamento occupazione…</p>
      ) : null}
      {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}

      {!load && !occ ? (
        <p className="mt-3 text-sm text-slate-700">Posto libero.</p>
      ) : null}

      {!load && occ && !edit ? (
        <ul className="mt-3 space-y-1">
          {riga("Stato", "Occupato")}
          {riga(
            "Tipo prodotto",
            prod?.nome?.trim() || prod?.codice || "—"
          )}
          {riga("Targa", targaProdottoOccupazione(occ, prod?.codice) || "—")}
          {riga("Quantità totale", formatKgIt(pesoOccupazioneKg(occ)))}
          {riga("Lotto interno", occ.lottoInternoCodice || "—")}
          {riga("Lotto esterno", occ.lottoEsternoCodice || "—")}
          {riga("Movimentazione", occ.movimentazioneNome || "—")}
          {riga(
            "Elementi",
            `${occ.quantitaElementi ?? occ.elementi.length} · ${occ.imballaggioNome || occ.tipoElemento}`
          )}
          {riga("Codice pallet", occ.codicePallet || "—")}
          {occ.note ? riga("Note", occ.note) : null}
        </ul>
      ) : null}

      {occ && edit ? (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-medium">
            Quantità elementi
            <input
              type="number"
              min={1}
              max={200}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <div>
            <p className="text-xs font-medium">Peso</p>
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
                Per elemento
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
                Complessivo
              </button>
            </div>
            {pesoModo === "per_elemento" ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                      className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            ) : (
              <label className="mt-2 block text-xs">
                Peso complessivo (kg)
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  value={pesoTot}
                  onChange={(e) => setPesoTot(e.target.value)}
                  className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
                />
              </label>
            )}
          </div>
          <label className="block text-xs font-medium">
            Lotto
            <select
              value={lottoKey}
              onChange={(e) => setLottoKey(e.target.value)}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            >
              <option value="">Mantieni attuale</option>
              {lottiOpts.map((l) => (
                <option
                  key={`${l.prodottoId}|${l.lottoInterno}`}
                  value={`${l.prodottoId}|${l.lottoInterno}`}
                >
                  {l.prodottoCodice || l.prodottoNome || "Prodotto"} ·{" "}
                  {l.lottoInterno}
                  {l.lottoEsternoCodice ? ` / ${l.lottoEsternoCodice}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-medium">
            Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs font-medium">
            Giustificazione della rettifica (obbligatoria)
            <textarea
              value={giustificazione}
              onChange={(e) => setGiustificazione(e.target.value)}
              rows={3}
              placeholder="Es. peso inserito per errore, correzione quantità elementi…"
              className="mt-0.5 w-full rounded border border-amber-300 bg-amber-50 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void salva()}
              className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            >
              {busy ? "Salvataggio…" : "Salva rettifica"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setEdit(false);
                setErrore("");
                setGiustificazione("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
