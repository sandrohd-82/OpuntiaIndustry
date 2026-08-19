"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  FaFileInvoice,
  FaCircleInfo,
  FaScaleBalanced,
  FaPrint,
  FaArrowsRotate,
} from "react-icons/fa6";
import {
  listBankTransactionsAction,
  syncBankReportsAction,
  verifyBankMatchAction,
  type BankTransactionView,
} from "@/app/actions/bank-reports";
import { formatEuro, formatDateIt } from "@/lib/amministrazione/fatture";

type PeriodPreset = "mese" | "trimestre" | "personalizzato";
type TipoFilter = "tutti" | "entrate" | "uscite" | "non_riconciliati";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function startOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1);
}
function endOfQuarter(d: Date) {
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q + 3, 0);
}
function toIsoDate(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function RapportiBancaBoard() {
  const now = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<PeriodPreset>("mese");
  const [dateFrom, setDateFrom] = useState(toIsoDate(startOfMonth(now)));
  const [dateTo, setDateTo] = useState(toIsoDate(endOfMonth(now)));
  const [tipo, setTipo] = useState<TipoFilter>("tutti");
  const [items, setItems] = useState<BankTransactionView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<BankTransactionView | null>(null);
  const [compare, setCompare] = useState<BankTransactionView | null>(null);
  const [printUser] = useState("Operatore area fiscale");

  useEffect(() => {
    if (preset === "mese") {
      setDateFrom(toIsoDate(startOfMonth(now)));
      setDateTo(toIsoDate(endOfMonth(now)));
    } else if (preset === "trimestre") {
      setDateFrom(toIsoDate(startOfQuarter(now)));
      setDateTo(toIsoDate(endOfQuarter(now)));
    }
  }, [preset, now]);

  const load = useCallback(async () => {
    setError(null);
    const res = await listBankTransactionsAction({
      dateFrom,
      dateTo,
      tipo,
    });
    if (!res.success) {
      setError(res.error);
      setItems([]);
      return;
    }
    setItems(res.items);
  }, [dateFrom, dateTo, tipo]);

  useEffect(() => {
    void load();
  }, [load]);

  function sync() {
    setInfo(null);
    startTransition(async () => {
      const res = await syncBankReportsAction({ dateFrom, dateTo });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo(
        `Sincronizzati ${res.fetched} movimenti (${res.accountName}). Nuovi: ${res.upserted}, match: ${res.matched}, fatture → paid: ${res.invoicesMarkedPaid}.`
      );
      await load();
    });
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="bank-report-root space-y-4">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Movimenti da Fatture in Cloud (cashbook / TS Pay → BCC Don Rizzo),
          riconciliazione con fatture locali e stampa report ISO 9001.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={sync}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <FaArrowsRotate size={13} />
            Sincronizza da Fatture in Cloud
          </button>
          <button
            type="button"
            onClick={printReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium"
          >
            <FaPrint size={13} />
            Stampa / Esporta Report PDF
          </button>
        </div>
      </div>

      <div className="print:hidden flex flex-wrap gap-2">
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as PeriodPreset)}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="mese">Mese corrente</option>
          <option value="trimestre">Trimestre</option>
          <option value="personalizzato">Personalizzato</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          disabled={preset !== "personalizzato"}
          onChange={(e) => setDateFrom(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
        />
        <input
          type="date"
          value={dateTo}
          disabled={preset !== "personalizzato"}
          onChange={(e) => setDateTo(e.target.value)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:opacity-60"
        />
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoFilter)}
          className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        >
          <option value="tutti">Tutti</option>
          <option value="entrate">Solo entrate</option>
          <option value="uscite">Solo uscite</option>
          <option value="non_riconciliati">Non riconciliati</option>
        </select>
      </div>

      {error ? (
        <p className="print:hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="print:hidden rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}

      <header className="bank-report-print-header hidden print:block">
        <p className="text-lg font-semibold">
          Cooperativa Agricola e Sociale A.R.L.
        </p>
        <p className="text-sm">Rapporto Banca — BCC Don Rizzo / TS Pay</p>
        <p className="text-xs">
          Periodo {formatDateIt(dateFrom)} – {formatDateIt(dateTo)}
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="bank-report-table w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Data &amp; conto</th>
              <th className="px-3 py-2 text-right">Importo</th>
              <th className="px-3 py-2">Causale / Controparte</th>
              <th className="px-3 py-2">Fattura collegata</th>
              <th className="print:hidden px-3 py-2">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Nessun movimento. Sincronizza da Fatture in Cloud.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium tabular-nums">
                      {formatDateIt(row.transactionDate)}
                    </p>
                    <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      {row.accountName}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right align-top font-semibold tabular-nums ${
                      row.amount >= 0 ? "text-emerald-700" : "text-red-700"
                    }`}
                  >
                    {row.amount >= 0 ? "+" : ""}
                    {formatEuro(row.amount)}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium text-slate-900">
                      {row.counterpartyName || "—"}
                    </p>
                    <p className="line-clamp-2 text-xs text-[var(--muted)]">
                      {row.description || "—"}
                    </p>
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.match ? (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          row.match.status === "discrepancy"
                            ? "bg-amber-100 text-amber-900"
                            : row.match.status === "manually_verified"
                              ? "bg-sky-100 text-sky-900"
                              : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        Fatt. N° {row.match.invoiceNumber || "—"} ·{" "}
                        {row.match.matchScore}%
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        Da riconciliare
                      </span>
                    )}
                  </td>
                  <td className="print:hidden px-3 py-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {row.match ? (
                        <a
                          href={`/app/amministrazione/documenti-fic/${row.match.invoiceType === "received" ? "received" : "issued"}/${row.match.ficId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-slate-50"
                          title="Apri fattura"
                        >
                          <FaFileInvoice size={11} />
                          Apri
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setDetail(row)}
                        className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-slate-50"
                        title="Dettaglio transazione"
                      >
                        <FaCircleInfo size={11} />
                        Info
                      </button>
                      {row.match ? (
                        <button
                          type="button"
                          onClick={() => setCompare(row)}
                          className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-slate-50"
                          title="Compara dati"
                        >
                          <FaScaleBalanced size={11} />
                          Compara
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <footer className="bank-report-print-footer hidden print:block text-xs text-slate-600">
        Stampato il {new Date().toLocaleString("it-IT")} · Utente: {printUser} ·
        Conformità ISO 9001 (tracciabilità report)
      </footer>

      {detail ? (
        <Modal title="Dettaglio transazione TS Pay" onClose={() => setDetail(null)}>
          <dl className="space-y-2 text-sm">
            <Row label="ID FiC" value={detail.ficPaymentId} />
            <Row label="Conto" value={detail.accountName} />
            <Row label="Data" value={formatDateIt(detail.transactionDate)} />
            <Row
              label="Data valuta"
              value={
                detail.valutaDate ? formatDateIt(detail.valutaDate) : "—"
              }
            />
            <Row label="Importo" value={formatEuro(detail.amount)} />
            <Row label="Controparte" value={detail.counterpartyName || "—"} />
            <Row label="Causale" value={detail.description || "—"} />
            <Row
              label="Raw (estratto)"
              value={JSON.stringify(detail.rawData, null, 2).slice(0, 1200)}
            />
          </dl>
        </Modal>
      ) : null}

      {compare && compare.match ? (
        <Modal title="Compara banca ↔ fattura" onClose={() => setCompare(null)}>
          {Math.abs(
            Math.abs(compare.amount) - Math.abs(compare.match.invoiceGross)
          ) > 0.01 ? (
            <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Attenzione: importo banca e totale fattura non coincidono al
              centesimo (possibili commissioni o acconti).
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <h4 className="text-xs font-semibold uppercase text-[var(--muted)]">
                Transazione bancaria
              </h4>
              <dl className="mt-2 space-y-1.5 text-sm">
                <Row label="Importo" value={formatEuro(compare.amount)} />
                <Row
                  label="Data"
                  value={formatDateIt(compare.transactionDate)}
                />
                <Row label="Causale" value={compare.description || "—"} />
                <Row
                  label="Mittente/Dest."
                  value={compare.counterpartyName || "—"}
                />
              </dl>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <h4 className="text-xs font-semibold uppercase text-[var(--muted)]">
                Fattura
              </h4>
              <dl className="mt-2 space-y-1.5 text-sm">
                <Row
                  label="Numero"
                  value={compare.match.invoiceNumber || "—"}
                />
                <Row
                  label="Totale lordo"
                  value={formatEuro(compare.match.invoiceGross)}
                />
                <Row
                  label="Data"
                  value={
                    compare.match.invoiceDate
                      ? formatDateIt(compare.match.invoiceDate)
                      : "—"
                  }
                />
                <Row
                  label="Anagrafica"
                  value={compare.match.invoiceEntityName || "—"}
                />
                <Row
                  label="P.IVA/CF"
                  value={compare.match.invoiceEntityVat || "—"}
                />
              </dl>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await verifyBankMatchAction({
                    matchId: compare.match!.id,
                    status: "manually_verified",
                  });
                  if (!res.success) setError(res.error);
                  else {
                    setInfo("Match verificato manualmente (audit registrato).");
                    setCompare(null);
                    await load();
                  }
                })
              }
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
            >
              Conferma riconciliazione
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await verifyBankMatchAction({
                    matchId: compare.match!.id,
                    status: "discrepancy",
                  });
                  if (!res.success) setError(res.error);
                  else {
                    setInfo("Segnata discrepanza (audit registrato).");
                    setCompare(null);
                    await load();
                  }
                })
              }
              className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-950"
            >
              Segna discrepanza
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-[var(--muted)]">{label}</dt>
      <dd className="whitespace-pre-wrap break-words text-slate-900">{value}</dd>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="print:hidden fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--border)] px-2 py-1 text-xs"
          >
            Chiudi
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
