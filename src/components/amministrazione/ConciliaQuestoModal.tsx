"use client";

import { useEffect, useId, useState, useTransition } from "react";
import {
  FaExpand,
  FaFileInvoice,
  FaLink,
  FaRobot,
  FaUser,
} from "react-icons/fa6";
import {
  attemptAutoReconcileBankTxAction,
  linkBankTransactionInvoiceAction,
  listBankReconcileAutoFallbackAction,
  listBankReconcileBrowseAction,
  type BankReconcileDateSplit,
  type BankTransactionView,
} from "@/app/actions/bank-reports";
import {
  BANK_RECONCILE_BROWSE_STEP_DAYS,
  BANK_RECONCILE_NEAR_DAYS,
  BANK_RECONCILE_SEARCH_DAYS,
  type BankReconcileCandidateView,
} from "@/lib/amministrazione/bank-reconcile";
import type { BankReconcileInvoiceGroup } from "@/lib/amministrazione/bank-reconcile-load";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";

type Step = "mode" | "choice" | "far_confirm" | "browse" | "fallback";

type Props = {
  row: BankTransactionView;
  onClose: () => void;
  onLinked: (msg: string) => void;
  onInfo: (msg: string) => void;
  onError: (msg: string) => void;
};

function invoiceDocHref(c: BankReconcileCandidateView): string | null {
  if (!c.ficId) return null;
  const seg = c.type === "received" ? "received" : "issued";
  return `/app/amministrazione/documenti-fic/${seg}/${c.ficId}`;
}

function CandidateRow({
  c,
  selected,
  onSelect,
}: {
  c: BankReconcileCandidateView;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
        selected
          ? "border-sky-500 bg-sky-50 ring-1 ring-sky-400"
          : c.amountMatch
            ? "border-emerald-300 bg-emerald-50/60 hover:bg-emerald-50"
            : "border-[var(--border)] hover:bg-slate-50"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold">{c.number || "—"}</span>
        <span className="tabular-nums font-semibold text-emerald-800">
          {formatEuro(c.amountGross)}
          {c.amountMatch ? " · importo ok" : ""}
        </span>
      </div>
      <p className="mt-0.5 font-medium text-slate-900">{c.entityName || "—"}</p>
      <p className="text-xs text-[var(--muted)]">
        {c.isDilazione ? "Scadenza rata" : "Data"}:{" "}
        {c.date ? formatDateIt(c.date) : "—"}
        {c.daysFromTx != null ? ` · Δ ${Math.round(c.daysFromTx)} gg` : ""}
      </p>
    </button>
  );
}

function InvoiceGroupList({
  groups,
  selectedInvoiceId,
  selectedDilazioneId,
  onPickFull,
  onPickDilazione,
}: {
  groups: BankReconcileInvoiceGroup[];
  selectedInvoiceId: string | null;
  selectedDilazioneId: string | null;
  onPickFull: (invoiceId: string) => void;
  onPickDilazione: (invoiceId: string, dilazioneId: string) => void;
}) {
  if (groups.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-4 text-center text-xs text-[var(--muted)]">
        Nessuna fattura in questa sezione.
      </p>
    );
  }
  return (
    <ul className="space-y-3">
      {groups.map((g) => {
        const hit =
          g.amountMatchFull || g.dilazioni.some((d) => d.amountMatch);
        return (
          <li
            key={g.invoiceId}
            className={`rounded-xl border px-3 py-3 ${
              hit
                ? "border-emerald-300 bg-emerald-50/40"
                : "border-[var(--border)] bg-white"
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="font-mono text-xs font-semibold">{g.number}</p>
                <p className="font-medium text-slate-900">{g.entityName}</p>
                <p className="text-xs text-[var(--muted)]">
                  Emessa:{" "}
                  {g.dataEmissione ? formatDateIt(g.dataEmissione) : "—"} ·
                  Totale {formatEuro(g.totale)}
                </p>
              </div>
              {!g.hasDilazioni ? (
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="bank-recon-pick"
                    checked={
                      selectedInvoiceId === g.invoiceId && !selectedDilazioneId
                    }
                    onChange={() => onPickFull(g.invoiceId)}
                  />
                  <span
                    className={
                      g.amountMatchFull ? "font-semibold text-emerald-800" : ""
                    }
                  >
                    Collega totale
                    {g.amountMatchFull ? " · importo ok" : ""}
                  </span>
                </label>
              ) : null}
            </div>
            {g.hasDilazioni ? (
              <fieldset className="mt-3 space-y-1.5 border-t border-[var(--border)] pt-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Dilazioni (una sola)
                </legend>
                {g.dilazioni.map((d) => (
                  <label
                    key={d.dilazioneId}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${
                      d.amountMatch ? "bg-emerald-100/70" : "hover:bg-slate-50"
                    } ${
                      selectedDilazioneId === d.dilazioneId
                        ? "ring-1 ring-sky-400"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="bank-recon-pick"
                      className="mt-1"
                      checked={selectedDilazioneId === d.dilazioneId}
                      onChange={() =>
                        onPickDilazione(g.invoiceId, d.dilazioneId)
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        Rata {d.sortOrder + 1} · {formatEuro(d.importo)}
                        {d.amountMatch ? " · importo ok" : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        Scadenza{" "}
                        {d.dataScadenza ? formatDateIt(d.dataScadenza) : "—"} ·{" "}
                        {d.statoPagamento}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function DateSplitBlocks({
  title,
  split,
  emptyHint,
  selectedInvoiceId,
  selectedDilazioneId,
  onPickFull,
  onPickDilazione,
}: {
  title: string;
  split: BankReconcileDateSplit;
  emptyHint: string;
  selectedInvoiceId: string | null;
  selectedDilazioneId: string | null;
  onPickFull: (invoiceId: string) => void;
  onPickDilazione: (invoiceId: string, dilazioneId: string) => void;
}) {
  const total =
    split.antecedenti.length +
    split.successive.length +
    split.senzaData.length;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {total === 0 ? (
        <p className="text-xs text-[var(--muted)]">{emptyHint}</p>
      ) : (
        <>
          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-900">
              Antecedenti alla data transazione ({split.antecedenti.length})
            </p>
            <InvoiceGroupList
              groups={split.antecedenti}
              selectedInvoiceId={selectedInvoiceId}
              selectedDilazioneId={selectedDilazioneId}
              onPickFull={onPickFull}
              onPickDilazione={onPickDilazione}
            />
          </div>
          <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-900">
              Successive / stesso giorno ({split.successive.length})
            </p>
            <InvoiceGroupList
              groups={split.successive}
              selectedInvoiceId={selectedInvoiceId}
              selectedDilazioneId={selectedDilazioneId}
              onPickFull={onPickFull}
              onPickDilazione={onPickDilazione}
            />
          </div>
          {split.senzaData.length > 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">
                Senza data emissione ({split.senzaData.length})
              </p>
              <InvoiceGroupList
                groups={split.senzaData}
                selectedInvoiceId={selectedInvoiceId}
                selectedDilazioneId={selectedDilazioneId}
                onPickFull={onPickFull}
                onPickDilazione={onPickDilazione}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ConciliaQuestoModal({
  row,
  onClose,
  onLinked,
  onInfo,
}: Props) {
  const titleId = useId();
  const [step, setStep] = useState<Step>("mode");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<BankReconcileCandidateView[]>(
    []
  );
  const [groups, setGroups] = useState<BankReconcileInvoiceGroup[]>([]);
  const [halfWindow, setHalfWindow] = useState(BANK_RECONCILE_SEARCH_DAYS);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [kind, setKind] = useState<"emessa" | "ricevuta" | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null
  );
  const [selectedDilazioneId, setSelectedDilazioneId] = useState<string | null>(
    null
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"manual" | "choice">("manual");
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companySplit, setCompanySplit] = useState<BankReconcileDateSplit>({
    antecedenti: [],
    successive: [],
    senzaData: [],
  });
  const [periodoSplit, setPeriodoSplit] = useState<BankReconcileDateSplit>({
    antecedenti: [],
    successive: [],
    senzaData: [],
  });
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);

  function clearSelection() {
    setSelectedInvoiceId(null);
    setSelectedDilazioneId(null);
    setSelectedKey(null);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function loadBrowse(nextHalf: number) {
    setError(null);
    startTransition(async () => {
      const res = await listBankReconcileBrowseAction({
        transactionId: row.id,
        halfWindowDays: nextHalf,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setHalfWindow(res.halfWindowDays);
      setDateFrom(res.dateFrom);
      setDateTo(res.dateTo);
      setKind(res.kind);
      setGroups(res.groups);
      clearSelection();
      setStep("browse");
      setLinkMode("manual");
    });
  }

  function loadAutoFallback(reason: string) {
    setError(null);
    setFallbackReason(reason);
    startTransition(async () => {
      const res = await listBankReconcileAutoFallbackAction({
        transactionId: row.id,
        halfWindowDays: BANK_RECONCILE_SEARCH_DAYS,
      });
      if (!res.success) {
        setError(res.error);
        loadBrowse(BANK_RECONCILE_SEARCH_DAYS);
        return;
      }
      setKind(res.kind);
      setHalfWindow(res.halfWindowDays);
      setDateFrom(res.dateFrom);
      setDateTo(res.dateTo);
      setCompanyName(res.companyName);
      setCompanySplit(res.company);
      setPeriodoSplit(res.periodo);
      clearSelection();
      setLinkMode("manual");
      setStep("fallback");
    });
  }

  function runAuto() {
    setError(null);
    startTransition(async () => {
      const res = await attemptAutoReconcileBankTxAction({
        transactionId: row.id,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      if (res.outcome === "already_linked") {
        onInfo(res.reason);
        onClose();
        return;
      }
      if (res.outcome === "matched") {
        onLinked(
          `Conciliazione automatica: ${res.invoiceNumber || "—"} (${res.score}%).`
        );
        onClose();
        return;
      }
      if (res.outcome === "needs_choice") {
        setCandidates(res.candidates);
        setKind(res.kind);
        clearSelection();
        setLinkMode("choice");
        setStep("choice");
        return;
      }
      if (res.outcome === "needs_far_confirm") {
        setCandidates(res.candidates);
        setKind(res.kind);
        clearSelection();
        setLinkMode("choice");
        setStep("far_confirm");
        return;
      }
      loadAutoFallback(res.reason);
    });
  }

  function confirmLink() {
    if (!selectedInvoiceId || !kind) return;
    if (step === "browse") {
      const g = groups.find((x) => x.invoiceId === selectedInvoiceId);
      if (g?.hasDilazioni && !selectedDilazioneId) {
        setError("Seleziona una sola dilazione (checkbox) sotto la fattura.");
        return;
      }
    }
    if (step === "fallback") {
      const all = [
        ...companySplit.antecedenti,
        ...companySplit.successive,
        ...companySplit.senzaData,
        ...periodoSplit.antecedenti,
        ...periodoSplit.successive,
        ...periodoSplit.senzaData,
      ];
      const g = all.find((x) => x.invoiceId === selectedInvoiceId);
      if (g?.hasDilazioni && !selectedDilazioneId) {
        setError("Seleziona una sola dilazione (checkbox) sotto la fattura.");
        return;
      }
    }
    setError(null);
    startTransition(async () => {
      const res = await linkBankTransactionInvoiceAction({
        transactionId: row.id,
        invoiceId: selectedInvoiceId,
        invoiceKind: kind,
        dilazioneId: selectedDilazioneId,
        mode: linkMode,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onLinked(`Collegata ${res.invoiceNumber || "—"} (${res.score}%).`);
      onClose();
    });
  }

  const catalogLabel =
    kind === "emessa"
      ? "Fatture emesse"
      : kind === "ricevuta"
        ? "Fatture ricevute"
        : row.amount > 0
          ? "Fatture emesse"
          : "Fatture ricevute";

  const pickFull = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
    setSelectedDilazioneId(null);
    setSelectedKey(invoiceId);
  };
  const pickDil = (invoiceId: string, dilazioneId: string) => {
    setSelectedInvoiceId(invoiceId);
    setSelectedDilazioneId(dilazioneId);
    setSelectedKey(dilazioneId);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold">
            Concilia questo
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatDateIt(row.transactionDate)} ·{" "}
            <span className="font-semibold tabular-nums text-slate-900">
              {formatEuro(row.amount)}
            </span>
            <span className="mt-1 block line-clamp-2 text-xs">
              {row.description || "—"}
            </span>
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          {step === "mode" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Automatica: solo importo entro ±{BANK_RECONCILE_SEARCH_DAYS} gg.
                Se non trova match, mostra le fatture dell’azienda e il periodo
                (antecedenti / successive).
              </p>
              <button
                type="button"
                disabled={pending || row.amount === 0}
                onClick={runAuto}
                className="flex w-full items-start gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-left hover:bg-sky-100 disabled:opacity-50"
              >
                <FaRobot className="mt-0.5 shrink-0 text-sky-700" />
                <span>
                  <span className="block font-semibold text-sky-950">
                    Automatica
                  </span>
                  <span className="mt-0.5 block text-xs text-sky-900/80">
                    Match solo importo · fallback azienda + periodo.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={pending || row.amount === 0}
                onClick={() => {
                  setLinkMode("manual");
                  loadBrowse(BANK_RECONCILE_SEARCH_DAYS);
                }}
                className="flex w-full items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left hover:bg-slate-50 disabled:opacity-50"
              >
                <FaUser className="mt-0.5 shrink-0 text-slate-600" />
                <span>
                  <span className="block font-semibold text-slate-900">
                    Manuale
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    Elenco {catalogLabel.toLowerCase()} con dilazioni
                    selezionabili.
                  </span>
                </span>
              </button>
            </div>
          ) : null}

          {step === "choice" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--muted)]">
                Più voci con lo stesso importo entro ±{BANK_RECONCILE_NEAR_DAYS}{" "}
                gg. Seleziona quella corretta.
              </p>
              <ul className="space-y-2">
                {candidates.map((c) => (
                  <li key={c.candidateKey}>
                    <CandidateRow
                      c={c}
                      selected={selectedKey === c.candidateKey}
                      onSelect={() => {
                        setSelectedKey(c.candidateKey);
                        setSelectedInvoiceId(c.id);
                        setSelectedDilazioneId(c.dilazioneId);
                      }}
                    />
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  loadAutoFallback("Apertura elenco azienda / periodo")
                }
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Nessuna di queste — fatture azienda e periodo
              </button>
            </div>
          ) : null}

          {step === "far_confirm" ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Trovate corrispondenze di importo oltre ±
                {BANK_RECONCILE_NEAR_DAYS} giorni (entro ±
                {BANK_RECONCILE_SEARCH_DAYS}). Verifica causale e fattura.
              </p>
              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Causale movimento
                </p>
                <p className="mt-1 text-slate-900">{row.description || "—"}</p>
              </div>
              <ul className="space-y-3">
                {candidates.map((c) => {
                  const href = invoiceDocHref(c);
                  const selected = selectedKey === c.candidateKey;
                  return (
                    <li
                      key={c.candidateKey}
                      className={`rounded-xl border px-3 py-3 ${
                        selected
                          ? "border-sky-500 bg-sky-50 ring-1 ring-sky-400"
                          : "border-amber-200 bg-amber-50/40"
                      }`}
                    >
                      <label className="flex cursor-pointer gap-3">
                        <input
                          type="radio"
                          name="far-confirm-pick"
                          className="mt-1"
                          checked={selected}
                          onChange={() => {
                            setSelectedKey(c.candidateKey);
                            setSelectedInvoiceId(c.id);
                            setSelectedDilazioneId(c.dilazioneId);
                          }}
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="font-mono text-xs font-semibold">
                            {c.number}
                          </span>
                          <span className="mt-1 block font-medium">
                            {c.entityName || "—"}
                          </span>
                          <span className="mt-0.5 block text-xs text-[var(--muted)]">
                            {c.date ? formatDateIt(c.date) : "—"}
                            {c.daysFromTx != null
                              ? ` · ${Math.round(c.daysFromTx)} gg`
                              : ""}
                          </span>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                            >
                              <FaFileInvoice size={11} />
                              Apri fattura
                            </a>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  loadAutoFallback("Nessuna delle proposte lontane")
                }
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Nessuna di queste — fatture azienda e periodo
              </button>
            </div>
          ) : null}

          {step === "fallback" ? (
            <div className="space-y-5">
              <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                {fallbackReason ?? "Nessun match automatico sull’importo."}{" "}
                Ecco le fatture dell’azienda (se individuata) e poi quelle nel
                periodo ±{halfWindow} gg, separate in{" "}
                <strong>Antecedenti</strong> e <strong>Successive</strong>.
              </p>
              <DateSplitBlocks
                title={
                  companyName
                    ? `1 · Tutte le fatture di «${companyName}»`
                    : "1 · Fatture azienda (non individuata dalla causale)"
                }
                split={companySplit}
                emptyHint={
                  companyName
                    ? "Nessuna fattura per questa azienda."
                    : "Controparte non riconosciuta: passa alla sezione periodo."
                }
                selectedInvoiceId={selectedInvoiceId}
                selectedDilazioneId={selectedDilazioneId}
                onPickFull={pickFull}
                onPickDilazione={pickDil}
              />
              <DateSplitBlocks
                title={`2 · Altre fatture nel periodo (${
                  dateFrom && dateTo
                    ? `${formatDateIt(dateFrom)} → ${formatDateIt(dateTo)}`
                    : `±${halfWindow} gg`
                })`}
                split={periodoSplit}
                emptyHint="Nessuna altra fattura nel periodo."
                selectedInvoiceId={selectedInvoiceId}
                selectedDilazioneId={selectedDilazioneId}
                onPickFull={pickFull}
                onPickDilazione={pickDil}
              />
              <button
                type="button"
                disabled={pending}
                onClick={() => loadBrowse(halfWindow + BANK_RECONCILE_BROWSE_STEP_DAYS)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline"
              >
                <FaExpand size={11} />
                Apri elenco completo espanso
              </button>
            </div>
          ) : null}

          {step === "browse" ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-[var(--muted)]">
                  <strong>{catalogLabel}</strong>
                  {dateFrom && dateTo
                    ? ` · ${formatDateIt(dateFrom)} → ${formatDateIt(dateTo)} (±${halfWindow} gg)`
                    : null}
                </p>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    loadBrowse(halfWindow + BANK_RECONCILE_BROWSE_STEP_DAYS)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
                >
                  <FaExpand size={11} />
                  Espandi ±{BANK_RECONCILE_BROWSE_STEP_DAYS} gg
                </button>
              </div>
              <InvoiceGroupList
                groups={groups}
                selectedInvoiceId={selectedInvoiceId}
                selectedDilazioneId={selectedDilazioneId}
                onPickFull={pickFull}
                onPickDilazione={pickDil}
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            {step === "far_confirm" ? "Scarta / Annulla" : "Annulla"}
          </button>
          {step === "choice" ||
          step === "browse" ||
          step === "far_confirm" ||
          step === "fallback" ? (
            <button
              type="button"
              disabled={pending || !selectedInvoiceId}
              onClick={confirmLink}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <FaLink size={12} />
              {pending
                ? "Collegamento…"
                : step === "far_confirm"
                  ? "Conferma corrispondenza"
                  : "Conferma collegamento"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
