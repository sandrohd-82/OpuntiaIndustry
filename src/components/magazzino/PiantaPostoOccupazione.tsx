"use client";

import { useEffect, useMemo, useState } from "react";
import { listImballaggiCiMagazzinoAction } from "@/app/actions/magazzino-lotti";
import {
  getOccupazionePostoAction,
  liberaPostoAction,
  occupaPostoAction,
  rimuoviElementoPostoAction,
} from "@/app/actions/magazzino-posto-occupazione";
import { BarcodePreview } from "@/components/magazzino/BarcodePreview";
import {
  POSTO_ELEMENTO_TIPO_LABEL,
  etichettaPayloadElemento,
  etichettaPayloadPallet,
  type PostoElementoTipo,
  type PostoOccupazione,
} from "@/lib/magazzino/posto-occupazione";
import type { ImballaggioMagazzinoOpt } from "@/lib/magazzino/types";
import type { MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";

function stampaEtichette(occ: PostoOccupazione) {
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  const righe = [
    `<h1>Pallet ${occ.codicePallet}</h1><p>${occ.imballaggioNome} · ${POSTO_ELEMENTO_TIPO_LABEL[occ.tipoElemento]}</p>`,
    occ.lottoInternoCodice
      ? `<p>Lotto interno: ${occ.lottoInternoCodice}</p>`
      : "",
    occ.lottoEsternoCodice
      ? `<p>Lotto esterno: ${occ.lottoEsternoCodice}</p>`
      : "",
    ...occ.elementi.map(
      (e) =>
        `<div class="etichetta"><h2>N. ${e.numero}</h2><p>Pallet ${occ.codicePallet}${
          e.pesoKg != null ? ` · ${e.pesoKg} kg` : ""
        }</p><p class="mono">${etichettaPayloadElemento(occ.codicePallet, e.numero)}</p></div>`
    ),
  ].join("");
  w.document.write(`<!doctype html><html><head><title>Etichette ${occ.codicePallet}</title>
<style>
body{font-family:sans-serif;padding:16px}
.etichetta{border:1px solid #111;padding:12px;margin:12px 0;page-break-inside:avoid}
h1,h2{margin:0 0 8px} .mono{font-family:monospace;font-size:12px}
@media print { button{display:none} }
</style></head><body>
<p>Stampa etichette: numero + codice per QR/barre. Chiudi dopo la stampa.</p>
${righe}
<button onclick="window.print()">Stampa</button>
</body></html>`);
  w.document.close();
}

export function PiantaPostoOccupazione({
  posto,
  onCambioStato,
  onChiudi,
}: {
  posto: MappaAreaDisegnata;
  onCambioStato: (occupazione: "libero" | "occupato") => void;
  onChiudi: () => void;
}) {
  const [occ, setOcc] = useState<PostoOccupazione | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const [tipo, setTipo] = useState<PostoElementoTipo>("confezione");
  const [voceId, setVoceId] = useState("");
  const [qty, setQty] = useState("");
  const [peso, setPeso] = useState("");
  const [lottoIn, setLottoIn] = useState("");
  const [lottoEx, setLottoEx] = useState("");
  const [confezioni, setConfezioni] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [isolamenti, setIsolamenti] = useState<ImballaggioMagazzinoOpt[]>([]);
  const [stampaId, setStampaId] = useState<string | null>(null);

  const voci = tipo === "isolamento" ? isolamenti : confezioni;

  useEffect(() => {
    let live = true;
    void (async () => {
      setLoading(true);
      const [o, cat] = await Promise.all([
        getOccupazionePostoAction(posto.ubicazioneId),
        listImballaggiCiMagazzinoAction(),
      ]);
      if (!live) return;
      if (o.success) setOcc(o.occupazione);
      else setErrore(o.error);
      if (cat.success) {
        setConfezioni(cat.confezioni);
        setIsolamenti(cat.isolamenti);
      }
      setLoading(false);
    })();
    return () => {
      live = false;
    };
  }, [posto.ubicazioneId]);

  const palletPayload = useMemo(
    () => (occ ? etichettaPayloadPallet(occ.codicePallet) : ""),
    [occ]
  );

  async function occupa() {
    setBusy(true);
    setErrore("");
    const q = qty.trim() ? Number(qty.replace(",", ".")) : null;
    const p = peso.trim() ? Number(peso.replace(",", ".")) : null;
    const res = await occupaPostoAction({
      ubicazioneId: posto.ubicazioneId,
      tipoElemento: tipo,
      imballaggioVoceId: voceId,
      quantitaElementi:
        q != null && Number.isFinite(q) && q > 0 ? Math.round(q) : null,
      pesoKg: p != null && Number.isFinite(p) && p > 0 ? p : null,
      lottoInternoCodice: lottoIn.trim() || null,
      lottoEsternoCodice: lottoEx.trim() || null,
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

  async function togli(id: string) {
    setBusy(true);
    setErrore("");
    const res = await rimuoviElementoPostoAction(id);
    setBusy(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setOcc((prev) =>
      prev
        ? { ...prev, elementi: prev.elementi.filter((e) => e.id !== id) }
        : prev
    );
  }

  return (
    <div className="rounded-xl border border-green-700 bg-green-50 px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-green-950">
            Occupazione {posto.codice}
            {posto.nome.trim() ? ` — ${posto.nome.trim()}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-green-900">
            Lo stato libero/occupato dipende dal pallet sul posto, non dai
            settaggi. Quantità e pesi sono opzionali ora; diventeranno
            obbligatori a gestionale operativo.
          </p>
        </div>
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-white"
        >
          Chiudi
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-green-900">Caricamento…</p>
      ) : occ ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-green-950">
            <span className="font-semibold">Pallet {occ.codicePallet}</span>
            {" · "}
            {POSTO_ELEMENTO_TIPO_LABEL[occ.tipoElemento]} {occ.imballaggioNome}
            {occ.quantitaElementi != null
              ? ` · ${occ.quantitaElementi} elementi`
              : ""}
          </p>
          <p className="text-xs text-green-900">
            Lotto interno: {occ.lottoInternoCodice || "—"} · Lotto esterno:{" "}
            {occ.lottoEsternoCodice || "—"}
            {occ.lottoEsternoId
              ? " (collegato allo storico lotto)"
              : occ.lottoEsternoCodice
                ? " (codice annotato; storico quando il lotto è in anagrafica)"
                : ""}
          </p>
          <div className="flex flex-wrap gap-4">
            <div>
              <p className="mb-1 text-xs font-medium">QR pallet</p>
              <BarcodePreview value={palletPayload} format="qrcode" scale={3} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium">Barre pallet</p>
              <BarcodePreview value={occ.codicePallet} format="code128" />
            </div>
          </div>
          {occ.elementi.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-green-900">
                <tr>
                  <th className="py-1 pr-3">Numero</th>
                  <th className="py-1 pr-3">Peso</th>
                  <th className="py-1 pr-3">Etichetta</th>
                  <th className="py-1">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {occ.elementi.map((e) => (
                  <tr key={e.id} className="border-t border-green-200">
                    <td className="py-1.5 pr-3 font-mono font-semibold">
                      {e.numero}
                    </td>
                    <td className="py-1.5 pr-3">
                      {e.pesoKg != null ? `${e.pesoKg} kg` : "—"}
                    </td>
                    <td className="py-1.5 pr-3">
                      <button
                        type="button"
                        className="text-xs font-medium text-green-900 underline"
                        onClick={() =>
                          setStampaId((id) => (id === e.id ? null : e.id))
                        }
                      >
                        QR / barre
                      </button>
                      {stampaId === e.id ? (
                        <div className="mt-1 flex gap-3">
                          <BarcodePreview
                            value={etichettaPayloadElemento(
                              occ.codicePallet,
                              e.numero
                            )}
                            format="qrcode"
                            scale={2}
                            compact
                          />
                          <BarcodePreview
                            value={e.numero}
                            format="code128"
                            compact
                          />
                        </div>
                      ) : null}
                    </td>
                    <td className="py-1.5">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void togli(e.id)}
                        className="text-xs font-medium text-rose-800 underline"
                      >
                        Rimuovi (venduto/altro)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-green-900">
              Nessun elemento numerato: solo pallet. Puoi liberare il posto o
              aggiungere elementi in un secondo momento quando il conteggio
              sarà obbligatorio.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => stampaEtichette(occ)}
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
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["isolamento", "confezione"] as PostoElementoTipo[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setTipo(t);
                  setVoceId("");
                }}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                  tipo === t
                    ? "border-green-900 bg-green-800 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                Aggiungi {POSTO_ELEMENTO_TIPO_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-xs font-medium">
              Tipo movimentazione
              <select
                value={voceId}
                onChange={(e) => setVoceId(e.target.value)}
                className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
              >
                <option value="">Scegli…</option>
                {voci.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome} ({v.codice})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium">
              Elementi sul pallet (opz.)
              <input
                type="number"
                min={1}
                max={200}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium">
              Peso per elemento kg (opz.)
              <input
                type="number"
                min={0.001}
                step="any"
                value={peso}
                onChange={(e) => setPeso(e.target.value)}
                className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium">
              Lotto interno (opz.)
              <input
                value={lottoIn}
                onChange={(e) => setLottoIn(e.target.value)}
                className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
              />
            </label>
            <label className="text-xs font-medium">
              Lotto esterno (opz.)
              <input
                value={lottoEx}
                onChange={(e) => setLottoEx(e.target.value)}
                className="mt-0.5 w-full rounded border border-green-200 bg-white px-2 py-1 text-sm"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busy || !voceId}
            onClick={() => void occupa()}
            className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy ? "Occupazione…" : "Occupa posto"}
          </button>
        </div>
      )}
      {errore ? <p className="mt-2 text-sm text-red-700">{errore}</p> : null}
    </div>
  );
}
