"use client";

import { useEffect, useId, useState } from "react";
import {
  FaCheck,
  FaCloudArrowUp,
  FaFile,
  FaFileImage,
  FaFilePdf,
} from "react-icons/fa6";

export const ORGANIGRAMMA_FILE_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp";

type Props = {
  accept?: string;
  disabled?: boolean;
  busy?: boolean;
  compact?: boolean;
  file?: File | null;
  title?: string;
  hint?: string;
  readyCaption?: string;
  /** Sfondo foto (es. operatore). Con variant="photo" le scritte appaiono solo in hover. */
  coverUrl?: string | null;
  variant?: "default" | "photo";
  onFile: (file: File) => void;
  onInvalid?: (message: string) => void;
};

function isAccepted(file: File, accept: string): boolean {
  const tokens = accept.split(",").map((s) => s.trim().toLowerCase());
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((t) => {
    if (t.startsWith(".")) return name.endsWith(t);
    if (t.endsWith("/*")) return type.startsWith(t.slice(0, -1));
    return type === t;
  });
}

function FileKindIcon({ file }: { file: File }) {
  const pdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (pdf) return <FaFilePdf className="shrink-0 text-red-600" size={20} />;
  if (file.type.startsWith("image/")) {
    return <FaFileImage className="shrink-0 text-sky-600" size={20} />;
  }
  return <FaFile className="shrink-0 text-slate-500" size={20} />;
}

export function FileDropZone({
  accept = ORGANIGRAMMA_FILE_ACCEPT,
  disabled = false,
  busy = false,
  compact = false,
  file = null,
  title = "Trascina qui il file",
  hint = "PDF, JPG, PNG, WebP · max 15 MB",
  readyCaption = "in bozza, premi Salva",
  coverUrl = null,
  variant = "default",
  onFile,
  onInvalid,
}: Props) {
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !file.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function take(files: FileList | null) {
    const next = files?.[0];
    if (!next || disabled || busy) return;
    if (!isAccepted(next, accept)) {
      onInvalid?.(
        accept.includes("application/pdf")
          ? "Formato ammesso: PDF, JPG, PNG, WebP."
          : "Formato ammesso: JPG, PNG, WebP."
      );
      return;
    }
    onFile(next);
  }

  const locked = disabled || busy;
  const photoSrc = previewUrl ?? coverUrl ?? null;
  const isPhoto = variant === "photo";

  if (isPhoto) {
    return (
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!locked) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!locked) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          take(e.dataTransfer.files);
        }}
        className={`group relative block h-44 w-44 shrink-0 cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed transition ${
          locked
            ? "cursor-wait"
            : dragOver
              ? "border-emerald-500 shadow-md shadow-emerald-100"
              : file
                ? "border-emerald-400"
                : "border-slate-300 hover:border-[var(--primary)]"
        } ${photoSrc ? "bg-slate-200" : "bg-gradient-to-b from-slate-50 to-white"}`}
      >
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center transition ${
            dragOver || busy
              ? "bg-slate-950/55 opacity-100"
              : "bg-slate-950/50 opacity-0 group-hover:opacity-100"
          }`}
        >
          {busy ? (
            <span className="text-xs font-medium text-white">Salvataggio…</span>
          ) : (
            <>
              <span className="text-sm font-semibold text-white">
                {title === "Trascina qui il file" ? "Trascina qui la foto" : title}
              </span>
              <span className="text-xs text-white/90">
                oppure{" "}
                <span className="font-semibold underline decoration-2 underline-offset-2">
                  scegli dal computer
                </span>
              </span>
              <span className="mt-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium text-white">
                {hint}
              </span>
            </>
          )}
        </span>
        <input
          id={inputId}
          type="file"
          accept={accept}
          disabled={locked}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </label>
    );
  }

  return (
    <label
      htmlFor={inputId}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!locked) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!locked) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        take(e.dataTransfer.files);
      }}
      className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed text-center transition ${
        compact ? "gap-2 px-3 py-4" : "gap-3 px-6 py-8"
      } ${
        locked
          ? "cursor-wait opacity-70"
          : dragOver
            ? "border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-100"
            : file
              ? "border-emerald-400 bg-gradient-to-b from-emerald-50 to-white"
              : "border-slate-300 bg-gradient-to-b from-slate-50 to-white hover:border-[var(--primary)] hover:from-sky-50/80 hover:to-white"
      }`}
    >
      <span
        className={`flex items-center justify-center rounded-2xl shadow-sm transition ${
          compact ? "h-11 w-11" : "h-14 w-14"
        } ${
          file
            ? "bg-emerald-600 text-white"
            : "bg-white text-slate-500 ring-1 ring-slate-200 group-hover:text-[var(--primary)]"
        }`}
      >
        {file ? (
          <FaCheck size={compact ? 18 : 22} />
        ) : (
          <FaCloudArrowUp size={compact ? 20 : 26} />
        )}
      </span>
      {file ? (
        <>
          <div className="flex max-w-full items-center gap-2 rounded-lg bg-white/90 px-3 py-2 ring-1 ring-emerald-200">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt=""
                className="h-10 w-10 shrink-0 rounded-md object-cover ring-1 ring-slate-200"
              />
            ) : (
              <FileKindIcon file={file} />
            )}
            <div className="min-w-0 text-left">
              <p className="truncate text-sm font-semibold text-slate-900">
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {file.size >= 1024 * 1024
                  ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
                  : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                {busy ? " · salvataggio…" : ` · ${readyCaption}`}
              </p>
            </div>
          </div>
          <p className="text-xs font-medium text-emerald-800">
            {busy
              ? "Salvataggio in corso…"
              : "Clicca o trascina un altro file per sostituirlo. Poi premi Salva."}
          </p>
        </>
      ) : (
        <>
          <div>
            <p
              className={`font-semibold text-slate-900 ${
                compact ? "text-sm" : "text-base"
              }`}
            >
              {title}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              oppure{" "}
              <span className="font-semibold text-[var(--primary)] underline decoration-2 underline-offset-2">
                scegli dal computer
              </span>
            </p>
          </div>
          <p className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-600">
            {hint}
          </p>
        </>
      )}
      <input
        id={inputId}
        type="file"
        accept={accept}
        disabled={locked}
        className="sr-only"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
