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
  importBankStatementPdfAction,
  purgeBankImportedDataAction,
  setBankTransactionSignAction,
  flipBankTransactionSignAction,
  verifyBankMatchAction,
  type BankTransactionView,
  type BankPeriodSummary,
} from "@/app/actions/bank-reports";
import { formatEuro, formatDateIt } from "@/lib/amministrazione/fatture";

type PeriodPreset = "mese" | "trimestre" | "personalizzato";
type TipoFilter =
  | "tutti"
  | "entrate"
  | "uscite"
  | "non_riconciliati"
  | "da_confermare";

const EMPTY_SUMMARY: BankPeriodSummary = {
  entrateCount: 0,
  entrateTotal: 0,
  usciteCount: 0,
  usciteTotal: 0,
  dubbieCount: 0,
  dubbieTotal: 0,
  vociCount: 0,
  dateFirst: null,
  dateLast: null,
};

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
function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function quarterLabel(isoFrom: string) {
  const d = parseIsoDate(isoFrom);
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `T${q} ${d.getFullYear()}`;
}
function monthLabel(isoFrom: string) {
  const d = parseIsoDate(isoFrom);
  return d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
}

export function RapportiBancaBoard() {
  const [preset, setPreset] = useState<PeriodPreset>("mese");
  const [anchor, setAnchor] = useState(() => new Date());
  const [dateFrom, setDateFrom] = useState(() =>
    toIsoDate(startOfMonth(new Date()))
  );
  const [dateTo, setDateTo] = useState(() =>
    toIsoDate(endOfMonth(new Date()))
  );
  const [tipo, setTipo] = useState<TipoFilter>("tutti");
  const [items, setItems] = useState<BankTransactionView[]>([]);
  const [summary, setSummary] = useState<BankPeriodSummary>(EMPTY_SUMMARY);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [detail, setDetail] = useState<BankTransactionView | null>(null);
  const [compare, setCompare] = useState<BankTransactionView | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("BCC Don Rizzo");
  const [printUser] = useState("Operatore area fiscale");

  useEffect(() => {
    if (preset === "mese") {
      setDateFrom(toIsoDate(startOfMonth(anchor)));
      setDateTo(toIsoDate(endOfMonth(anchor)));
    } else if (preset === "trimestre") {
      setDateFrom(toIsoDate(startOfQuarter(anchor)));
      setDateTo(toIsoDate(endOfQuarter(anchor)));
    }
  }, [preset, anchor]);

  const periodCaption = useMemo(() => {
    if (preset === "mese") return monthLabel(dateFrom);
    if (preset === "trimestre") return quarterLabel(dateFrom);
    return `${formatDateIt(dateFrom)} – ${formatDateIt(dateTo)}`;
  }, [preset, dateFrom, dateTo]);

  function shiftPeriod(delta: number) {
    const mode = preset === "trimestre" ? "trimestre" : "mese";
    if (preset === "personalizzato") setPreset("mese");
    setAnchor((prev) => {
      const d = new Date(prev);
      if (mode === "trimestre") d.setMonth(d.getMonth() + delta * 3);
      else d.setMonth(d.getMonth() + delta);
      return d;
    });
  }

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
      setSummary(EMPTY_SUMMARY);
      return;
    }
    setItems(res.items);
    setSummary(res.summary ?? EMPTY_SUMMARY);
  }, [dateFrom, dateTo, tipo]);

  useEffect(() => {
    void load();
  }, [load]);

  function openSyncModal() {
    setError(null);
    setInfo(null);
    setPdfFile(null);
    setImportOpen(true);
  }

  function runPdfImport() {
    if (!pdfFile) {
      setError("Seleziona un file CSV di estratto conto.");
      return;
    }
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", pdfFile);
      fd.set("accountName", accountName);
      const res = await importBankStatementPdfAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setImportOpen(false);
      setPdfFile(null);

      // Date sempre dal CSV: allinea il filtro tabella al periodo dell'estratto
      const nextFrom = res.dateFrom ?? dateFrom;
      const nextTo = res.dateTo ?? dateTo;
      if (res.dateFrom && res.dateTo) {
        setPreset("personalizzato");
        setDateFrom(res.dateFrom);
        setDateTo(res.dateTo);
      }

      const nextTipo: TipoFilter =
        res.rowsDoubtful > 0 ? "da_confermare" : "tutti";
      setTipo(nextTipo);
      setInfo(null);

      const list = await listBankTransactionsAction({
        dateFrom: nextFrom,
        dateTo: nextTo,
        tipo: nextTipo,
      });
      if (!list.success) {
        setError(list.error);
        setItems([]);
        setSummary(EMPTY_SUMMARY);
        return;
      }
      setItems(list.items);
      setSummary(list.summary ?? EMPTY_SUMMARY);
    });
  }

  function printReport() {
    window.print();
  }

  return (
    <div className="bank-report-root space-y-4">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Movimenti da estratto conto CSV: le <strong>date di ogni voce</strong>{" "}
          le prende il sistema dal file (non vanno impostate a mano). Dopo
          l’import il filtro periodo si allinea automaticamente all’estratto.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={openSyncModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <FaArrowsRotate size={13} />
            Sincronizza (carica CSV)
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

      <div className="print:hidden space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
        <p className="text-xs font-medium text-slate-700">
          Periodo attivo: <span className="capitalize">{periodCaption}</span>
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              Tipo periodo
            </span>
            <select
              value={preset}
              onChange={(e) => {
                const v = e.target.value as PeriodPreset;
                setPreset(v);
                if (v !== "personalizzato") setAnchor(new Date());
              }}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="mese">Mese</option>
              <option value="trimestre">Trimestre</option>
              <option value="personalizzato">Personalizzato (date libere)</option>
            </select>
          </label>

          {preset !== "personalizzato" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftPeriod(-1)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                title="Periodo precedente"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => {
                  setAnchor(new Date());
                  setPreset((p) => (p === "personalizzato" ? "mese" : p));
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Oggi
              </button>
              <button
                type="button"
                onClick={() => shiftPeriod(1)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                title="Periodo successivo"
              >
                →
              </button>
            </div>
          ) : null}

          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              Dal
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setPreset("personalizzato");
                setDateFrom(e.target.value);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              Al
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setPreset("personalizzato");
                setDateTo(e.target.value);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          <label className="text-sm">
            <span className="mb-1 block text-[11px] font-medium text-[var(--muted)]">
              Tipo movimento
            </span>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoFilter)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="tutti">Tutti</option>
              <option value="da_confermare">Segno da confermare</option>
              <option value="entrate">Solo entrate</option>
              <option value="uscite">Solo uscite</option>
              <option value="non_riconciliati">Non riconciliati</option>
            </select>
          </label>
        </div>
        <p className="text-[11px] text-[var(--muted)]">
          Il filtro date serve solo a <strong>visualizzare</strong> la tabella.
          All’import CSV il periodo viene impostato da solo in base alle date
          trovate nel file.
        </p>
      </div>

      {importOpen ? (
        <Modal
          title="Sincronizza da estratto conto CSV"
          onClose={() => !pending && setImportOpen(false)}
        >
          <p className="mb-3 text-sm text-[var(--muted)]">
            Elaborazione <strong>locale</strong> (niente OpenAI). File{" "}
            <strong>.csv</strong> / .cvs a 5 colonne fisse, nell’ordine: (1)
            Data, (2) Data Valuta, (3) Uscite −, (4) Entrate +, (5) Causale.
            Ogni riga e ogni campo vengono caricati così come sono.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Soft-delete di TUTTI i movimenti banca e match? (ISO: non cancellazione fisica)"
                  )
                ) {
                  return;
                }
                setError(null);
                setInfo(null);
                startTransition(async () => {
                  const res = await purgeBankImportedDataAction();
                  if (!res.success) {
                    setError(res.error);
                    return;
                  }
                  setInfo(
                    `Pulizia completata: ${res.softDeletedTx} movimenti soft-deleted.`
                  );
                  void load();
                });
              }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              Svuota dati import
            </button>
          </div>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs font-medium">Nome conto</span>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-xs font-medium">File CSV</span>
            <input
              type="file"
              accept=".csv,.cvs,text/csv,text/plain"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm"
            />
            {pdfFile ? (
              <span className="mt-1 block text-xs text-[var(--muted)]">
                {pdfFile.name} · {(pdfFile.size / 1024).toFixed(0)} KB
              </span>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !pdfFile}
              onClick={runPdfImport}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Elaborazione…" : "Carica e processa CSV"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
          </div>
        </Modal>
      ) : null}

      {error ? (
        <p className="print:hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="print:hidden rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {info}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => setTipo("entrate")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            tipo === "entrate"
              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200"
              : "border-emerald-200 bg-emerald-50/60 hover:bg-emerald-50"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
            Entrate +
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-900">
            {summary.entrateCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-emerald-700">
            {formatEuro(summary.entrateTotal)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setTipo("uscite")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            tipo === "uscite"
              ? "border-red-500 bg-red-50 ring-2 ring-red-200"
              : "border-red-200 bg-red-50/60 hover:bg-red-50"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800">
            Uscite −
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-red-900">
            {summary.usciteCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-red-700">
            {formatEuro(summary.usciteTotal)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setTipo("da_confermare")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            tipo === "da_confermare"
              ? "border-sky-500 bg-sky-100 ring-2 ring-sky-300"
              : "border-sky-300 bg-sky-50 hover:bg-sky-100"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-900">
            Dubbie ?
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-950">
            {summary.dubbieCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-sky-800">
            {formatEuro(summary.dubbieTotal)}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setTipo("tutti")}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            tipo === "tutti"
              ? "border-slate-500 bg-slate-100 ring-2 ring-slate-300"
              : "border-slate-200 bg-slate-50 hover:bg-slate-100"
          }`}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
            Totale voci
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
            {summary.vociCount}
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-600">
            {summary.dateFirst && summary.dateLast
              ? `${formatDateIt(summary.dateFirst)} – ${formatDateIt(summary.dateLast)}`
              : "Nessun periodo"}
          </p>
        </button>
      </div>

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
              <th className="px-3 py-2">Data</th>
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
                <tr
                  key={row.id}
                  className={`border-t border-[var(--border)] ${
                    row.signNeedsReview
                      ? "bg-sky-100 ring-1 ring-inset ring-sky-300"
                      : row.amount >= 0
                        ? "bg-emerald-50/40"
                        : "bg-red-50/30"
                  }`}
                >
                  <td className="px-3 py-2 align-top">
                    <p className="font-medium tabular-nums">
                      {formatDateIt(row.transactionDate)}
                    </p>
                    {row.valutaDate ? (
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        Valuta {formatDateIt(row.valutaDate)}
                      </p>
                    ) : null}
                    <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                      {row.accountName}
                    </span>
                    {row.signNeedsReview ? (
                      <span className="mt-1 inline-block rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        Segno da confermare
                      </span>
                    ) : null}
                  </td>
                  <td
                    className={`px-3 py-2 text-right align-top font-semibold tabular-nums ${
                      row.signNeedsReview
                        ? "text-sky-950"
                        : row.amount >= 0
                          ? "text-emerald-700"
                          : "text-red-700"
                    }`}
                  >
                    {row.signNeedsReview ? (
                      <span className="text-sky-900">
                        ±{formatEuro(Math.abs(row.amount))}
                      </span>
                    ) : (
                      <>
                        {row.amount >= 0 ? "+" : ""}
                        {formatEuro(row.amount)}
                      </>
                    )}
                    {row.signNeedsReview ? (
                      <div className="mt-1.5 flex justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={pending}
                          title="Entrata (AVERE)"
                          className="min-w-8 rounded-md border border-sky-700 bg-emerald-600 px-2.5 py-1 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                          onClick={() => {
                            startTransition(async () => {
                              const res = await setBankTransactionSignAction({
                                transactionId: row.id,
                                sign: "+",
                              });
                              if (!res.success) {
                                setError(res.error);
                                return;
                              }
                              setInfo(null);
                              void load();
                            });
                          }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          title="Uscita (DARE)"
                          className="min-w-8 rounded-md border border-sky-700 bg-red-600 px-2.5 py-1 text-sm font-bold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
                          onClick={() => {
                            startTransition(async () => {
                              const res = await setBankTransactionSignAction({
                                transactionId: row.id,
                                sign: "-",
                              });
                              if (!res.success) {
                                setError(res.error);
                                return;
                              }
                              setInfo(null);
                              void load();
                            });
                          }}
                        >
                          −
                        </button>
                      </div>
                    ) : null}
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
                      <button
                        type="button"
                        disabled={pending || row.amount === 0}
                        onClick={() => {
                          startTransition(async () => {
                            const res = await flipBankTransactionSignAction({
                              transactionId: row.id,
                            });
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            setInfo(null);
                            void load();
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                        title="Ribalta segno + ↔ −"
                      >
                        <FaArrowsRotate size={11} />
                        Ribalta
                      </button>
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
