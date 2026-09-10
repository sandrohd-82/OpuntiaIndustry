"use client";

import { useEffect, useState } from "react";

type Props = {
  src: string;
  alt: string;
  className?: string;
};

async function renderPdfFirstPage(url: string): Promise<string | null> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({
    url,
    withCredentials: false,
  }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL("image/png");
}

/** Prima pagina PDF mostrata come immagine (browser, non tag img sul PDF). */
export function PdfFirstPageImage({ src, alt, className = "" }: Props) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setThumb(null);
    setFailed(false);
    void (async () => {
      try {
        const dataUrl = await renderPdfFirstPage(src);
        if (cancelled) return;
        if (!dataUrl) setFailed(true);
        else setThumb(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 px-4 text-center text-sm text-[var(--muted)] ${className}`}
      >
        Impossibile mostrare il disegno. Converti il PDF in PNG o JPG.
      </div>
    );
  }

  if (!thumb) {
    return (
      <div
        className={`bg-slate-100 ${className}`}
        aria-label={`Caricamento ${alt}`}
      />
    );
  }

  return (
    // data URL rasterizzata dal PDF
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumb} alt={alt} className={className} />
  );
}
