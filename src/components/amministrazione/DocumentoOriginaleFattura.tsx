"use client";

import { useRef, useState } from "react";
import {
  apriDocumentoOriginaleFatturaAction,
  caricaDocumentoOriginaleFatturaAction,
} from "@/app/actions/fatture";
import type { FatturaAllegatoMeta } from "@/lib/amministrazione/fatture";

type Props = {
  fatturaId: string;
  allegato: FatturaAllegatoMeta | null | undefined;
  onChanged: (allegato: FatturaAllegatoMeta) => void;
};

export function DocumentoOriginaleFattura({
  fatturaId,
  allegato,
  onChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<"apri" | "carica" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const presente = Boolean(allegato?.storagePath);
  const busy = fase != null;

  async function apri() {
    setErrore(null);
    setFase("apri");
    try {
      const res = await apriDocumentoOriginaleFatturaAction(fatturaId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      window.open(res.url, "_blank", "noopener,noreferrer");
    } finally {
      setFase(null);
    }
  }

  async function carica(file: File) {
    setErrore(null);
    setFase("carica");
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await caricaDocumentoOriginaleFatturaAction(fatturaId, body);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      onChanged({ storagePath: res.storagePath, fileName: res.fileName });
    } finally {
      setFase(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void carica(file);
        }}
      />
      {presente ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void apri()}
          className="inline-flex items-center rounded-lg border border-[var(--border)] bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && fase === "apri" ? "Apertura…" : "Apri documento originale"}
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center rounded-lg border border-[var(--primary)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && fase === "carica" ? "Caricamento…" : "Carica documento originale"}
        </button>
      )}
      {presente ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="text-xs font-medium text-[var(--muted)] hover:text-slate-800 disabled:opacity-50"
        >
          {fase === "carica" ? "Caricamento…" : "Sostituisci"}
        </button>
      ) : null}
      {errore ? (
        <span className="text-xs text-rose-700">{errore}</span>
      ) : null}
    </div>
  );
}
