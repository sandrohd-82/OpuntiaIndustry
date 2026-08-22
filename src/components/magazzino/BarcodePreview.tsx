"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  value: string;
  /** Code 128 lineare o QR */
  format?: "code128" | "qrcode";
  /** Scala bwip-js (default 2 lineare / 3 QR) */
  scale?: number;
  /** Nasconde il testo sotto il canvas (utile in elenchi) */
  compact?: boolean;
  className?: string;
};

export function BarcodePreview({
  value,
  format = "code128",
  scale,
  compact = false,
  className = "",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const text = value.trim();
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!text) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      setError(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const bwip = await import("bwip-js");
        const toCanvas =
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bwip as any).toCanvas ?? (bwip as any).default?.toCanvas;
        if (typeof toCanvas !== "function") {
          throw new Error("bwip-js toCanvas non disponibile.");
        }
        // Non passare height/includetext per QR: bwip-js rifiuta undefined
        // (bwipp.invalidOptionType: height: not a realtype).
        const resolvedScale =
          scale ?? (format === "qrcode" ? 3 : 2);
        const opts =
          format === "qrcode"
            ? { bcid: "qrcode" as const, text, scale: resolvedScale }
            : {
                bcid: "code128" as const,
                text,
                scale: resolvedScale,
                height: compact ? 10 : 14,
                includetext: !compact,
                textxalign: "center" as const,
              };
        await toCanvas(canvas, opts);
        if (!cancelled) setError(null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Rendering barcode fallito.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, format, scale, compact]);

  return (
    <div className={className}>
      <canvas
        ref={canvasRef}
        className={`mx-auto max-w-full rounded border border-[var(--border)] bg-white ${
          compact ? "p-1.5" : "p-3"
        }`}
      />
      {error ? (
        <p className="mt-2 text-center text-xs text-red-700">{error}</p>
      ) : null}
      {!compact ? (
        value.trim() ? (
          <p className="mt-2 break-all text-center font-mono text-xs text-slate-800">
            {value.trim()}
          </p>
        ) : (
          <p className="mt-2 text-center text-xs text-[var(--muted)]">
            Anteprima barcode
          </p>
        )
      ) : null}
    </div>
  );
}
