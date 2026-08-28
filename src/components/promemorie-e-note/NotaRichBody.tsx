"use client";

import { FaFileLines, FaFilm, FaLink } from "react-icons/fa6";
import { ShippingTrackingCard } from "@/components/shipping/ShippingTrackingCard";
import type { PnNotaAllegato } from "@/lib/promemorie-e-note/types";
import { isTrackingAllegato } from "@/lib/shipping/tracking";

type Props = {
  body?: string;
  bodyRich?: string;
  allegati?: PnNotaAllegato[];
  className?: string;
  /** Anteprima più compatta (timeline) */
  compact?: boolean;
};

type Seg =
  | { kind: "text"; text: string }
  | { kind: "link"; label: string; url: string };

const MD_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function splitRich(rich: string): Seg[] {
  const out: Seg[] = [];
  const re = new RegExp(MD_LINK_RE.source, "g");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rich))) {
    if (m.index > last) {
      out.push({ kind: "text", text: rich.slice(last, m.index) });
    }
    out.push({ kind: "link", label: m[1], url: m[2] });
    last = m.index + m[0].length;
  }
  if (last < rich.length) out.push({ kind: "text", text: rich.slice(last) });
  if (out.length === 0) out.push({ kind: "text", text: rich || "" });
  return out;
}

function isImageAllegato(a: PnNotaAllegato): boolean {
  const k = (a.kind || "").toLowerCase();
  if (k === "image" || k.startsWith("image")) return true;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(a.label || a.url);
}

function isVideoAllegato(a: PnNotaAllegato): boolean {
  const k = (a.kind || "").toLowerCase();
  if (k === "video" || k.startsWith("video")) return true;
  return /\.(mp4|webm|mov|avi)$/i.test(a.label || a.url);
}

function isPdfAllegato(a: PnNotaAllegato): boolean {
  const mimeHint = (a.kind || "").toLowerCase();
  if (mimeHint.includes("pdf")) return true;
  return /\.pdf$/i.test(a.label || a.url);
}

/**
 * Corpo nota con link cliccabili + anteprima allegati (img / video / pdf / doc).
 */
export function NotaRichBody({
  body = "",
  bodyRich = "",
  allegati = [],
  className = "",
  compact = false,
}: Props) {
  const rich = (bodyRich || body || "").trim();
  const segs = splitRich(rich);

  return (
    <div className={className}>
      {rich ? (
        <div
          className={`whitespace-pre-wrap text-sm text-slate-800 ${
            compact ? "text-xs" : ""
          }`}
        >
          {segs.map((s, i) =>
            s.kind === "text" ? (
              <span key={i}>{s.text}</span>
            ) : (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
              >
                <FaLink size={10} className="shrink-0 opacity-70" />
                {s.label}
              </a>
            )
          )}
        </div>
      ) : null}

      {allegati.length > 0 ? (
        <ul
          className={`mt-2 grid gap-2 ${
            compact
              ? "grid-cols-1"
              : "grid-cols-1 sm:grid-cols-2"
          }`}
        >
          {allegati.map((a) => (
            <li
              key={a.id}
              className={isTrackingAllegato(a.kind) ? "sm:col-span-2" : undefined}
            >
              {isTrackingAllegato(a.kind) ? (
                <ShippingTrackingCard
                  trackingId={a.id}
                  compact={compact}
                  autoCheck
                />
              ) : (
                <NotaAllegatoPreview allegato={a} compact={compact} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function NotaAllegatoPreview({
  allegato: a,
  compact = false,
  onRemove,
}: {
  allegato: PnNotaAllegato;
  compact?: boolean;
  onRemove?: () => void;
}) {
  if (isTrackingAllegato(a.kind)) {
    return (
      <div className="space-y-1">
        <ShippingTrackingCard trackingId={a.id} compact={compact} autoCheck />
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="text-[10px] text-red-600 hover:underline"
          >
            Rimuovi tracking dalla nota
          </button>
        ) : null}
      </div>
    );
  }

  const imgH = compact ? "h-28" : "h-40";

  if (isImageAllegato(a)) {
    return (
      <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <a href={a.url} target="_blank" rel="noopener noreferrer">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.label || "Immagine"}
            className={`w-full ${imgH} object-cover`}
          />
        </a>
        <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-slate-600">
          <span className="truncate">{a.label || "Immagine"}</span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 text-red-600 hover:underline"
            >
              Rimuovi
            </button>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  if (isVideoAllegato(a)) {
    return (
      <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <video
          src={a.url}
          controls
          className={`w-full ${imgH} bg-slate-900 object-contain`}
        />
        <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-slate-600">
          <span className="inline-flex items-center gap-1 truncate">
            <FaFilm size={10} />
            {a.label || "Video"}
          </span>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 text-red-600 hover:underline"
            >
              Rimuovi
            </button>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  if (isPdfAllegato(a)) {
    return (
      <figure className="overflow-hidden rounded-lg border border-[var(--border)] bg-white">
        <iframe
          title={a.label || "PDF"}
          src={a.url}
          className={`w-full border-0 ${compact ? "h-36" : "h-48"} bg-slate-50`}
        />
        <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-[10px] text-slate-600">
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-sky-700 hover:underline"
          >
            {a.label || "Documento PDF"}
          </a>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="shrink-0 text-red-600 hover:underline"
            >
              Rimuovi
            </button>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  return (
    <a
      href={a.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs text-slate-800 hover:bg-slate-50"
    >
      <FaFileLines className="shrink-0 text-slate-500" size={16} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {a.label || "Documento"}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="shrink-0 text-[10px] text-red-600 hover:underline"
        >
          Rimuovi
        </button>
      ) : (
        <span className="shrink-0 text-[10px] text-sky-700">Apri</span>
      )}
    </a>
  );
}
