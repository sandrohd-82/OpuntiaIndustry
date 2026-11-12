"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { anteprimaNumeroFatturaBozzaAction } from "@/app/actions/fattura-da-ordine";
import { getAliquoteEmissioneAction } from "@/app/actions/fattura-emissione";
import { listPreventivoCommercialiRiferimentoAction } from "@/app/actions/preventivi";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { FatturaEmissioneDocumento } from "@/components/amministrazione/FatturaEmissioneDocumento";
import { FatturaEmissioneScontiProdotto } from "@/components/amministrazione/FatturaEmissioneScontiProdotto";
import { OrdinePagamentoPianoFields } from "@/components/amministrazione/OrdinePagamentoPianoFields";
import { usePrenotazioneNumero } from "@/components/amministrazione/FatturaNumeroPrenotato";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  calcolaTotaliEmissione,
  emptyEmissioneRiga,
  emptySpedizioneRiga,
  importoEmissioneRiga,
  type EmissioneRigaInput,
} from "@/lib/amministrazione/fattura-emissione";
import { formatEuro, todayIsoDate } from "@/lib/amministrazione/fatture";
import { formatIbanDisplay } from "@/lib/iban";
import {
  applyTotaleToPiano,
  emptyPagamentoPiano,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import { AGRINSICILIA_COORDINATE } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

export function FatturaEmissioneBoard() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [aliquote, setAliquote] = useState<number[]>([0, 4, 10, 22]);
  const [dataDocumento, setDataDocumento] = useState(todayIsoDate);
  const [dataConsegna, setDataConsegna] = useState(todayIsoDate);
  const [piano, setPiano] = useState<OrdinePagamentoPiano>(emptyPagamentoPiano());
  const [sendToSdi, setSendToSdi] = useState(true);
  const [sendCourtesyEmail, setSendCourtesyEmail] = useState(true);
  const [dryRunSdi, setDryRunSdi] = useState(false);
  const [noteDocumento, setNoteDocumento] = useState("");
  const [numeroBozza, setNumeroBozza] = useState("");
  const [commerciale, setCommerciale] =
    useState<PreventivoCommercialeRiferimento | null>(null);
  const [sezione, setSezione] = useState<string | null>(null);
  const [rigaBozza, setRigaBozza] = useState<number | null>(null);
  const [righe, setRighe] = useState<EmissioneRigaInput[]>([
    emptyEmissioneRiga({ ivaPercentuale: 22 }),
  ]);
  const [spedizione, setSpedizione] = useState(emptySpedizioneRiga(0, false, 22));
  const [includeSpedizione, setIncludeSpedizione] = useState(false);
  const [sessioneNumeroId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `fattura-${Date.now()}`
  );
  const prenotazioneNumero = usePrenotazioneNumero({
    contesto: "fattura",
    sessioneId: sessioneNumeroId,
    attivo: false,
    dataDocumento,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    fatturaId: string;
    numeroFattura: string;
    pdfUrl: string;
    eiStatus: string;
  } | null>(null);

  useEffect(() => {
    void listProdottiPropriAction().then((r) => {
      if (r.success) setProdotti(r.prodotti);
    });
    void getAliquoteEmissioneAction().then((r) => {
      if (r.success) setAliquote(r.aliquote);
    });
    void listPreventivoCommercialiRiferimentoAction({
      includiSenzaAccount: true,
    }).then((res) => {
      if (res.success) setCommerciale(res.defaultItem ?? null);
    });
  }, []);

  useEffect(() => {
    let cancel = false;
    void anteprimaNumeroFatturaBozzaAction(dataDocumento).then((res) => {
      if (cancel || !res.success) return;
      setNumeroBozza(res.numero);
    });
    return () => {
      cancel = true;
    };
  }, [dataDocumento]);

  function vaiA(id: string, rigaIndex?: number) {
    setSezione(id);
    if (rigaIndex != null) setRigaBozza(rigaIndex);
    const nodo = document.getElementById(
      rigaIndex != null && id === "fattura-righe"
        ? (rigaIndex < righe.length
          ? `fattura-riga-${rigaIndex}`
          : "fattura-spedizione")
        : id
    );
    nodo?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const righeCalcolo = useMemo(() => {
    const list = righe.map((r) => ({
      ...r,
      importo: importoEmissioneRiga(r),
    }));
    if (includeSpedizione && spedizione.prezzoUnitario > 0) {
      list.push({
        ...spedizione,
        importo: importoEmissioneRiga(spedizione),
      });
    }
    return list;
  }, [righe, includeSpedizione, spedizione]);

  const totals = useMemo(
    () => calcolaTotaliEmissione(righeCalcolo),
    [righeCalcolo]
  );
  const righeBozza = useMemo(
    () =>
      includeSpedizione && spedizione.prezzoUnitario > 0
        ? [...righe, spedizione]
        : righe,
    [includeSpedizione, righe, spedizione]
  );

  useEffect(() => {
    setPiano((prev) => applyTotaleToPiano(prev, totals.totale));
  }, [totals.totale]);

  function updateRiga(index: number, patch: Partial<EmissioneRigaInput>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function applyProdotto(index: number, prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    if (!p) {
      updateRiga(index, {
        prodottoId: null,
        scontoListinoPct: 0,
        scontoExtraPct: 0,
        scontoPercentuale: 0,
      });
      return;
    }
    updateRiga(index, {
      prodottoId: p.id,
      codice: p.codice,
      descrizione: p.nome,
      note: p.note ?? "",
      scontoListinoPct: 0,
      scontoExtraPct: 0,
      scontoPercentuale: 0,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!cliente) {
      setError("Seleziona un cliente.");
      return;
    }

    const payload = {
      clienteId: cliente.id,
      dataDocumento,
      dataConsegna,
      piano: applyTotaleToPiano(piano, totals.totale),
      sendToSdi,
      sendCourtesyEmail,
      dryRunSdi,
      ordineId: null,
      noteDocumento,
      righe: [
        ...righe,
        ...(includeSpedizione && spedizione.prezzoUnitario > 0
          ? [spedizione]
          : []),
      ],
    };

    setBusy(true);
    prenotazioneNumero.bloccaRilascio();
    try {
      const res = await fetch("/api/invoices/create-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          prenotazioneId: null,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: string;
        fatturaId?: string;
        numeroFattura?: string;
        pdfUrl?: string;
        eiStatus?: string;
      };
      if (!json.success) {
        prenotazioneNumero.consentiRilascio();
        setError(json.error ?? "Emissione non riuscita.");
        return;
      }
      if (prenotazioneNumero.pren) {
        prenotazioneNumero.applica({
          ...prenotazioneNumero.pren,
          stato: "emessa",
          incerto: false,
          numeroFattura: json.numeroFattura || prenotazioneNumero.pren.numeroFattura,
        });
      }
      setSuccess({
        fatturaId: json.fatturaId!,
        numeroFattura: json.numeroFattura!,
        pdfUrl: json.pdfUrl ?? "",
        eiStatus: json.eiStatus ?? "",
      });
      setRighe([emptyEmissioneRiga({ ivaPercentuale: 22 })]);
      setIncludeSpedizione(false);
      setSpedizione(emptySpedizioneRiga(0, false, 22));
      setNoteDocumento("");
    } catch (err) {
      prenotazioneNumero.consentiRilascio();
      setError(err instanceof Error ? err.message : "Errore di rete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => vaiA("bozza-fattura")}
        className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
      >
        Visualizza bozza
      </button>
      <p className="text-sm text-[var(--muted)]">
        Il foglio è la fattura. Ogni modifica del form lo aggiorna, e ogni
        matita del foglio riapre il campo nel form.
      </p>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_210mm]">
    <form onSubmit={onSubmit} className="order-2 space-y-6 xl:order-1">
      <p className="text-sm text-[var(--muted)]">
        Compila e invia la fattura elettronica a Fatture in Cloud / SDI. Il
        numero fattura, fino al 31/12/2026, è{" "}
        <span className="font-mono">NN/ANNO</span> (es.{" "}
        <span className="font-mono">23/2026</span>). Dal 01/01/2027 diventa{" "}
        <span className="font-mono">27/0001</span>, in base alla data di emissione.
        I codici riga usano la
        targa prodotto interna (es. NCL1).
      </p>

      <section
        id="fattura-cliente"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-cliente"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Cliente
        </h2>
        <ClienteSelectField
          preferenza="fatture"
          value={cliente?.id ?? ""}
          onChange={setCliente}
          required
        />
        {cliente ? (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--muted)]">P. IVA</dt>
              <dd>{cliente.partitaIva || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Codice fiscale</dt>
              <dd>{cliente.codiceFiscale || "—"}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[var(--muted)]">Indirizzo</dt>
              <dd>
                {[
                  cliente.sedeAmministrativa.indirizzo,
                  cliente.sedeAmministrativa.cap,
                  cliente.sedeAmministrativa.citta,
                  cliente.sedeAmministrativa.provincia,
                ]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Codice SDI</dt>
              <dd className="font-mono">{cliente.sdiCode || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">PEC</dt>
              <dd>{cliente.pec || "—"}</dd>
            </div>
          </dl>
        ) : null}
        {prenotazioneNumero.errore ? (
          <p className="text-sm text-red-700">{prenotazioneNumero.errore}</p>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Il numero si assegna solo all&apos;invio allo SDI. Senza SDI non
            parte nemmeno la mail.
          </p>
        )}
      </section>

      <section
        id="fattura-righe"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-righe"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Righe documento
          </h2>
          <button
            type="button"
            onClick={() =>
              setRighe((p) => [
                ...p,
                emptyEmissioneRiga({ ivaPercentuale: aliquote.includes(22) ? 22 : aliquote[0] ?? 0 }),
              ])
            }
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            + Riga
          </button>
        </div>

        <div className="space-y-4">
          {righe.map((r, index) => (
            <div
              key={index}
              id={`fattura-riga-${index}`}
              className={`grid gap-2 rounded-lg border p-3 sm:grid-cols-6 ${
                rigaBozza === index
                  ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
                  : "border-[var(--border)]"
              }`}
            >
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">Prodotto</span>
                <select
                  value={r.prodottoId ?? ""}
                  onChange={(e) => applyProdotto(index, e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">Manuale…</option>
                  {prodotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Codice</span>
                <input
                  value={r.codice}
                  onChange={(e) => updateRiga(index, { codice: e.target.value })}
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Unità</span>
                <input
                  value={r.unitaMisura}
                  onChange={(e) =>
                    updateRiga(index, { unitaMisura: e.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Qtà</span>
                <ClearableNumberInput
                  value={r.quantita}
                  onValueChange={(v) =>
                    updateRiga(index, { quantita: v === "" ? 0 : v })
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Prezzo €</span>
                <ClearableNumberInput
                  value={r.prezzoUnitario}
                  onValueChange={(v) =>
                    updateRiga(index, { prezzoUnitario: v === "" ? 0 : v })
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <FatturaEmissioneScontiProdotto
                prodottoId={r.prodottoId}
                prodottoCodice={r.codice}
                clienteId={cliente?.id ?? null}
                quantita={r.quantita}
                prezzoUnitario={r.prezzoUnitario}
                scontoListinoPct={r.scontoListinoPct}
                scontoExtraPct={r.scontoExtraPct}
                onPrezzo={(prezzo, iva, unita) =>
                  updateRiga(index, {
                    prezzoUnitario: prezzo,
                    ...(unita ? { unitaMisura: unita } : {}),
                    ...(iva != null && aliquote.includes(iva)
                      ? { ivaPercentuale: iva }
                      : {}),
                  })
                }
                onScontoListino={(pct) =>
                  updateRiga(index, {
                    scontoListinoPct: pct,
                    scontoPercentuale: 0,
                  })
                }
                onScontoExtra={(pct) =>
                  updateRiga(index, {
                    scontoExtraPct: pct,
                    scontoPercentuale: 0,
                  })
                }
              />
              <label className="block text-sm sm:col-span-3">
                <span className="mb-1 block text-xs font-medium">
                  Descrizione
                </span>
                <input
                  value={r.descrizione}
                  onChange={(e) =>
                    updateRiga(index, { descrizione: e.target.value })
                  }
                  required
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                  Note (meno evidenziate)
                </span>
                <input
                  value={r.note}
                  onChange={(e) => updateRiga(index, { note: e.target.value })}
                  className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-2 py-1.5 text-sm text-slate-500"
                  placeholder="Opzionale — sotto la descrizione in fattura"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">IVA %</span>
                <select
                  value={r.ivaPercentuale}
                  onChange={(e) =>
                    updateRiga(index, {
                      ivaPercentuale: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                >
                  {aliquote.map((a) => (
                    <option key={a} value={a}>
                      {a}%
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-between gap-2 sm:col-span-6">
                <p className="text-sm tabular-nums text-slate-700">
                  Importo:{" "}
                  {formatEuro(importoEmissioneRiga(r))}
                </p>
                {righe.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setRighe((prev) => prev.filter((_, i) => i !== index))
                    }
                    className="text-xs font-medium text-rose-700 hover:underline"
                  >
                    Rimuovi
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div
          id="fattura-spedizione"
          className="rounded-lg border border-dashed border-[var(--border)] p-3"
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={includeSpedizione}
              onChange={(e) => setIncludeSpedizione(e.target.checked)}
            />
            Aggiungi riga Spedizione (come prodotto, codice SPED)
          </label>
          {includeSpedizione ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-4">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-xs font-medium">
                  Importo spedizione €
                </span>
                <ClearableNumberInput
                  value={spedizione.prezzoUnitario}
                  onValueChange={(v) =>
                    setSpedizione((s) => ({
                      ...s,
                      prezzoUnitario: v === "" ? 0 : v,
                    }))
                  }
                  min={0}
                  step={0.01}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={spedizione.ivaPercentuale > 0}
                  onChange={(e) =>
                    setSpedizione((s) => ({
                      ...s,
                      ivaPercentuale: e.target.checked
                        ? aliquote.includes(22)
                          ? 22
                          : aliquote[0] ?? 0
                        : 0,
                    }))
                  }
                />
                Calcola IVA sulla spedizione
              </label>
              {spedizione.ivaPercentuale > 0 ? (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium">IVA %</span>
                  <select
                    value={spedizione.ivaPercentuale}
                    onChange={(e) =>
                      setSpedizione((s) => ({
                        ...s,
                        ivaPercentuale: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                  >
                    {aliquote
                      .filter((a) => a > 0)
                      .map((a) => (
                        <option key={a} value={a}>
                          {a}%
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="fattura-pagamento"
        className={`space-y-3 rounded-xl border bg-[var(--card)] p-4 ${
          sezione === "fattura-pagamento"
            ? "border-[var(--primary)] ring-2 ring-[var(--primary)]"
            : "border-[var(--border)]"
        }`}
      >
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Condizioni di pagamento
        </h2>
        <OrdinePagamentoPianoFields
          piano={piano}
          onChange={setPiano}
          totale={totals.totale}
        />
        <div className="grid gap-3 sm:grid-cols-[1fr_16rem]">
          <dl className="space-y-1 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">Banca</dt>
              <dd>{AGRINSICILIA_COORDINATE.banca}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">IBAN</dt>
              <dd className="font-mono">
                {formatIbanDisplay(AGRINSICILIA_COORDINATE.iban)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[var(--muted)]">BIC</dt>
              <dd className="font-mono">{AGRINSICILIA_COORDINATE.bic}</dd>
            </div>
            <p className="pt-1 text-xs text-[var(--muted)]">
              Coordinate già salvate: in fattura il pagamento è il bonifico,
              con queste coordinate. La scadenza segue la condizione scelta.
            </p>
          </dl>
          <div id="fattura-data" className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Data documento</span>
              <input
                type="date"
                value={dataDocumento}
                onChange={(e) => setDataDocumento(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Data consegna</span>
              <input
                type="date"
                value={dataConsegna}
                onChange={(e) => setDataConsegna(e.target.value)}
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          </div>
        </div>
        <label id="fattura-note" className="block text-sm">
          <span className="mb-1 block font-medium">Note documento</span>
          <textarea
            value={noteDocumento}
            onChange={(e) => setNoteDocumento(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToSdi}
              onChange={(e) => {
                setSendToSdi(e.target.checked);
                if (!e.target.checked) setSendCourtesyEmail(false);
              }}
            />
            Invia allo SDI
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToSdi && sendCourtesyEmail}
              disabled={!sendToSdi}
              onChange={(e) => setSendCourtesyEmail(e.target.checked)}
            />
            Mail di cortesia al cliente, solo se lo SDI parte
          </label>
          <label className="inline-flex items-center gap-2 text-[var(--muted)]">
            <input
              type="checkbox"
              checked={dryRunSdi}
              onChange={(e) => setDryRunSdi(e.target.checked)}
              disabled={!sendToSdi}
            />
            Dry-run SDI (test)
          </label>
        </div>
      </section>

      <section className="flex flex-wrap items-end justify-between gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
            Totale documento
          </p>
          <p className="text-2xl font-semibold tabular-nums">
            {formatEuro(totals.totale)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            Imponibile {formatEuro(totals.imponibile)} · IVA{" "}
            {formatEuro(totals.imposta)}
          </p>
        </div>
        <button
          type="submit"
          disabled={busy || !cliente}
          className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? "Emissione in corso…" : "Crea e invia fattura"}
        </button>
      </section>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">
            Fattura {success.numeroFattura} emessa correttamente.
          </p>
          <p className="mt-1 text-xs">Stato SDI/FiC: {success.eiStatus || "—"}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link
              href={`/app/amministrazione/fatture/emesse/${success.fatturaId}`}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Apri in storico
            </Link>
            {success.pdfUrl ? (
              <a
                href={success.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--primary)] hover:underline"
              >
                Apri PDF FiC
              </a>
            ) : null}
          </div>
        </div>
      ) : null}
    </form>
    <div className="order-1 xl:sticky xl:top-4 xl:order-2">
      <FatturaEmissioneDocumento
        numero={numeroBozza}
        dataDocumento={dataDocumento}
        dataConsegna={dataConsegna}
        commerciale={commerciale}
        cliente={cliente}
        noteDocumento={noteDocumento}
        piano={applyTotaleToPiano(piano, totals.totale)}
        righe={righeBozza}
        imponibile={totals.imponibile}
        imposta={totals.imposta}
        totale={totals.totale}
        onDataDocumento={setDataDocumento}
        onDataConsegna={setDataConsegna}
        onNoteDocumento={setNoteDocumento}
        onVaiA={vaiA}
      />
    </div>
    </div>
    </>
  );
}
