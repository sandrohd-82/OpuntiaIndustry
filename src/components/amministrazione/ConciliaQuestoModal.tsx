"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { FaExpand, FaLink, FaRobot, FaUser } from "react-icons/fa6";
import {
  attemptAutoReconcileBankTxAction,
  linkBankTransactionInvoiceAction,
  listBankReconcileBrowseAction,
  type BankTransactionView,
} from "@/app/actions/bank-reports";
import {
  BANK_RECONCILE_BROWSE_STEP_DAYS,
  type BankReconcileCandidateView,
} from "@/lib/amministrazione/bank-reconcile";
import type { BankReconcileInvoiceGroup } from "@/lib/amministrazione/bank-reconcile-load";
import { formatDateIt, formatEuro } from "@/lib/amministrazione/fatture";

type Step = "mode" | "choice" | "browse";

type Props = {
  row: BankTransactionView;
  onClose: () => void;
  onLinked: (msg: string) => void;
  onInfo: (msg: string) => void;
  onError: (msg: string) => void;
};

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
        {c.entityScore && c.entityScore > 0
          ? ` · azienda in causale (${c.entityScore})`
          : ""}
      </p>
    </button>
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
  const [halfWindow, setHalfWindow] = useState(BANK_RECONCILE_BROWSE_STEP_DAYS);
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
      onInfo(res.reason);
      loadBrowse(BANK_RECONCILE_BROWSE_STEP_DAYS);
    });
  }

  function confirmLink() {
    if (!selectedInvoiceId || !kind) return;
    // Con dilazioni obbligatoria la selezione rata
    const g = groups.find((x) => x.invoiceId === selectedInvoiceId);
    if (g?.hasDilazioni && !selectedDilazioneId && step === "browse") {
      setError("Seleziona una sola dilazione (checkbox) sotto la fattura.");
      return;
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
                Importo = master. Con dilazioni si matcha la singola rata (anche
                una sola). In manuale: fattura + checkbox rate.
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
                    Preferisce ragione sociale in causale + importo identico.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={pending || row.amount === 0}
                onClick={() => {
                  setLinkMode("manual");
                  loadBrowse(BANK_RECONCILE_BROWSE_STEP_DAYS);
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
                Più voci con lo stesso importo. Seleziona quella corretta.
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
                onClick={() => {
                  setLinkMode("manual");
                  loadBrowse(BANK_RECONCILE_BROWSE_STEP_DAYS);
                }}
                className="text-xs font-medium text-sky-700 hover:underline"
              >
                Apri elenco completo per periodo
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
              <p className="text-xs text-[var(--muted)]">
                Evidenziati importi uguali a {formatEuro(Math.abs(row.amount))}.
                Con dilazioni seleziona <strong>una sola</strong> rata.
              </p>
              {groups.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-8 text-center text-sm text-[var(--muted)]">
                  Nessuna fattura in questo periodo. Espandi il range.
                </p>
              ) : (
                <ul className="space-y-3">
                  {groups.map((g) => {
                    const hit =
                      g.amountMatchFull ||
                      g.dilazioni.some((d) => d.amountMatch);
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
                            <p className="font-mono text-xs font-semibold">
                              {g.number}
                            </p>
                            <p className="font-medium text-slate-900">
                              {g.entityName}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                              Emessa:{" "}
                              {g.dataEmissione
                                ? formatDateIt(g.dataEmissione)
                                : "—"}{" "}
                              · Totale {formatEuro(g.totale)}
                            </p>
                          </div>
                          {!g.hasDilazioni ? (
                            <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name="bank-recon-pick"
                                checked={
                                  selectedInvoiceId === g.invoiceId &&
                                  !selectedDilazioneId
                                }
                                onChange={() => {
                                  setSelectedInvoiceId(g.invoiceId);
                                  setSelectedDilazioneId(null);
                                  setSelectedKey(g.invoiceId);
                                }}
                              />
                              <span
                                className={
                                  g.amountMatchFull
                                    ? "font-semibold text-emerald-800"
                                    : ""
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
                                  d.amountMatch
                                    ? "bg-emerald-100/70"
                                    : "hover:bg-slate-50"
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
                                  checked={
                                    selectedDilazioneId === d.dilazioneId
                                  }
                                  onChange={() => {
                                    setSelectedInvoiceId(g.invoiceId);
                                    setSelectedDilazioneId(d.dilazioneId);
                                    setSelectedKey(d.dilazioneId);
                                  }}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="font-medium">
                                    Rata {d.sortOrder + 1} ·{" "}
                                    {formatEuro(d.importo)}
                                    {d.amountMatch ? " · importo ok" : ""}
                                  </span>
                                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                                    Scadenza{" "}
                                    {d.dataScadenza
                                      ? formatDateIt(d.dataScadenza)
                                      : "—"}{" "}
                                    · {d.statoPagamento}
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
              )}
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Annulla
          </button>
          {step === "choice" || step === "browse" ? (
            <button
              type="button"
              disabled={pending || !selectedInvoiceId}
              onClick={confirmLink}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
            >
              <FaLink size={12} />
              {pending ? "Collegamento…" : "Conferma collegamento"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
