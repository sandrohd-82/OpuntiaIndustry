"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
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
  height: number;
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
    <div className="space-y-2.5">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
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
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Nome
        </p>
        <p className="mt-0.5 text-sm font-medium">
          {materia?.nome || "Scheda non trovata"}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
          Tipologia
        </p>
        <p className="mt-0.5 text-sm">
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
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
            Note
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">
            {materia.note}
          </p>
        </div>
      ) : null}
      {isBio && (hasPdf || bioCodice) ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 text-xs">
          <p className="font-medium text-emerald-900">Certificato fornitore</p>
          {bioCodice ? (
            <p className="mt-1 text-emerald-900/90">Codice bio: {bioCodice}</p>
          ) : null}
          {hasPdf ? (
            <p className="mt-0.5 text-emerald-900/90">PDF certificato caricato</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FumettoPortal({
  open,
  anchor,
  titleId,
  onClose,
  ignoreRoot,
  children,
}: {
  open: boolean;
  anchor: AnchorRect | null;
  titleId: string;
  onClose: () => void;
  /** Elemento ancora (targa): i click qui non chiudono il fumetto. */
  ignoreRoot: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});
  const [placeAbove, setPlaceAbove] = useState(false);
  const [caretLeft, setCaretLeft] = useState(24);

  useLayoutEffect(() => {
    if (!open || !anchor) return;

    const gap = 10;
    const width = 288;
    const viewportPad = 8;
    const panelHeight = panelRef.current?.offsetHeight ?? 240;

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.min(left, window.innerWidth - width - viewportPad);
    left = Math.max(viewportPad, left);

    const spaceBelow = window.innerHeight - anchor.bottom - gap;
    const above =
      spaceBelow < panelHeight && anchor.top > panelHeight + gap;

    const top = above
      ? Math.max(viewportPad, anchor.top - panelHeight - gap)
      : Math.min(anchor.bottom + gap, window.innerHeight - viewportPad - 40);

    const anchorCenter = anchor.left + anchor.width / 2;
    const caret = Math.min(width - 28, Math.max(20, anchorCenter - left));

    setPlaceAbove(above);
    setCaretLeft(caret);
    setStyle({
      position: "fixed",
      top,
      left,
      width,
      zIndex: 300,
    });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointerDown(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (ignoreRoot.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose, ignoreRoot]);

  if (!open || !anchor || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      style={style}
      className="rounded-2xl border border-slate-300 bg-white p-3.5 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
    >
      {/* Coda del fumetto */}
      <span
        aria-hidden
        className={`pointer-events-none absolute h-3 w-3 rotate-45 border-slate-300 bg-white ${
          placeAbove
            ? "bottom-[-6px] border-b border-r"
            : "top-[-6px] border-l border-t"
        }`}
        style={{ left: caretLeft }}
      />
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3
          id={titleId}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]"
        >
          Scheda prodotto
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="rounded-md p-0.5 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-900"
        >
          <FaXmark size={12} />
        </button>
      </div>
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
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<AnchorRect | null>(null);

  const updateAnchor = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAnchor({
      top: rect.top,
      left: rect.left,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onScrollOrResize() {
      updateAnchor();
    }
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, updateAnchor]);

  return (
    <>
      <span ref={wrapRef} className="relative inline-flex items-center gap-0.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            updateAnchor();
            setOpen((v) => !v);
          }}
          className="font-mono text-xs font-semibold tracking-wide text-slate-800 underline decoration-slate-300 underline-offset-2 transition hover:text-[var(--primary)] hover:decoration-[var(--primary)]"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Dettagli prodotto"
        >
          {code}
        </button>
        {removable && onRemove ? (
          <button
            type="button"
            aria-label={`Rimuovi ${code}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="inline-flex items-center rounded-full p-1 text-[var(--muted)] hover:bg-slate-100 hover:text-slate-900"
          >
            <FaXmark size={11} />
          </button>
        ) : null}
      </span>

      <FumettoPortal
        open={open}
        anchor={anchor}
        titleId={titleId}
        onClose={close}
        ignoreRoot={wrapRef}
      >
        <SchedaContent code={code} materia={materia} bioContext={bioContext} />
      </FumettoPortal>
    </>
  );
}
