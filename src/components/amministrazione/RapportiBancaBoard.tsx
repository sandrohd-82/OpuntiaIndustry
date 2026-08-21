"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  FaFileInvoice,
  FaCircleInfo,
  FaScaleBalanced,
  FaPrint,
  FaArrowsRotate,
  FaFloppyDisk,
  FaTrashCan,
  FaFileCsv,
  FaFilePdf,
  FaCloudArrowUp,
  FaCheck,
  FaCircleQuestion,
  FaArrowUpRightFromSquare,
} from "react-icons/fa6";
import {
  listBankTransactionsAction,
  previewBankCsvAction,
  saveBankImportAction,
  reconcilePreviewLinesAction,
  setBankTransactionSignAction,
  flipBankTransactionSignAction,
  verifyBankMatchAction,
  reconcileAllBankTransactionsAction,
  type BankTransactionView,
  type BankPeriodSummary,
  type BankPreviewLineView,
  type BankContextTxView,
} from "@/app/actions/bank-reports";
import { ConciliaQuestoModal } from "@/components/amministrazione/ConciliaQuestoModal";
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

/** Riepilogo box da righe CSV in anteprima (stessa logica dei dati DB). */
function summarizePreviewLines(
  lines: Array<{
    amount: number;
    transactionDate: string;
    signNeedsReview?: boolean;
  }>
): BankPeriodSummary {
  const summary: BankPeriodSummary = { ...EMPTY_SUMMARY };
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const r of lines) {
    summary.vociCount += 1;
    const d = r.transactionDate;
    if (d && d !== "1970-01-01") {
      if (!minDate || d < minDate) minDate = d;
      if (!maxDate || d > maxDate) maxDate = d;
    }
    const mag = Math.abs(r.amount) || 0;
    if (r.signNeedsReview) {
      summary.dubbieCount += 1;
      summary.dubbieTotal += mag;
      continue;
    }
    if (r.amount > 0) {
      summary.entrateCount += 1;
      summary.entrateTotal += r.amount;
    } else if (r.amount < 0) {
      summary.usciteCount += 1;
      summary.usciteTotal += mag;
    }
  }
  summary.entrateTotal = Math.round(summary.entrateTotal * 100) / 100;
  summary.usciteTotal = Math.round(summary.usciteTotal * 100) / 100;
  summary.dubbieTotal = Math.round(summary.dubbieTotal * 100) / 100;
  summary.dateFirst = minDate;
  summary.dateLast = maxDate;
  return summary;
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
  const [conciliaRow, setConciliaRow] = useState<BankTransactionView | null>(
    null
  );
  const [importOpen, setImportOpen] = useState(false);
  const [csvHelpOpen, setCsvHelpOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [pdfSourceFile, setPdfSourceFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("BCC Don Rizzo");
  const [printUser] = useState("Operatore area fiscale");
  const csvInputId = useId();
  const pdfInputId = useId();
  const [csvDragOver, setCsvDragOver] = useState(false);
  const [pdfDragOver, setPdfDragOver] = useState(false);

  /** Anteprima CSV (non ancora in DB). */
  const [previewActive, setPreviewActive] = useState(false);
  const [previewLines, setPreviewLines] = useState<BankPreviewLineView[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<Set<number>>(
    () => new Set()
  );
  const [contextBefore, setContextBefore] = useState<BankContextTxView[]>([]);
  const [contextAfter, setContextAfter] = useState<BankContextTxView[]>([]);
  const [contextAfterHasMore, setContextAfterHasMore] = useState(false);

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

  const displaySummary = useMemo(() => {
    if (previewActive) return summarizePreviewLines(previewLines);
    return summary;
  }, [previewActive, previewLines, summary]);

  const visiblePreviewLines = useMemo(() => {
    if (tipo === "entrate") {
      return previewLines.filter(
        (l) => l.amount > 0 || l.signNeedsReview
      );
    }
    if (tipo === "uscite") {
      return previewLines.filter(
        (l) => l.amount < 0 || l.signNeedsReview
      );
    }
    if (tipo === "da_confermare") {
      return previewLines.filter((l) => l.signNeedsReview);
    }
    if (tipo === "non_riconciliati") {
      return previewLines.filter((l) => !l.match);
    }
    return previewLines;
  }, [previewLines, tipo]);

  function buildLineWorkJson(): string {
    const map: Record<
      string,
      {
        amount: number;
        signNeedsReview: boolean;
        match: {
          invoiceId: string;
          matchScore: number;
          status: "auto_matched" | "manually_verified" | "discrepancy";
          invoiceKind?: "emessa" | "ricevuta";
        } | null;
      }
    > = {};
    for (const l of previewLines) {
      map[String(l.rowIndex)] = {
        amount: l.amount,
        signNeedsReview: l.signNeedsReview,
        match: l.match
          ? {
              invoiceId: l.match.invoiceId,
              matchScore: l.match.matchScore,
              status: l.match.status,
              invoiceKind: l.match.invoiceKind,
            }
          : null,
      };
    }
    return JSON.stringify(map);
  }

  function applyPreviewReconcileUpdates(
    updates: Array<{
      rowIndex: number;
      match: BankPreviewLineView["match"];
    }>
  ) {
    const byRi = new Map(updates.map((u) => [u.rowIndex, u.match]));
    setPreviewLines((prev) =>
      prev.map((l) => {
        if (!byRi.has(l.rowIndex)) return l;
        const m = byRi.get(l.rowIndex) ?? null;
        return m ? { ...l, match: m } : l;
      })
    );
  }

  function runPreviewReconcile(scope: "all" | "selected" | "one", rowIndex?: number) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const rowIndices =
        scope === "all"
          ? undefined
          : scope === "one"
            ? [rowIndex!]
            : [...selectedPreview];
      const res = await reconcilePreviewLinesAction({
        lines: previewLines.map((l) => ({
          rowIndex: l.rowIndex,
          amount: l.amount,
          description: l.description,
          counterpartyName: l.counterpartyName,
          transactionDate: l.transactionDate,
          matchInvoiceId: l.match?.invoiceId ?? null,
        })),
        scope,
        rowIndices,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      applyPreviewReconcileUpdates(res.updates);
      if (res.matched === 0) {
        setInfo(
          "Nessuna fattura compatibile trovata per le righe scelte (importo/causale/data)."
        );
      } else {
        setInfo(
          `Conciliazione (sessione): ${res.matched} collegati, ${res.skipped} saltati su ${res.attempted} tentati. Salva nel DB a fine lavoro.`
        );
      }
    });
  }

  function flipPreviewAmount(rowIndex: number) {
    setPreviewLines((prev) =>
      prev.map((l) =>
        l.rowIndex === rowIndex
          ? { ...l, amount: -l.amount, signNeedsReview: false }
          : l
      )
    );
  }

  function clearPreviewMatch(rowIndex: number) {
    setPreviewLines((prev) =>
      prev.map((l) => (l.rowIndex === rowIndex ? { ...l, match: null } : l))
    );
  }

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

  function clearPreview() {
    setPreviewActive(false);
    setPreviewLines([]);
    setSelectedPreview(new Set());
    setContextBefore([]);
    setContextAfter([]);
    setContextAfterHasMore(false);
    setCsvFile(null);
    setPdfSourceFile(null);
    setSaveOpen(false);
  }

  function openSyncModal() {
    setError(null);
    setInfo(null);
    setCsvFile(null);
    setImportOpen(true);
  }

  function runCsvPreview() {
    if (!csvFile) {
      setError("Seleziona un file CSV di estratto conto.");
      return;
    }
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", csvFile);
      const name = csvFile.name.toLowerCase();
      if (name.endsWith(".pdf")) {
        setError(
          "Carica un CSV (5 colonne). Al salvataggio ti verrà chiesto anche il PDF originale della banca."
        );
        return;
      }
      const res = await previewBankCsvAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setImportOpen(false);
      setPreviewLines(res.lines);
      setSelectedPreview(new Set());
      setContextBefore(res.contextBefore);
      setContextAfter(res.contextAfter);
      setContextAfterHasMore(res.contextAfterHasMore);
      setPreviewActive(true);
      setTipo("tutti");
      if (res.dateFrom && res.dateTo) {
        setPreset("personalizzato");
        setDateFrom(res.dateFrom);
        setDateTo(res.dateTo);
      }
      setSummary(summarizePreviewLines(res.lines));
    });
  }

  function deleteSelectedPreviewRows() {
    if (selectedPreview.size === 0) {
      setError("Seleziona almeno una riga da eliminare dall’anteprima.");
      return;
    }
    setPreviewLines((prev) =>
      prev.filter((l) => !selectedPreview.has(l.rowIndex))
    );
    setSelectedPreview(new Set());
    setError(null);
    setInfo(null);
  }

  function runSaveToDb() {
    if (!csvFile) {
      setError("File CSV perso: ricarica l’anteprima.");
      return;
    }
    if (!pdfSourceFile) {
      setError("Allega il PDF originale della banca.");
      return;
    }
    if (previewLines.length === 0) {
      setError("Nessuna riga da salvare.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("csv", csvFile);
      fd.set("pdf", pdfSourceFile);
      fd.set("accountName", accountName);
      fd.set(
        "keepRowIndices",
        JSON.stringify(previewLines.map((l) => l.rowIndex))
      );
      fd.set("lineWorkJson", buildLineWorkJson());
      const res = await saveBankImportAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSaveOpen(false);
      clearPreview();
      const nextFrom = res.dateFrom ?? dateFrom;
      const nextTo = res.dateTo ?? dateTo;
      if (res.dateFrom && res.dateTo) {
        setPreset("personalizzato");
        setDateFrom(res.dateFrom);
        setDateTo(res.dateTo);
      }
      setTipo("tutti");
      setInfo(
        `Fine lavoro salvato: ${res.rowsImported} movimenti · ${res.rowsMatched} conciliati · CSV + PDF «${res.pdfFileName}»`
      );
      const list = await listBankTransactionsAction({
        dateFrom: nextFrom,
        dateTo: nextTo,
        tipo: "tutti",
      });
      if (!list.success) {
        setError(list.error);
        return;
      }
      setItems(list.items);
      setSummary(list.summary ?? EMPTY_SUMMARY);
    });
  }

  function runReconcileAll() {
    setError(null);
    startTransition(async () => {
      const res = await reconcileAllBankTransactionsAction({
        dateFrom,
        dateTo,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo(
        `Concilia tutto: ${res.matched} collegati, ${res.skipped} saltati (già conciliati o senza fattura adatta) su ${res.attempted} da processare.`
      );
      void load();
    });
  }

  function printReport() {
    window.print();
  }

  const allPreviewSelected =
    visiblePreviewLines.length > 0 &&
    visiblePreviewLines.every((l) => selectedPreview.has(l.rowIndex));

  function toggleSelectAllPreview() {
    if (allPreviewSelected) {
      setSelectedPreview((prev) => {
        const next = new Set(prev);
        for (const l of visiblePreviewLines) next.delete(l.rowIndex);
        return next;
      });
      return;
    }
    setSelectedPreview((prev) => {
      const next = new Set(prev);
      for (const l of visiblePreviewLines) next.add(l.rowIndex);
      return next;
    });
  }

  return (
    <div className="bank-report-root space-y-4">
      <div className="print:hidden flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          {previewActive
            ? "Sessione di lavoro: elimina, ribalta, concilia (una / selezionate / tutte). «Salva nel DB» chiude il lavoro con CSV + PDF."
            : "Movimenti da estratto conto salvati nel database: filtri data / trimestre con collegamento alle fatture."}
        </p>
        <div className="flex flex-wrap gap-2">
          {previewActive ? (
            <>
              <button
                type="button"
                disabled={pending || selectedPreview.size === 0}
                onClick={deleteSelectedPreviewRows}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-900 disabled:opacity-50"
              >
                <FaTrashCan size={13} />
                Elimina selezionate ({selectedPreview.size})
              </button>
              <button
                type="button"
                disabled={pending || selectedPreview.size === 0}
                onClick={() => runPreviewReconcile("selected")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 disabled:opacity-50"
                title="Concilia solo le righe selezionate"
              >
                <FaScaleBalanced size={13} />
                Concilia selezionate
              </button>
              <button
                type="button"
                disabled={pending || previewLines.length === 0}
                onClick={() => runPreviewReconcile("all")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500 bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                title="Concilia tutte le righe ancora senza fattura"
              >
                <FaScaleBalanced size={13} />
                Concilia tutto
              </button>
              <button
                type="button"
                disabled={pending || previewLines.length === 0}
                onClick={() => {
                  setPdfSourceFile(null);
                  setSaveOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                title="Salvataggio di fine lavoro: movimenti + match + CSV + PDF"
              >
                <FaFloppyDisk size={13} />
                Salva nel DB (fine lavoro)
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  clearPreview();
                  setInfo(null);
                  void load();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              >
                Annulla sessione
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={openSyncModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <FaArrowsRotate size={13} />
                Carica CSV (anteprima)
              </button>
              <button
                type="button"
                disabled={pending || items.length === 0}
                onClick={runReconcileAll}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-950 disabled:opacity-50"
                title="Collega automaticamente i movimenti del periodo alle fatture compatibili"
              >
                <FaScaleBalanced size={13} />
                Concilia tutto
              </button>
              <button
                type="button"
                onClick={printReport}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium"
              >
                <FaPrint size={13} />
                Stampa / Esporta Report PDF
              </button>
            </>
          )}
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
          title="Carica CSV — solo anteprima"
          onClose={() => !pending && setImportOpen(false)}
        >
          <p className="mb-3 text-sm text-[var(--muted)]">
            Carica un <strong>.csv</strong> a 5 colonne: Data; Data Valuta;
            Uscite; Entrate; Causale. I dati restano in anteprima finché non
            premi <strong>Salva nel DB</strong> (allora serviranno anche il PDF
            originale della banca: CSV e PDF restano collegati allo stesso
            lotto).
          </p>
          <button
            type="button"
            onClick={() => setCsvHelpOpen(true)}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2 hover:text-sky-800"
          >
            <FaCircleQuestion size={14} />
            Spiega come fare
          </button>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs font-medium">Nome conto</span>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>

          <div className="mb-4">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              File CSV estratto conto
            </span>
            <label
              htmlFor={csvInputId}
              onDragEnter={(e) => {
                e.preventDefault();
                setCsvDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setCsvDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setCsvDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setCsvDragOver(false);
                const f = e.dataTransfer.files?.[0] ?? null;
                if (!f) return;
                const n = f.name.toLowerCase();
                if (
                  !n.endsWith(".csv") &&
                  !n.endsWith(".cvs") &&
                  f.type !== "text/csv" &&
                  f.type !== "text/plain"
                ) {
                  setError("Seleziona un file .csv (accettato anche .cvs).");
                  return;
                }
                setError(null);
                setCsvFile(f);
              }}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                csvDragOver
                  ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                  : csvFile
                    ? "border-emerald-400 bg-gradient-to-b from-emerald-50 to-white"
                    : "border-slate-300 bg-gradient-to-b from-slate-50 to-white hover:border-[var(--primary)] hover:from-sky-50/80 hover:to-white"
              }`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition ${
                  csvFile
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-[var(--primary)]"
                }`}
              >
                {csvFile ? <FaCheck size={22} /> : <FaCloudArrowUp size={26} />}
              </span>
              {csvFile ? (
                <>
                  <div className="flex max-w-full items-center gap-2 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-emerald-200">
                    <FaFileCsv
                      className="shrink-0 text-emerald-700"
                      size={20}
                    />
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {csvFile.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(csvFile.size / 1024).toFixed(0)} KB · pronto per
                        anteprima
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-emerald-800">
                    Clicca o trascina un altro file per sostituirlo
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      Trascina qui il file CSV
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      oppure{" "}
                      <span className="font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2">
                        scegli dal computer
                      </span>
                    </p>
                  </div>
                  <p className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                    .csv / .cvs · 5 colonne · max 15 MB
                  </p>
                </>
              )}
              <input
                id={csvInputId}
                type="file"
                accept=".csv,.cvs,text/csv,text/plain"
                className="sr-only"
                onChange={(e) => {
                  setCsvFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !csvFile}
              onClick={runCsvPreview}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Lettura…" : "Carica anteprima"}
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

      {csvHelpOpen ? (
        <Modal
          title="Come preparare il CSV dall’estratto PDF"
          onClose={() => setCsvHelpOpen(false)}
        >
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1 text-sm text-slate-800">
            <section className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-950">
                Avvertenze
              </h4>
              <p className="mt-1.5 text-sm text-amber-950/90">
                Controllare che la tabella del file sia composta da{" "}
                <strong>5 colonne</strong> come segue:
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-amber-950">
                <li>Data</li>
                <li>Valuta</li>
                <li>Movimenti in uscita</li>
                <li>Movimenti in entrata</li>
                <li>Descrizione / Causale</li>
              </ol>
            </section>

            <section>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Procedura di conversione
              </h4>
              <ol className="space-y-3">
                <li className="rounded-lg border border-[var(--border)] bg-slate-50/80 px-3 py-2.5">
                  <p className="font-semibold text-slate-900">
                    1) Caricare il documento PDF
                  </p>
                  <p className="mt-1 text-slate-700">
                    Carica il documento <strong>.pdf</strong> nel sito di
                    conversione PDF → Excel, ad esempio{" "}
                    <a
                      href="https://doclio.com/it/l/pdf-to-excel"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2"
                    >
                      Doclio – PDF in Excel
                      <FaArrowUpRightFromSquare size={11} />
                    </a>{" "}
                    (si apre in una nuova scheda).
                  </p>
                </li>
                <li className="rounded-lg border border-[var(--border)] bg-slate-50/80 px-3 py-2.5">
                  <p className="font-semibold text-slate-900">
                    2) Convertire e scaricare
                  </p>
                  <p className="mt-1 text-slate-700">
                    Converti e scarica il documento Excel (.xlsx).
                  </p>
                </li>
                <li className="rounded-lg border border-[var(--border)] bg-slate-50/80 px-3 py-2.5">
                  <p className="font-semibold text-slate-900">
                    3) Aprire Excel e unificare i movimenti
                  </p>
                  <p className="mt-1 text-slate-700">
                    Apri il file Excel (in genere composto da pagine di
                    intestazioni e pagine di movimenti). Elimina le intestazioni
                    e carica i movimenti (copia e incolla) in{" "}
                    <strong>ordine crescente</strong>, uno sotto l’altro, in un{" "}
                    <strong>unico foglio</strong>; elimina i fogli copiati. Alla
                    fine deve restare un solo foglio con tutti i movimenti,
                    esclusi saldi iniziali e finali, nomi celle, ecc. (di solito
                    presenti solo all’inizio e alla fine dei movimenti).
                  </p>
                </li>
                <li className="rounded-lg border border-[var(--border)] bg-slate-50/80 px-3 py-2.5">
                  <p className="font-semibold text-slate-900">
                    4) Esporta in CSV
                  </p>
                  <p className="mt-1 text-slate-700">
                    Salva il documento ed esporta in formato{" "}
                    <strong>.csv</strong> (se richiesto, formato europeo con
                    divisore <strong>;</strong> o <strong>,</strong>).
                  </p>
                </li>
                <li className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
                  <p className="font-semibold text-emerald-950">
                    5) Carica qui il CSV
                  </p>
                  <p className="mt-1 text-emerald-950/90">
                    Carica il documento <strong>.csv</strong> in quest’area per
                    il caricamento dei movimenti bancari (anteprima →
                    conciliazione → Salva nel DB con PDF originale).
                  </p>
                </li>
              </ol>
            </section>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href="https://doclio.com/it/l/pdf-to-excel"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
            >
              Apri convertitore PDF → Excel
              <FaArrowUpRightFromSquare size={12} />
            </a>
            <button
              type="button"
              onClick={() => setCsvHelpOpen(false)}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Chiudi
            </button>
          </div>
        </Modal>
      ) : null}

      {saveOpen ? (
        <Modal
          title="Fine lavoro — salva CSV + PDF + movimenti"
          onClose={() => !pending && setSaveOpen(false)}
        >
          <p className="mb-3 text-sm text-[var(--muted)]">
            Chiusura sessione: salva <strong>{previewLines.length}</strong>{" "}
            movimenti (con eventuali conciliazioni già fatte), il CSV fonte e il{" "}
            <strong>PDF originale</strong> della banca, collegati allo stesso
            lotto.
          </p>
          <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            CSV: {csvFile?.name ?? "—"}
          </p>

          <div className="mb-4">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600">
              PDF originale estratto conto banca *
            </span>
            <label
              htmlFor={pdfInputId}
              onDragEnter={(e) => {
                e.preventDefault();
                setPdfDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setPdfDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setPdfDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setPdfDragOver(false);
                const f = e.dataTransfer.files?.[0] ?? null;
                if (!f) return;
                const n = f.name.toLowerCase();
                if (!n.endsWith(".pdf") && f.type !== "application/pdf") {
                  setError("Seleziona un file PDF originale della banca.");
                  return;
                }
                setError(null);
                setPdfSourceFile(f);
              }}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
                pdfDragOver
                  ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
                  : pdfSourceFile
                    ? "border-emerald-400 bg-gradient-to-b from-emerald-50 to-white"
                    : "border-slate-300 bg-gradient-to-b from-slate-50 to-white hover:border-[var(--primary)] hover:from-sky-50/80 hover:to-white"
              }`}
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-2xl shadow-sm transition ${
                  pdfSourceFile
                    ? "bg-emerald-600 text-white"
                    : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-[var(--primary)]"
                }`}
              >
                {pdfSourceFile ? (
                  <FaCheck size={22} />
                ) : (
                  <FaCloudArrowUp size={26} />
                )}
              </span>
              {pdfSourceFile ? (
                <>
                  <div className="flex max-w-full items-center gap-2 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-emerald-200">
                    <FaFilePdf className="shrink-0 text-red-600" size={20} />
                    <div className="min-w-0 text-left">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {pdfSourceFile.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {(pdfSourceFile.size / 1024).toFixed(0)} KB · pronto per
                        il salvataggio
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-emerald-800">
                    Clicca o trascina un altro file per sostituirlo
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-base font-semibold text-slate-900">
                      Trascina qui il file PDF
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      oppure{" "}
                      <span className="font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2">
                        scegli dal computer
                      </span>
                    </p>
                  </div>
                  <p className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
                    .pdf · estratto conto originale · max 40 MB
                  </p>
                </>
              )}
              <input
                id={pdfInputId}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  setPdfSourceFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !pdfSourceFile || !csvFile}
              onClick={runSaveToDb}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              <FaFloppyDisk size={13} />
              {pending ? "Salvataggio…" : "Conferma salvataggio"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setSaveOpen(false)}
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
            {displaySummary.entrateCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-emerald-700">
            {formatEuro(displaySummary.entrateTotal)}
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
            {displaySummary.usciteCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-red-700">
            {formatEuro(displaySummary.usciteTotal)}
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
            {displaySummary.dubbieCount}
          </p>
          <p className="mt-0.5 text-sm font-medium tabular-nums text-sky-800">
            {formatEuro(displaySummary.dubbieTotal)}
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
            {displaySummary.vociCount}
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-600">
            {displaySummary.dateFirst && displaySummary.dateLast
              ? `${formatDateIt(displaySummary.dateFirst)} – ${formatDateIt(displaySummary.dateLast)}`
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
              {previewActive ? (
                <th className="print:hidden w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allPreviewSelected}
                    onChange={toggleSelectAllPreview}
                    aria-label="Seleziona tutte le righe anteprima"
                  />
                </th>
              ) : null}
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2 text-right">Importo</th>
              <th className="px-3 py-2">Causale / Controparte</th>
              <th className="px-3 py-2">
                {previewActive ? "Fattura / stato" : "Fattura collegata"}
              </th>
              {!previewActive ? (
                <th className="print:hidden px-3 py-2">Azioni</th>
              ) : (
                <th className="print:hidden px-3 py-2">Azioni</th>
              )}
            </tr>
          </thead>
          <tbody>
            {previewActive ? (
              <>
                {contextBefore.length > 0 ? (
                  <>
                    <tr className="print:hidden">
                      <td
                        colSpan={6}
                        className="bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Già in DB — ultime {contextBefore.length} voci prima del
                        CSV (solo lettura)
                      </td>
                    </tr>
                    <tr className="print:hidden">
                      <td colSpan={6} className="p-0">
                        <div
                          style={{
                            maskImage:
                              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 40%, black 100%)",
                            WebkitMaskImage:
                              "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.45) 40%, black 100%)",
                          }}
                        >
                          <table className="w-full min-w-[720px] text-left text-sm">
                            <tbody>
                              {contextBefore.map((row, idx) => (
                                <DisabledContextRow
                                  key={`before-${row.id}`}
                                  row={row}
                                  fadeAway={
                                    contextBefore.length <= 1
                                      ? 0.45
                                      : (contextBefore.length - 1 - idx) /
                                        (contextBefore.length - 1)
                                  }
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : null}

                {visiblePreviewLines.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-[var(--muted)]"
                    >
                      {previewLines.length === 0
                        ? "Nessuna riga in anteprima. Eliminale tutte o ricarica il CSV."
                        : "Nessuna riga per il filtro selezionato."}
                    </td>
                  </tr>
                ) : (
                  visiblePreviewLines.map((row) => {
                    const selected = selectedPreview.has(row.rowIndex);
                    return (
                      <tr
                        key={`preview-${row.rowIndex}`}
                        className={`border-t border-[var(--border)] ${
                          selected
                            ? "bg-amber-50 ring-1 ring-inset ring-amber-300"
                            : row.signNeedsReview
                              ? "bg-sky-100 ring-1 ring-inset ring-sky-300"
                              : row.amount >= 0
                                ? "bg-emerald-50/40"
                                : "bg-red-50/30"
                        }`}
                      >
                        <td className="print:hidden px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => {
                              setSelectedPreview((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.rowIndex))
                                  next.delete(row.rowIndex);
                                else next.add(row.rowIndex);
                                return next;
                              });
                            }}
                            aria-label={`Seleziona riga ${row.rowIndex + 1}`}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <p className="font-medium tabular-nums">
                            {formatDateIt(row.transactionDate)}
                          </p>
                          {row.valutaDate ? (
                            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                              Valuta {formatDateIt(row.valutaDate)}
                            </p>
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
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-900">
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
                            {!row.match ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  runPreviewReconcile("one", row.rowIndex)
                                }
                                className="inline-flex items-center gap-1 rounded border border-sky-500 bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                              >
                                <FaScaleBalanced size={11} />
                                Concilia questo
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => clearPreviewMatch(row.rowIndex)}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                Scollega
                              </button>
                            )}
                            {!row.match ? (
                              <button
                                type="button"
                                disabled={pending || row.amount === 0}
                                onClick={() => flipPreviewAmount(row.rowIndex)}
                                className="inline-flex items-center gap-1 rounded border border-slate-400 bg-white px-2 py-1 text-[11px] font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                title="Ribalta segno + ↔ −"
                              >
                                <FaArrowsRotate size={11} />
                                Ribalta
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}

                {contextAfter.length > 0 ? (
                  <>
                    <tr className="print:hidden">
                      <td
                        colSpan={6}
                        className="bg-slate-100 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500"
                      >
                        Già in DB — prime {contextAfter.length} voci successive
                        al CSV
                        {contextAfterHasMore
                          ? " (elenco più ampio…)"
                          : ""}{" "}
                        (solo lettura)
                      </td>
                    </tr>
                    <tr className="print:hidden">
                      <td colSpan={6} className="p-0">
                        <div
                          className="relative"
                          style={{
                            maskImage:
                              "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
                            WebkitMaskImage:
                              "linear-gradient(to bottom, black 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
                          }}
                        >
                          <table className="w-full min-w-[720px] text-left text-sm">
                            <tbody>
                              {contextAfter.map((row, idx) => (
                                <DisabledContextRow
                                  key={`after-${row.id}`}
                                  row={row}
                                  fadeAway={
                                    contextAfter.length <= 1
                                      ? 0.45
                                      : idx / (contextAfter.length - 1)
                                  }
                                />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  </>
                ) : null}
              </>
            ) : items.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Nessun movimento. Carica un CSV in anteprima e salvalo con il
                  PDF originale.
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
                      {!row.match ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setConciliaRow(row)}
                          className="inline-flex items-center gap-1 rounded border border-sky-500 bg-sky-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                          title="Collega questo movimento a una fattura"
                        >
                          <FaScaleBalanced size={11} />
                          Concilia questo
                        </button>
                      ) : null}
                      {!row.match ? (
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
                      ) : null}
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

      {conciliaRow ? (
        <ConciliaQuestoModal
          row={conciliaRow}
          onClose={() => setConciliaRow(null)}
          onLinked={(msg) => {
            setInfo(msg);
            setError(null);
            setConciliaRow(null);
            void load();
          }}
          onInfo={(msg) => setInfo(msg)}
          onError={(msg) => setError(msg)}
        />
      ) : null}

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

/** Righe DB di contesto: grigie disattivate + sfumatura verso le più lontane. */
function DisabledContextRow({
  row,
  fadeAway = 0.35,
}: {
  row: BankContextTxView;
  fadeAway?: number;
}) {
  const t = Math.min(1, Math.max(0, fadeAway));
  const opacity = 0.72 - t * 0.42;

  return (
    <tr
      className="pointer-events-none select-none border-t border-slate-200 bg-slate-100 text-slate-500"
      style={{ opacity }}
      aria-disabled="true"
    >
      <td className="print:hidden px-2 py-2 align-top">
        <span className="block h-4 w-4 rounded border border-slate-300 bg-slate-200" />
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium tabular-nums text-slate-600">
          {formatDateIt(row.transactionDate)}
        </p>
        {row.valutaDate ? (
          <p className="mt-0.5 text-[10px] text-slate-400">
            Valuta {formatDateIt(row.valutaDate)}
          </p>
        ) : null}
        <span className="mt-0.5 inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {row.accountName}
        </span>
      </td>
      <td className="px-3 py-2 text-right align-top font-semibold tabular-nums text-slate-500">
        {row.amount >= 0 ? "+" : ""}
        {formatEuro(row.amount)}
      </td>
      <td className="px-3 py-2 align-top">
        <p className="font-medium text-slate-600">
          {row.counterpartyName || "—"}
        </p>
        <p className="line-clamp-2 text-xs text-slate-400">
          {row.description || "—"}
        </p>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          Già in DB
        </span>
      </td>
      <td className="print:hidden px-3 py-2 align-top text-[11px] text-slate-400">
        disattivo
      </td>
    </tr>
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
