"use client";

import { useRef, useState } from "react";
import { FaCamera, FaFilePdf, FaImage } from "react-icons/fa6";
import { uploadIngressoMpFileAction } from "@/app/actions/produzione-ingresso-mp";

type Props = {
  kind: string;
  ownerId: string;
  acceptPdf?: boolean;
  previewUrl?: string | null;
  fileName?: string | null;
  /** Anteprima locale, nessun upload su storage. */
  testMode?: boolean;
  /** Box di anteprima cliccabile (DDT) oppure pulsanti (foto mezzo). */
  variant?: "buttons" | "previewBox";
  disabled?: boolean;
  onUploaded: (path: string, fileName: string, url: string) => void;
};

function isPdfPreview(url: string | null | undefined, fileName?: string | null) {
  if (fileName?.toLowerCase().endsWith(".pdf")) return true;
  const raw = (url ?? "").toLowerCase();
  return raw.includes(".pdf") || raw.includes("application/pdf");
}

export function IngressoMpFotoPicker({
  kind,
  ownerId,
  acceptPdf,
  previewUrl,
  fileName,
  testMode = false,
  variant = "buttons",
  disabled = false,
  onUploaded,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    if (disabled) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > 8 * 1024 * 1024) {
        setError("File troppo grande (max 8 MB).");
        return;
      }
      const mime = file.type || "application/octet-stream";
      const ok = mime.startsWith("image/") || mime === "application/pdf";
      if (!ok) {
        setError("Consentiti immagini o PDF.");
        return;
      }
      if (testMode) {
        const url = URL.createObjectURL(file);
        onUploaded(`test://${kind}/${ownerId}/${file.name}`, file.name, url);
        return;
      }
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      fd.set("ownerId", ownerId);
      const res = await uploadIngressoMpFileAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onUploaded(res.path, res.fileName, res.url);
    } finally {
      setBusy(false);
    }
  }

  const inputs = (
    <>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />
      <input
        ref={fileRef}
        type="file"
        accept={acceptPdf ? "image/*,application/pdf" : "image/*"}
        className="hidden"
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />
    </>
  );

  if (variant === "previewBox") {
    const hasPreview = Boolean(previewUrl);
    const pdf = isPdfPreview(previewUrl, fileName);
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <div
            className={`relative h-28 w-40 shrink-0 overflow-hidden rounded-lg border ${
              hasPreview
                ? "border-[var(--border)] bg-slate-100"
                : "border-dashed border-slate-300 bg-slate-50"
            }`}
          >
            {hasPreview && previewUrl && !pdf ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={fileName || "Anteprima DDT"}
                className="h-full w-full object-cover"
              />
            ) : null}
            {hasPreview && previewUrl && pdf ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 px-2 text-center">
                <FaFilePdf size={22} className="text-red-600" />
                <p className="max-w-full truncate text-[11px] font-medium">
                  {fileName || "PDF"}
                </p>
              </div>
            ) : null}
            {!hasPreview ? (
              <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                <p className="text-[11px] font-semibold text-slate-700">
                  Anteprima DDT
                </p>
              </div>
            ) : null}
            {hasPreview && previewUrl ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="absolute inset-0"
                aria-label="Apri anteprima DDT"
              />
            ) : null}
          </div>
          {!disabled ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => camRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                <FaCamera size={14} />
                {busy ? "Caricamento…" : "Scatta foto"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                <FaImage size={14} />
                {hasPreview ? "Sostituisci file" : "Carica file"}
              </button>
            </div>
          ) : null}
        </div>
        {inputs}
        {error ? <p className="text-xs text-red-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => camRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <FaCamera size={14} />
          Scatta foto
        </button>
        <button
          type="button"
          disabled={busy || disabled}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          <FaImage size={14} />
          Scegli file
        </button>
      </div>
      {inputs}
      {previewUrl ? (
        isPdfPreview(previewUrl, fileName) ? (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="block text-sm text-[var(--primary)] underline"
          >
            Apri documento caricato
          </a>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt=""
            className="max-h-40 rounded-lg border border-[var(--border)] object-cover"
          />
        )
      ) : null}
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
