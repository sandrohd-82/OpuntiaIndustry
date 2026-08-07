"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import {
  CODICE_MATERIA_PRIMA_PREFIX,
  type MateriaPrima,
} from "@/lib/amministrazione/materie-prime";

type BioContext = {
  certificatoPath?: string;
  codice?: string;
  hasPdf?: boolean;
};

type Props = {
  code: string;
  materia?: MateriaPrima | null;
  bioContext?: BioContext;
  removable?: boolean;
  onRemove?: () => void;
};

type AnchorRect = {
  top: number;
  left: number;
  bottom: number;
  width: number;
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
  const hasPdf = Boolean(bioContext?.hasPdf || bioContext?.certificatoPath);
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
      {isBio && (hasPdf || bioCodice) ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs">
          <p className="font-medium text-emerald-900">
            Certificato fornitore
          </p>
          {bioCodice ? (
            <p className="mt-1 text-emerald-900/90">
              Codice bio: {bioCodice}
            </p>
          ) : null}
          {hasPdf ? (
            <p className="mt-0.5 text-emerald-900/90">PDF certificato caricato</p>
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

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/50 p-4"
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
    </div>,
    document.body
  );
}

function HoverSchedaPortal({
  open,
  anchor,
  onEnter,
  onLeave,
  children,
}: {
  open: boolean;
  anchor: AnchorRect | null;
  onEnter: () => void;
  onLeave: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchor) return;

    const gap = 8;
    const width = 288;
    const viewportPad = 8;
    const panelHeight = panelRef.current?.offsetHeight ?? 220;

    let left = anchor.left;
    left = Math.min(left, window.innerWidth - width - viewportPad);
    left = Math.max(viewportPad, left);

    const spaceBelow = window.innerHeight - anchor.bottom - gap;
    const placeAbove = spaceBelow < panelHeight && anchor.top > panelHeight + gap;

    const top = placeAbove
      ? Math.max(viewportPad, anchor.top - panelHeight - gap)
      : Math.min(anchor.bottom + gap, window.innerHeight - viewportPad - 40);

    setStyle({
      position: "fixed",
      top,
      left,
      width,
      zIndex: 300,
    });
  }, [open, anchor]);

  if (!open || !anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="tooltip"
      style={style}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 shadow-2xl"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Scheda prodotto
      </p>
      {children}
    </div>,
    document.body
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
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);
  const closeHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateAnchor = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      width: rect.width,
    });
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (closeHoverTimer.current) {
      clearTimeout(closeHoverTimer.current);
      closeHoverTimer.current = null;
    }
  }, []);

  const scheduleHoverClose = useCallback(() => {
    clearHoverTimer();
    closeHoverTimer.current = setTimeout(() => setHoverOpen(false), 140);
  }, [clearHoverTimer]);

  useEffect(() => () => clearHoverTimer(), [clearHoverTimer]);

  useEffect(() => {
    if (!hoverOpen) return;
    function onScrollOrResize() {
      updateAnchor();
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [hoverOpen, updateAnchor]);

  return (
    <>
      <span
        ref={wrapRef}
        className="relative inline-flex"
        onMouseEnter={() => {
          clearHoverTimer();
          updateAnchor();
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
      </span>

      <HoverSchedaPortal
        open={hoverOpen && !dialogOpen}
        anchor={anchor}
        onEnter={clearHoverTimer}
        onLeave={scheduleHoverClose}
      >
        <SchedaContent
          code={code}
          materia={materia}
          bioContext={bioContext}
        />
      </HoverSchedaPortal>

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
