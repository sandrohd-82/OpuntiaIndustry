"use client";

import { useRef, useState } from "react";
import { FaCamera, FaImage } from "react-icons/fa6";
import { uploadIngressoMpFileAction } from "@/app/actions/produzione-ingresso-mp";

type Props = {
  kind: string;
  ownerId: string;
  acceptPdf?: boolean;
  previewUrl?: string | null;
  onUploaded: (path: string, fileName: string, url: string) => void;
};

export function IngressoMpFotoPicker({
  kind,
  ownerId,
  acceptPdf,
  previewUrl,
  onUploaded,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => camRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <FaCamera size={14} />
          Scatta foto
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        >
          <FaImage size={14} />
          Scegli file
        </button>
      </div>
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
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
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />
      {previewUrl ? (
        previewUrl.toLowerCase().includes(".pdf") ||
        previewUrl.includes("application/pdf") ? (
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
