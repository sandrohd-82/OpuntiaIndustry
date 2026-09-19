"use client";

import { useEffect, useMemo, useState } from "react";
import { FaFile, FaFilePdf, FaTimes } from "react-icons/fa";
import {
  formatBytesTicket,
  isPdfFile,
  kindDaMime,
  type TicketFile,
} from "@/lib/strumenti/ticket";

export type TicketAnteprimaItem = {
  id: string;
  fileName: string;
  mime: string;
  fileSize: number;
  url: string | null;
  kind: "allegato" | "vocale" | "immagine";
};

export function fileToAnteprima(file: File, url: string | null): TicketAnteprimaItem {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    fileName: file.name,
    mime: file.type,
    fileSize: file.size,
    url,
    kind: kindDaMime(file.type, file.name),
  };
}

export function ticketFileToAnteprima(f: TicketFile): TicketAnteprimaItem {
  return {
    id: f.id,
    fileName: f.fileName,
    mime: f.mime,
    fileSize: f.fileSize,
    url: f.url,
    kind: kindDaMime(f.mime, f.fileName),
  };
}

function TicketFileCard({
  item,
  uploading,
  onRemove,
}: {
  item: TicketAnteprimaItem;
  uploading?: boolean;
  onRemove?: () => void;
}) {
  const pdf = isPdfFile(item.mime, item.fileName);
  const img = item.kind === "immagine";
  const audio = item.kind === "vocale";
  const size = formatBytesTicket(item.fileSize);

  return (
    <li className="relative overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-2 py-1">
        <p className="min-w-0 truncate text-xs font-medium text-slate-800">
          {item.fileName}
          {size ? <span className="ml-1 font-normal text-slate-500">{size}</span> : null}
        </p>
        {onRemove && !uploading ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-red-700"
            aria-label={`Rimuovi ${item.fileName}`}
          >
            <FaTimes size={11} />
          </button>
        ) : null}
      </div>
      <div className="relative min-h-24 bg-slate-50">
        {item.url && img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.fileName}
            className="mx-auto max-h-48 w-full object-contain"
          />
        ) : item.url && pdf ? (
          <iframe
            title={item.fileName}
            src={item.url}
            className="h-48 w-full bg-white"
          />
        ) : item.url && audio ? (
          <div className="px-2 py-3">
            <audio controls src={item.url} className="w-full" />
          </div>
        ) : item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 px-3 py-6 text-sm text-[var(--primary)] underline"
          >
            {pdf ? <FaFilePdf className="text-red-600" /> : <FaFile />}
            Apri {item.fileName}
          </a>
        ) : (
          <p className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-slate-500">
            {pdf ? <FaFilePdf className="text-red-600" /> : <FaFile />}
            {uploading ? "Caricamento anteprima…" : "Anteprima in preparazione…"}
          </p>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/75">
            <p className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white">
              Caricamento…
            </p>
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function TicketAllegatiAnteprima({
  items,
  uploading = false,
  onRemove,
}: {
  items: TicketAnteprimaItem[];
  uploading?: boolean;
  onRemove?: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <TicketFileCard
          key={item.id}
          item={item}
          uploading={uploading}
          onRemove={onRemove ? () => onRemove(item.id) : undefined}
        />
      ))}
    </ul>
  );
}

export function useObjectUrls(files: File[]): string[] {
  const [urls, setUrls] = useState<string[]>([]);
  const key = useMemo(
    () => files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|"),
    [files]
  );
  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setUrls(next);
    return () => {
      next.forEach((u) => URL.revokeObjectURL(u));
    };
    // key riassume nome/size/data dei file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
