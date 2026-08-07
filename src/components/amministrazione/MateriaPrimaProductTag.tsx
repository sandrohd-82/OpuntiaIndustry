"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FaXmark } from "react-icons/fa6";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import {
  CODICE_MATERIA_PRIMA_PREFIX,
  type MateriaPrima,
} from "@/lib/amministrazione/materie-prime";

type BioContext = {
  certificato?: string;
  codice?: string;
};

type Props = {
  code: string;
  materia?: MateriaPrima | null;
  bioContext?: BioContext;
  removable?: boolean;
  onRemove?: () => void;
};

function SchedaContent({
  code,
  materia,
  bioContext,
}: {
  code: string;
  materia?: MateriaPrima | null;
  bioContext?: BioContext;
}) {
  const isBio = Boolean(materia?.isBio);
  const cert = bioContext?.certificato?.trim() ?? "";
  const bioCodice = bioContext?.codice?.trim() ?? "";

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Codice
        </p>
        <div className="mt-1">
          <CodiceTargaBadge
            code={materia?.codice ?? code}
            fixedPrefix={CODICE_MATERIA_PRIMA_PREFIX}
          />
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Nome
        </p>
        <p className="mt-1 text-sm font-medium">
          {materia?.nome || "Scheda non trovata"}
        </p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Tipologia
        </p>
        <p className="mt-1 text-sm">
          {materia ? (
            isBio ? (
              <span className="font-medium text-emerald-700">Prodotto bio</span>
            ) : (
              <span className="text-[var(--muted)]">Prodotto convenzionale</span>
            )
          ) : (
            <span className="text-[var(--muted)]">—</span>
          )}
        </p>
      </div>
      {materia?.note ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Note
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
            {materia.note}
          </p>
        </div>
      ) : null}
      {isBio && (cert || bioCodice) ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs">
          <p className="font-medium text-emerald-900">
            Certificato fornitore
          </p>
          {cert ? (
            <p className="mt-1 text-emerald-900/90">Certificato: {cert}</p>
          ) : null}
          {bioCodice ? (
            <p className="mt-0.5 text-emerald-900/90">
              Codice bio: {bioCodice}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SchedaDialog({
  open,
  onClose,
  titleId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  titleId: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h3 id={titleId} className="text-base font-semibold">
            Scheda materia prima
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi"
            className="rounded-md p-1 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-900"
          >
            <FaXmark size={14} />
          </button>
        </div>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}

export function MateriaPrimaProductTag({
  code,
  materia,
  bioContext,
  removable = false,
  onRemove,
}: Props) {
  const titleId = useId();
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const closeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = useCallback(() => {
    if (closeHoverTimer.current) {
      clearTimeout(closeHoverTimer.current);
      closeHoverTimer.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    clearHoverTimer();
    closeHoverTimer.current = setTimeout(() => setHoverOpen(false), 120);
  }, [clearHoverTimer]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  return (
    <>
      <span
        ref={wrapRef}
        className="relative inline-flex"
        onMouseEnter={() => {
          clearHoverTimer();
          setHoverOpen(true);
        }}
        onMouseLeave={scheduleHoverClose}
      >
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 font-mono text-xs font-semibold tracking-wide ring-1 ring-[var(--border)] transition hover:bg-slate-50 hover:ring-slate-300"
          aria-haspopup="dialog"
        >
          {code}
          {materia?.isBio ? (
            <span className="rounded bg-emerald-100 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
              Bio
            </span>
          ) : null}
        </button>
        {removable && onRemove ? (
          <button
            type="button"
            aria-label={`Rimuovi ${code}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="-ml-1 inline-flex items-center rounded-full p-1 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-900"
          >
            <FaXmark size={11} />
          </button>
        ) : null}

        {hoverOpen && !dialogOpen ? (
          <div
            role="tooltip"
            className="absolute left-0 top-full z-[75] mt-1.5 w-72 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-lg"
            onMouseEnter={clearHoverTimer}
            onMouseLeave={scheduleHoverClose}
          >
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              Scheda prodotto
            </p>
            <SchedaContent
              code={code}
              materia={materia}
              bioContext={bioContext}
            />
          </div>
        ) : null}
      </span>

      <SchedaDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        titleId={titleId}
      >
        <SchedaContent code={code} materia={materia} bioContext={bioContext} />
      </SchedaDialog>
    </>
  );
}
