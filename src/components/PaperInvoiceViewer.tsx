"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FaPrint } from "react-icons/fa6";
import { getPaperInvoiceForRicevutaAction } from "@/app/actions/paper-invoice";
import type { Fattura } from "@/lib/amministrazione/fatture";
import {
  formatEuro,
  formatPaperDate,
  prezzoScontatoUnitario,
  type PaperInvoiceModel,
  type PaperInvoiceRawSource,
  type PaperParty,
} from "@/lib/amministrazione/paper-invoice";

type ViewMode = "foglio" | "grezzo";

type Props = {
  fattura: Fattura;
};

function PartyBlock({
  title,
  party,
}: {
  title: string;
  party: PaperParty;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </p>
      <p className="mt-1 text-sm font-semibold text-slate-900">
        {party.ragioneSociale || "—"}
      </p>
      {party.partitaIva ? (
        <p className="text-xs text-slate-700">P.IVA {party.partitaIva}</p>
      ) : null}
      {party.codiceFiscale ? (
        <p className="text-xs text-slate-700">CF {party.codiceFiscale}</p>
      ) : null}
      {party.indirizzo ? (
        <p className="mt-1 text-xs text-slate-600">{party.indirizzo}</p>
      ) : null}
      {party.pec ? (
        <p className="text-xs text-slate-600">PEC {party.pec}</p>
      ) : null}
      {party.email && !party.pec ? (
        <p className="text-xs text-slate-600">Email {party.email}</p>
      ) : null}
      {party.telefono ? (
        <p className="text-xs text-slate-600">Tel. {party.telefono}</p>
      ) : null}
    </div>
  );
}

function PaperSheet({ model }: { model: PaperInvoiceModel }) {
  return (
    <article
      id="paper-invoice-sheet"
      className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-200"
    >
      <div className="box-border min-h-[297mm] px-[14mm] py-[12mm]">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-300 pb-4">
          <div className="min-w-[14rem] flex-1">
            <PartyBlock title="Fornitore / Mittente" party={model.mittente} />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Fattura
            </p>
            <p className="mt-1 font-mono text-lg font-semibold">
              {model.numero}
            </p>
            <p className="mt-1 text-sm text-slate-700">
              Data {formatPaperDate(model.data)}
            </p>
            {model.fonte === "opuntia" ? (
              <p className="mt-2 text-[10px] uppercase tracking-wide text-amber-700">
                Anteprima da registrazione Opuntia
              </p>
            ) : null}
          </div>
        </header>

        <section className="mt-4 rounded border border-slate-300 bg-slate-50 px-3 py-3">
          <PartyBlock title="Destinatario" party={model.destinatario} />
        </section>

        <section className="mt-5 overflow-hidden rounded border border-slate-300">
          <table className="w-full border-collapse text-left text-[11px]">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-2 py-2 font-medium">Descrizione</th>
                <th className="px-2 py-2 font-medium">Qtà</th>
                <th className="px-2 py-2 font-medium">Um</th>
                <th className="px-2 py-2 font-medium">Prezzo</th>
                <th className="px-2 py-2 font-medium">Sconto</th>
                <th className="px-2 py-2 font-medium">% IVA</th>
                <th className="px-2 py-2 font-medium text-right">Importo</th>
              </tr>
            </thead>
            <tbody>
              {model.righe.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-2 py-6 text-center text-slate-500"
                  >
                    Nessuna riga nel documento.
                  </td>
                </tr>
              ) : (
                model.righe.map((r, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="px-2 py-1.5 align-top">{r.descrizione}</td>
                    <td className="px-2 py-1.5 tabular-nums">{r.quantita}</td>
                    <td className="px-2 py-1.5">{r.unitaMisura}</td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {r.scontoPercentuale > 0 ? (
                        <span>
                          <span className="text-slate-400 line-through">
                            {formatEuro(r.prezzo)}
                          </span>{" "}
                          {formatEuro(
                            prezzoScontatoUnitario(r.prezzo, r.scontoPercentuale)
                          )}
                        </span>
                      ) : (
                        formatEuro(r.prezzo)
                      )}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {r.scontoPercentuale > 0
                        ? `${r.scontoPercentuale} %`
                        : "—"}
                    </td>
                    <td className="px-2 py-1.5 tabular-nums">
                      {r.ivaPercentuale} %
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                      {formatEuro(r.importo)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="overflow-hidden rounded border border-slate-300">
            <p className="border-b border-slate-300 bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Castelletto IVA
              {model.scissionePagamenti ? " · Scissione pagamenti" : ""}
            </p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="px-2 py-1.5 font-medium">Aliquota</th>
                  <th className="px-2 py-1.5 font-medium">Imponibile</th>
                  <th className="px-2 py-1.5 font-medium text-right">Imposta</th>
                </tr>
              </thead>
              <tbody>
                {model.castelletto.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-2 py-3 text-center text-slate-500"
                    >
                      Nessuna aliquota
                    </td>
                  </tr>
                ) : (
                  model.castelletto.map((c, i) => (
                    <tr key={i} className="border-t border-slate-200">
                      <td className="px-2 py-1.5">
                        {c.aliquota} %
                        {c.natura ? (
                          <span className="ml-1 text-[10px] text-slate-500">
                            ({c.natura})
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 tabular-nums">
                        {formatEuro(c.imponibile)}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {formatEuro(c.imposta)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-slate-300 bg-slate-50 px-3 py-3 text-[12px]">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
              Totali & pagamenti
            </p>
            <dl className="mt-2 space-y-1.5">
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Totale imponibile</dt>
                <dd className="tabular-nums font-medium">
                  {formatEuro(model.imponibile)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-slate-600">Totale IVA</dt>
                <dd className="tabular-nums font-medium">
                  {formatEuro(model.iva)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-slate-300 pt-1.5 text-sm">
                <dt className="font-semibold">Totale documento</dt>
                <dd className="tabular-nums font-semibold">
                  {formatEuro(model.totale)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 pt-1">
                <dt className="text-slate-600">Scadenza</dt>
                <dd className="tabular-nums">
                  {formatPaperDate(model.dataScadenza)}
                </dd>
              </div>
              <div className="pt-1">
                <dt className="text-slate-600">IBAN accredito</dt>
                <dd className="mt-0.5 break-all font-mono text-[11px]">
                  {model.iban || "—"}
                </dd>
              </div>
              {model.notePagamento ? (
                <p className="pt-1 text-[11px] text-slate-600">
                  {model.notePagamento}
                </p>
              ) : null}
            </dl>
          </div>
        </section>
      </div>
    </article>
  );
}

function RawPanel({ raw }: { raw: PaperInvoiceRawSource }) {
  const [tab, setTab] = useState<"json" | "xml">(
    raw.xml ? "xml" : "json"
  );
  const jsonText = useMemo(
    () =>
      raw.json
        ? JSON.stringify(raw.json, null, 2)
        : "Nessun JSON disponibile.",
    [raw.json]
  );

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex gap-2 border-b border-[var(--border)] px-3 py-2">
        <button
          type="button"
          onClick={() => setTab("json")}
          className={`rounded px-2 py-1 text-xs font-medium ${
            tab === "json"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          JSON
        </button>
        <button
          type="button"
          onClick={() => setTab("xml")}
          className={`rounded px-2 py-1 text-xs font-medium ${
            tab === "xml"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          XML
        </button>
      </div>
      <pre className="max-h-[70vh] overflow-auto p-4 text-[11px] leading-relaxed text-slate-800">
        {tab === "xml"
          ? raw.xml ||
            "XML elettronico non presente nel payload FiC salvato (solo JSON)."
          : jsonText}
      </pre>
    </div>
  );
}

export function PaperInvoiceViewer({ fattura }: Props) {
  const titleId = useId();
  const [mode, setMode] = useState<ViewMode>("foglio");
  const [model, setModel] = useState<PaperInvoiceModel | null>(null);
  const [raw, setRaw] = useState<PaperInvoiceRawSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getPaperInvoiceForRicevutaAction({
      ficId: fattura.ficId,
      fattura,
    });
    if (!res.success) {
      setError(res.error);
      setModel(null);
      setRaw(null);
      setLoading(false);
      return;
    }
    setModel(res.data.model);
    setRaw(res.data.raw);
    setLoading(false);
  }, [fattura]);

  useEffect(() => {
    void load();
  }, [load]);

  function handlePrint() {
    printRef.current = true;
    setMode("foglio");
    window.setTimeout(() => {
      window.print();
      printRef.current = false;
    }, 50);
  }

  return (
    <section
      className="paper-invoice-viewer space-y-3"
      aria-labelledby={titleId}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h3 id={titleId} className="text-sm font-semibold text-slate-900">
            Visualizzazione foglio fattura
          </h3>
          <p className="text-xs text-[var(--muted)]">
            Layout A4 leggibile per operatori · grezzo JSON/XML per audit ISO
            9001
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-0.5">
            <button
              type="button"
              onClick={() => setMode("foglio")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                mode === "foglio"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Foglio
            </button>
            <button
              type="button"
              onClick={() => setMode("grezzo")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                mode === "grezzo"
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              Grezzo
            </button>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            disabled={!model || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            <FaPrint size={12} />
            Stampa / Salva PDF
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 print:hidden">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--muted)] print:hidden">
          Preparazione foglio…
        </p>
      ) : null}

      {!loading && model && mode === "foglio" ? (
        <div className="overflow-x-auto rounded-xl bg-slate-200/70 p-4 sm:p-6 print:bg-transparent print:p-0">
          <PaperSheet model={model} />
        </div>
      ) : null}

      {!loading && raw && mode === "grezzo" ? (
        <div className="print:hidden">
          <RawPanel raw={raw} />
        </div>
      ) : null}

      {/* Sempre in DOM per stampa anche se si è sul tab grezzo */}
      {!loading && model && mode === "grezzo" ? (
        <div className="hidden print:block">
          <PaperSheet model={model} />
        </div>
      ) : null}
    </section>
  );
}
