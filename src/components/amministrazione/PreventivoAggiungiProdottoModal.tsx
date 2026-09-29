"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { getPreventivoProdottoContestoAction } from "@/app/actions/preventivi";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import {
  CONFEZIONE_STANDARD,
  prezzoNettoRigaPreventivo,
  type PreventivoConfezioneOption,
  type PreventivoScontisticaRiga,
} from "@/lib/amministrazione/preventivi";
import {
  CONFEZIONE_SISTEMA,
  confezioniListinoDistinte,
  modoConfezioneApplicato,
  pianoConfezionamento,
} from "@/lib/amministrazione/preventivo-confezionamento";
import { ScontoSuddivisioneFields } from "@/components/amministrazione/ScontoSuddivisioneFields";
import { validaQuoteSuddivisione } from "@/lib/amministrazione/sconto-suddivisione";
import { LISTINO_CONTRATTO_MSG } from "@/lib/ecosystem/listino-vigente";
import type { ListinoDisponibilita } from "@/lib/ecosystem/listini";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export type PreventivoProdottoDraft = {
  prodottoId: string;
  quantita: number;
  scontoExtraPct: number;
  scontoListinoPct: number;
  scontoListinoTarga: string;
  scontoSuddivisioneAttiva: boolean;
  scontoQuotaAziendaPct: number;
  scontoQuotaCommercialePct: number;
  confezioneValue: string;
  confezionamento: string;
  imballaggioVoceId: string | null;
  prezzoUnitario: number;
  ivaPercentuale: number;
  listinoId: string | null;
  prezzoDaListino: boolean;
  unitaMisura: string;
  disponibilita: ListinoDisponibilita | null;
  blocco: "fuori_produzione" | "senza_prezzo" | null;
};

type Props = {
  prodotti: ProdottoProprio[];
  ready: boolean;
  initial?: PreventivoProdottoDraft | null;
  onClose: () => void;
  onConfirm: (draft: PreventivoProdottoDraft) => void;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qtyLabel(n: number) {
  return n.toLocaleString("it-IT", { maximumFractionDigits: 3 });
}

function fmtPack(n: number) {
  return qtyLabel(n);
}

function bloccoDaContesto(
  disp: ListinoDisponibilita | null,
  prezzo: number | null
): PreventivoProdottoDraft["blocco"] {
  if (disp === "fuori_produzione") return "fuori_produzione";
  if (prezzo == null || prezzo <= 0) return "senza_prezzo";
  return null;
}

export function PreventivoAggiungiProdottoModal({
  prodotti,
  ready,
  initial,
  onClose,
  onConfirm,
}: Props) {
  const titleId = useId();
  const [prodottoId, setProdottoId] = useState(initial?.prodottoId ?? "");
  const [quantita, setQuantita] = useState<number | "">(
    initial?.quantita ?? ""
  );
  const [scontoExtra, setScontoExtra] = useState<number | "">(
    initial?.scontoExtraPct ?? ""
  );
  const [scontoSuddivisioneAttiva, setScontoSuddivisioneAttiva] = useState(
    Boolean(initial?.scontoSuddivisioneAttiva)
  );
  const [scontoQuotaAzienda, setScontoQuotaAzienda] = useState<number | "">(
    initial?.scontoQuotaAziendaPct ?? ""
  );
  const [scontoQuotaCommerciale, setScontoQuotaCommerciale] = useState<
    number | ""
  >(initial?.scontoQuotaCommercialePct ?? "");
  const [confezioneValue, setConfezioneValue] = useState(
    initial?.confezioneValue || CONFEZIONE_SISTEMA
  );
  const [prezzo, setPrezzo] = useState<number | null>(
    initial?.prezzoUnitario ?? null
  );
  const [iva, setIva] = useState(initial?.ivaPercentuale ?? 22);
  const [listinoId, setListinoId] = useState<string | null>(
    initial?.listinoId ?? null
  );
  const [um, setUm] = useState(initial?.unitaMisura ?? "kg");
  const [disponibilita, setDisponibilita] =
    useState<ListinoDisponibilita | null>(initial?.disponibilita ?? null);
  const [blocco, setBlocco] = useState<PreventivoProdottoDraft["blocco"]>(
    initial?.blocco ?? null
  );
  const [condizioni, setCondizioni] = useState<PreventivoScontisticaRiga[]>([]);
  const [confezioni, setConfezioni] = useState<PreventivoConfezioneOption[]>(
    []
  );
  const [mostraScontistica, setMostraScontistica] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  useEffect(() => {
    if (!prodottoId) {
      setPrezzo(null);
      setListinoId(null);
      setCondizioni([]);
      setConfezioni([]);
      setBlocco(null);
      setDisponibilita(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getPreventivoProdottoContestoAction(prodottoId).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      const nextBlocco = bloccoDaContesto(res.disponibilita, res.prezzo);
      setPrezzo(res.prezzo);
      setIva(res.iva);
      setListinoId(res.listinoId);
      setUm(res.unitaMisura);
      setDisponibilita(res.disponibilita);
      setBlocco(nextBlocco);
      setCondizioni(res.condizioni);
      setConfezioni(res.confezioni);
      setConfezioneValue((prev) => {
        if (initial?.prodottoId === prodottoId && prev) return prev;
        return CONFEZIONE_SISTEMA;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [prodottoId, initial?.prodottoId]);

  function confirm() {
    if (!prodottoId) {
      setError("Seleziona un prodotto.");
      return;
    }
    if (blocco === "fuori_produzione") {
      setError(LISTINO_CONTRATTO_MSG.fuori_produzione);
      return;
    }
    if (blocco === "senza_prezzo") {
      setError(LISTINO_CONTRATTO_MSG.senza_prezzo);
      return;
    }
    const qty = quantita === "" ? 0 : quantita;
    if (!(qty > 0)) {
      setError("Inserisci la quantità.");
      return;
    }
    const extra = scontoExtra === "" ? 0 : scontoExtra;
    if (scontoSuddivisioneAttiva) {
      const quote = validaQuoteSuddivisione({
        scontoPct: extra,
        attiva: true,
        quotaAziendaPct: scontoQuotaAzienda === "" ? 0 : scontoQuotaAzienda,
        quotaCommercialePct:
          scontoQuotaCommerciale === "" ? 0 : scontoQuotaCommerciale,
      });
      if (!quote.ok) {
        setError(quote.error);
        return;
      }
    }
    const opt =
      confezioni.find((c) => c.value === confezioneValue) ??
      confezioni.find((c) => c.isStandard);
    const packListino = confezioniListinoDistinte(condizioni);
    const usaListino = packListino.length > 0;
    const modo = modoConfezioneApplicato(
      confezioneValue,
      packListino.map((p) => p.imballaggioVoceId)
    );
    const piano = usaListino
      ? pianoConfezionamento({
          quantita: qty,
          condizioni,
          modo,
        })
      : null;
    const label = piano?.testo || opt?.label || "Standard";
    const voceId = piano
      ? piano.manuale
        ? piano.modo
        : (piano.pezzi[0]?.imballaggioVoceId ?? null)
      : (opt?.imballaggioVoceId ?? null);
    onConfirm({
      prodottoId,
      quantita: qty,
      scontoExtraPct: extra,
      scontoListinoPct: piano?.scontoPct ?? 0,
      scontoListinoTarga: piano?.targa ?? "",
      scontoSuddivisioneAttiva,
      scontoQuotaAziendaPct: scontoQuotaAzienda === "" ? 0 : scontoQuotaAzienda,
      scontoQuotaCommercialePct:
        scontoQuotaCommerciale === "" ? 0 : scontoQuotaCommerciale,
      confezioneValue: piano ? piano.modo : (opt?.value ?? CONFEZIONE_STANDARD),
      confezionamento: label,
      imballaggioVoceId: voceId,
      prezzoUnitario: prezzo ?? 0,
      ivaPercentuale: iva,
      listinoId,
      prezzoDaListino: Boolean(prezzo && prezzo > 0),
      unitaMisura: um,
      disponibilita,
      blocco,
    });
  }

  const extraNum = scontoExtra === "" ? 0 : scontoExtra;
  const qtyNum = quantita === "" ? 0 : quantita;
  const packListino = useMemo(
    () => confezioniListinoDistinte(condizioni),
    [condizioni]
  );
  const modo = modoConfezioneApplicato(
    confezioneValue,
    packListino.map((p) => p.imballaggioVoceId)
  );
  const piano = useMemo(() => {
    if (!packListino.length || !(qtyNum > 0)) return null;
    return pianoConfezionamento({
      quantita: qtyNum,
      condizioni,
      modo,
    });
  }, [packListino.length, qtyNum, condizioni, modo]);
  const proposta = useMemo(() => {
    if (!packListino.length || !(qtyNum > 0)) return null;
    return pianoConfezionamento({
      quantita: qtyNum,
      condizioni,
      modo: CONFEZIONE_SISTEMA,
    });
  }, [packListino.length, qtyNum, condizioni]);
  const netto =
    prezzo != null
      ? prezzoNettoRigaPreventivo(prezzo, extraNum, piano?.scontoPct ?? 0)
      : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/55 px-4 py-10"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold text-slate-900">
          {initial ? "Modifica prodotto" : "Aggiungi prodotto"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Prezzo da listino in carica. Lo sconto extra è in aggiunta alle
          condizioni di listino.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Prodotto</span>
            <select
              required
              disabled={!ready || loading}
              value={prodottoId}
              onChange={(e) => setProdottoId(e.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {prodotti.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codice} — {p.nome}
                </option>
              ))}
            </select>
          </label>

          {prodottoId ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              {loading ? (
                <p className="text-slate-500">Caricamento listino…</p>
              ) : blocco === "fuori_produzione" ? (
                <p className="text-red-700">
                  {LISTINO_CONTRATTO_MSG.fuori_produzione}
                </p>
              ) : blocco === "senza_prezzo" ? (
                <p className="text-red-700">
                  {LISTINO_CONTRATTO_MSG.senza_prezzo}
                </p>
              ) : (
                <p>
                  Prezzo listino:{" "}
                  <span className="font-semibold">
                    {prezzo != null ? `${euro(prezzo)} € / ${um}` : "—"}
                  </span>
                  {disponibilita === "non_disponibile"
                    ? " · Al momento non disponibile"
                    : null}
                </p>
              )}
            </div>
          ) : null}

          <div>
            <button
              type="button"
              disabled={!prodottoId || loading}
              onClick={() => setMostraScontistica((v) => !v)}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40"
            >
              {mostraScontistica ? "Nascondi scontistica" : "Mostra scontistica"}
            </button>
            {mostraScontistica ? (
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200">
                {condizioni.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">
                    Nessuna condizione di sconto sul listino in carica per
                    questo prodotto.
                  </p>
                ) : (
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-slate-100 text-slate-600">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Qty da</th>
                        <th className="px-2 py-1.5 font-medium">Qty a</th>
                        <th className="px-2 py-1.5 font-medium">Confezione</th>
                        <th className="px-2 py-1.5 font-medium">kg</th>
                        <th className="px-2 py-1.5 font-medium">Targa</th>
                        <th className="px-2 py-1.5 font-medium">Sconto</th>
                        <th className="px-2 py-1.5 font-medium">Condizioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {condizioni.map((c) => (
                        <tr key={c.id} className="border-t border-slate-100">
                          <td className="px-2 py-1.5 tabular-nums">
                            {qtyLabel(c.qtyDa)}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {c.qtyA == null ? "∞" : qtyLabel(c.qtyA)}
                          </td>
                          <td className="px-2 py-1.5">{c.imballaggioLabel}</td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {c.kgConfezione > 0 ? qtyLabel(c.kgConfezione) : "—"}
                          </td>
                          <td className="px-2 py-1.5 font-mono">{c.targa || "—"}</td>
                          <td className="px-2 py-1.5 tabular-nums">
                            {c.scontoPct.toLocaleString("it-IT")}%
                          </td>
                          <td className="px-2 py-1.5 text-slate-600">
                            {c.preview ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ) : null}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Quantità ({um})</span>
            <ClearableNumberInput
              required
              min={0}
              value={quantita}
              onValueChange={setQuantita}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Sconto extra listino (%)
            </span>
            <ClearableNumberInput
              min={0}
              max={100}
              value={scontoExtra}
              onValueChange={setScontoExtra}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            <ScontoSuddivisioneFields
              scontoPct={extraNum}
              attiva={scontoSuddivisioneAttiva}
              quotaAzienda={scontoQuotaAzienda}
              quotaCommerciale={scontoQuotaCommerciale}
              onChange={(next) => {
                setScontoSuddivisioneAttiva(next.attiva);
                setScontoQuotaAzienda(next.quotaAzienda);
                setScontoQuotaCommerciale(next.quotaCommerciale);
              }}
            />
            {netto != null && prezzo != null ? (
              <p className="mt-1 text-xs text-slate-500">
                Prezzo netto riga: {euro(netto)} € / {um}
                {piano && piano.scontoPct > 0
                  ? ` · sconto listino ${piano.scontoPct.toLocaleString("it-IT")}%${
                      piano.targa ? ` ${piano.targa}` : ""
                    }`
                  : ""}
              </p>
            ) : null}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Confezionamento</span>
            {packListino.length > 0 ? (
              <>
                <select
                  value={modo}
                  onChange={(e) => setConfezioneValue(e.target.value)}
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value={CONFEZIONE_SISTEMA}>
                    Soluzione migliore (sconto di listino più alto)
                  </option>
                  {packListino.map((p) => (
                    <option key={p.imballaggioVoceId} value={p.imballaggioVoceId}>
                      Solo {fmtPack(p.kg)} kg — {p.etichetta}
                    </option>
                  ))}
                </select>
                {proposta ? (
                  <p className="mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-950">
                    Proposta: {proposta.testo}
                    {proposta.scontoPct > 0
                      ? `. Sconto listino ${proposta.scontoPct.toLocaleString("it-IT")}%${
                          proposta.targa ? ` ${proposta.targa}` : ""
                        }.`
                      : ". Nessuno sconto di listino su questa quantità."}
                  </p>
                ) : null}
                {piano && modo !== CONFEZIONE_SISTEMA ? (
                  <p className="mt-2 text-xs text-slate-600">
                    Scelta operatore: {piano.testo}. Sconto applicato{" "}
                    {piano.scontoPct > 0
                      ? `${piano.scontoPct.toLocaleString("it-IT")}%${
                          piano.targa ? ` ${piano.targa}` : ""
                        }`
                      : "nessuno"}
                    {proposta && piano.scontoPct === proposta.scontoPct
                      ? ". Il prezzo non cambia rispetto alla proposta."
                      : ". Il prezzo segue lo sconto di questa confezione."}
                  </p>
                ) : null}
              </>
            ) : (
              <select
                value={confezioneValue}
                onChange={(e) => setConfezioneValue(e.target.value)}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {(confezioni.length
                  ? confezioni
                  : [
                      {
                        value: CONFEZIONE_STANDARD,
                        label: "Standard",
                        isStandard: true,
                        imballaggioVoceId: null,
                      },
                    ]
                ).map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </label>

          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={loading || Boolean(blocco)}
              onClick={confirm}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {initial ? "Aggiorna" : "Aggiungi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
