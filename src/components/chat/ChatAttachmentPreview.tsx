"use client";

import { useEffect, useMemo, useState } from "react";
import { FaFileLines, FaFilePdf } from "react-icons/fa6";
import {
  isLikelyImageFile,
  isLikelyPdfFile,
  isLikelyVideoFile,
} from "@/lib/chat/media-preview";

type Props = {
  fileUrl: string;
  fileType?: string | null;
  fileName?: string | null;
  mine?: boolean;
};

async function renderPdfFirstPage(url: string): Promise<string | null> {
  const pdfjs = await import("pdfjs-dist");
  // Worker da CDN allineato alla versione del pacchetto
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({
    url,
    withCredentials: false,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.25 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/jpeg", 0.82);
}

export function ChatAttachmentPreview({
  fileUrl,
  fileType,
  fileName,
  mine = false,
}: Props) {
  const isVideo = isLikelyVideoFile(fileType, fileName);
  const isImage = !isVideo && isLikelyImageFile(fileType, fileName, fileUrl);
  const isPdf = !isVideo && !isImage && isLikelyPdfFile(fileType, fileName, fileUrl);
  const [pdfThumb, setPdfThumb] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(false);
    void (async () => {
      try {
        const dataUrl = await renderPdfFirstPage(fileUrl);
        if (cancelled) return;
        if (!dataUrl) setPdfError(true);
        else setPdfThumb(dataUrl);
      } catch {
        if (!cancelled) setPdfError(true);
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPdf, fileUrl]);

  const label = useMemo(
    () => fileName?.trim() || (isPdf ? "Documento PDF" : "Allegato"),
    [fileName, isPdf]
  );

  const frame = mine
    ? "mt-1.5 overflow-hidden rounded-lg border border-white/25 bg-white/10"
    : "mt-1.5 overflow-hidden rounded-lg border border-slate-200 bg-white";

  if (isVideo) {
    return (
      <div className={frame}>
        <video
          controls
          src={fileUrl}
          className="max-h-56 w-full bg-black object-contain"
        />
        {fileName ? (
          <p
            className={`truncate px-2 py-1 text-[10px] ${
              mine ? "text-white/70" : "text-slate-500"
            }`}
          >
            {fileName}
          </p>
        ) : null}
      </div>
    );
  }

  if (isImage) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className={`${frame} block`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={label}
          className="max-h-56 w-full object-cover"
          loading="lazy"
        />
        {fileName ? (
          <p
            className={`truncate px-2 py-1 text-[10px] ${
              mine ? "text-white/70" : "text-slate-500"
            }`}
          >
            {fileName}
          </p>
        ) : null}
      </a>
    );
  }

  if (isPdf) {
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noreferrer"
        className={`${frame} block no-underline`}
      >
        {pdfLoading ? (
          <div
            className={`flex h-36 items-center justify-center text-[11px] ${
              mine ? "text-white/70" : "text-slate-400"
            }`}
          >
            Anteprima PDF…
          </div>
        ) : pdfThumb && !pdfError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={pdfThumb}
            alt={`Anteprima ${label}`}
            className="max-h-56 w-full bg-slate-50 object-contain object-top"
          />
        ) : (
          <div
            className={`flex h-28 items-center justify-center gap-2 ${
              mine ? "text-white/85" : "text-red-700"
            }`}
          >
            <FaFilePdf size={28} />
          </div>
        )}
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] ${
            mine ? "text-white/85" : "text-slate-700"
          }`}
        >
          <FaFilePdf size={12} className="shrink-0 opacity-80" />
          <span className="truncate font-medium">{label}</span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={fileUrl}
      target="_blank"
      rel="noreferrer"
      className={`${frame} flex items-center gap-2.5 px-2.5 py-2 no-underline`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-md ${
          mine ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"
        }`}
      >
        <FaFileLines size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-xs font-semibold ${
            mine ? "text-white" : "text-slate-900"
          }`}
        >
          {label}
        </span>
        <span
          className={`block text-[10px] ${
            mine ? "text-white/65" : "text-slate-500"
          }`}
        >
          Apri documento
        </span>
      </span>
    </a>
  );
}
