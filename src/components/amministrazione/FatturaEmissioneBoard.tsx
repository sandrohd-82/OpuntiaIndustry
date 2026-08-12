"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  getAliquoteEmissioneAction,
  previewNumeroEmissioneAction,
} from "@/app/actions/fattura-emissione";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  calcolaTotaliEmissione,
  emptyEmissioneRiga,
  emptySpedizioneRiga,
  PAYMENT_METHODS,
  type EmissioneRigaInput,
  type PaymentMethodCode,
} from "@/lib/amministrazione/fattura-emissione";
import {
  formatEuro,
  importoRiga,
  todayIsoDate,
} from "@/lib/amministrazione/fatture";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function FatturaEmissioneBoard() {
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [prodotti, setProdotti] = useState<ProdottoProprio[]>([]);
  const [aliquote, setAliquote] = useState<number[]>([0, 4, 10, 22]);
  const [dataDocumento, setDataDocumento] = useState(todayIsoDate);
  const [dataScadenza, setDataScadenza] = useState(() =>
    addDaysIso(todayIsoDate(), 30)
  );
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethodCode>("MP05");
  const [iban, setIban] = useState("");
  const [sendToSdi, setSendToSdi] = useState(true);
  const [sendCourtesyEmail, setSendCourtesyEmail] = useState(true);
  const [dryRunSdi, setDryRunSdi] = useState(false);
  const [noteDocumento, setNoteDocumento] = useState("");
  const [righe, setRighe] = useState<EmissioneRigaInput[]>([
    emptyEmissioneRiga({ ivaPercentuale: 22 }),
  ]);
  const [spedizione, setSpedizione] = useState(emptySpedizioneRiga(0, false, 22));
  const [includeSpedizione, setIncludeSpedizione] = useState(false);
  const [numeroInterno, setNumeroInterno] = useState("");
  const [numeroFattura, setNumeroFattura] = useState("");
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
  }, []);

  useEffect(() => {
    if (!cliente) {
      setNumeroInterno("");
      setNumeroFattura("");
      return;
    }
    let cancelled = false;
    void previewNumeroEmissioneAction({
      clienteId: cliente.id,
      codiceTarga: cliente.codiceTarga,
      dataDocumento,
    }).then((r) => {
      if (cancelled) return;
      if (r.success) {
        setNumeroInterno(r.numeroInterno);
        setNumeroFattura(r.numeroFattura);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [cliente, dataDocumento]);

  const righeCalcolo = useMemo(() => {
    const list = righe.map((r) => ({
      ...r,
      importo: importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale),
    }));
    if (includeSpedizione && spedizione.prezzoUnitario > 0) {
      list.push({
        ...spedizione,
        importo: importoRiga(
          spedizione.quantita,
          spedizione.prezzoUnitario,
          0
        ),
      });
    }
    return list;
  }, [righe, includeSpedizione, spedizione]);

  const totals = useMemo(
    () => calcolaTotaliEmissione(righeCalcolo),
    [righeCalcolo]
  );

  function updateRiga(index: number, patch: Partial<EmissioneRigaInput>) {
    setRighe((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  }

  function applyProdotto(index: number, prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    if (!p) {
      updateRiga(index, { prodottoId: null });
      return;
    }
    updateRiga(index, {
      prodottoId: p.id,
      codice: p.codice,
      descrizione: p.nome,
      note: p.note ?? "",
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
      dataScadenza,
      paymentMethod,
      iban,
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
    try {
      const res = await fetch("/api/invoices/create-and-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        setError(json.error ?? "Emissione non riuscita.");
        return;
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
      setError(err instanceof Error ? err.message : "Errore di rete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <p className="text-sm text-[var(--muted)]">
        Compila e invia la fattura elettronica a Fatture in Cloud / SDI. Il
        numero fattura è il gestionale senza prefisso{" "}
        <span className="font-mono">Ft-</span> (es.{" "}
        <span className="font-mono">26-C005/1</span>). I codici riga usano la
        targa prodotto interna (es. NCL1).
      </p>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Cliente
        </h2>
        <ClienteSelectField
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
        {numeroFattura ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            Numero fattura:{" "}
            <strong className="font-mono text-base">{numeroFattura}</strong>
            <span className="ml-2 text-xs text-[var(--muted)]">
              (interno {numeroInterno})
            </span>
          </p>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
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
              className="grid gap-2 rounded-lg border border-[var(--border)] p-3 sm:grid-cols-6"
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
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium">Sconto %</span>
                <ClearableNumberInput
                  value={r.scontoPercentuale}
                  onValueChange={(v) =>
                    updateRiga(index, { scontoPercentuale: v === "" ? 0 : v })
                  }
                  min={0}
                  max={100}
                  step={0.1}
                  emptyAsZeroOnBlur
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
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
                  {formatEuro(
                    importoRiga(r.quantita, r.prezzoUnitario, r.scontoPercentuale)
                  )}
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

        <div className="rounded-lg border border-dashed border-[var(--border)] p-3">
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

      <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Condizioni di pagamento
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Metodo</span>
            <select
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(e.target.value as PaymentMethodCode)
              }
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium">IBAN</span>
            <input
              value={iban}
              onChange={(e) => setIban(e.target.value)}
              required={paymentMethod === "MP05"}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm uppercase"
              placeholder="IT60X0542811101000000123456"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data documento</span>
            <input
              type="date"
              value={dataDocumento}
              onChange={(e) => {
                setDataDocumento(e.target.value);
                setDataScadenza(addDaysIso(e.target.value, 30));
              }}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data scadenza</span>
            <input
              type="date"
              value={dataScadenza}
              onChange={(e) => setDataScadenza(e.target.value)}
              required
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="block text-sm">
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
              onChange={(e) => setSendToSdi(e.target.checked)}
            />
            Invia allo SDI
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendCourtesyEmail}
              onChange={(e) => setSendCourtesyEmail(e.target.checked)}
            />
            Mail di cortesia al cliente
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
  );
}
