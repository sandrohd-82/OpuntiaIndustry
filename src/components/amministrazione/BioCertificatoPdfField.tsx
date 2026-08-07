"use client";

import { useEffect, useId, useState } from "react";
import { FaFilePdf, FaTrash, FaUpload } from "react-icons/fa6";
import { getBioCertificatoSignedUrlAction } from "@/app/actions/fornitori";

type Props = {
  /** Path Storage già salvato. */
  existingPath?: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  markedForRemoval: boolean;
  onMarkedForRemovalChange: (remove: boolean) => void;
};

export function BioCertificatoPdfField({
  existingPath = "",
  file,
  onFileChange,
  markedForRemoval,
  onMarkedForRemovalChange,
}: Props) {
  const inputId = useId();
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    if (!file) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (file || markedForRemoval || !existingPath) {
      setRemoteUrl(null);
      setRemoteError(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingRemote(true);
      const result = await getBioCertificatoSignedUrlAction(existingPath);
      if (cancelled) return;
      if (result.success) {
        setRemoteUrl(result.url);
        setRemoteError(null);
      } else {
        setRemoteUrl(null);
        setRemoteError(result.error);
      }
      setLoadingRemote(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [existingPath, file, markedForRemoval]);

  const previewUrl = localPreviewUrl ?? remoteUrl;
  const hasExisting = Boolean(existingPath) && !markedForRemoval && !file;

  function onPick(files: FileList | null) {
    const next = files?.[0] ?? null;
    if (!next) return;
    if (next.type !== "application/pdf") {
      setRemoteError("Seleziona un file PDF.");
      return;
    }
    onMarkedForRemovalChange(false);
    onFileChange(next);
    setRemoteError(null);
  }

  return (
    <div className="space-y-2">
      <span className="block text-sm font-medium">Certificato bio (PDF)</span>
      <p className="text-xs text-[var(--muted)]">
        Carica il PDF del certificato. Verrà salvato insieme ai dati aziendali.
      </p>

      <label
        htmlFor={inputId}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-slate-50/80 px-4 py-5 text-center hover:bg-slate-50"
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          onPick(e.dataTransfer.files);
        }}
      >
        <FaUpload className="text-[var(--muted)]" size={18} />
        <span className="text-sm font-medium">
          Trascina qui il PDF oppure clicca per selezionarlo
        </span>
        <span className="text-xs text-[var(--muted)]">Max 10 MB · solo PDF</span>
        <input
          id={inputId}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {(previewUrl || loadingRemote || hasExisting || file) && (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
            <div className="flex min-w-0 items-center gap-2 text-xs font-medium">
              <FaFilePdf className="shrink-0 text-red-600" size={14} />
              <span className="truncate">
                {file?.name ||
                  (hasExisting ? "Certificato bio salvato" : "Anteprima PDF")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  Apri
                </a>
              )}
              <button
                type="button"
                onClick={() => {
                  onFileChange(null);
                  if (existingPath) onMarkedForRemovalChange(true);
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
              >
                <FaTrash size={11} />
                Rimuovi
              </button>
            </div>
          </div>
          <div className="bg-slate-100">
            {loadingRemote ? (
              <p className="px-3 py-10 text-center text-xs text-[var(--muted)]">
                Caricamento anteprima…
              </p>
            ) : previewUrl ? (
              <iframe
                title="Anteprima certificato bio"
                src={previewUrl}
                className="h-64 w-full bg-white"
              />
            ) : (
              <p className="px-3 py-10 text-center text-xs text-[var(--muted)]">
                Anteprima non disponibile
              </p>
            )}
          </div>
        </div>
      )}

      {markedForRemoval && !file && (
        <p className="text-xs text-amber-800">
          Il certificato verrà rimosso al salvataggio.
        </p>
      )}
      {remoteError && (
        <p className="text-xs text-red-600">{remoteError}</p>
      )}
    </div>
  );
}
