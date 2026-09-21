"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import type { PostoFoto } from "@/lib/magazzino/posto-foto";

export function PiantaPostoFotoCarousel({
  foto,
  startId,
  titolo,
  onClose,
}: {
  foto: PostoFoto[];
  startId?: string;
  titolo?: string;
  onClose: () => void;
}) {
  const start = Math.max(
    0,
    foto.findIndex((f) => f.id === startId)
  );
  const [i, setI] = useState(start < 0 ? 0 : start);
  const cur = foto[i];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((n) => (n + 1) % foto.length);
      if (e.key === "ArrowLeft")
        setI((n) => (n - 1 + foto.length) % foto.length);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [foto.length, onClose]);

  if (!cur || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/75 p-4"
      role="dialog"
      aria-modal
      aria-label="Foto posto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">
            {titolo || "Foto posto"}
            {cur.isPrincipale ? " · principale" : ""}
            {foto.length > 1 ? ` · ${i + 1}/${foto.length}` : ""}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cur.url}
            alt={cur.fileName}
            className="max-h-[70vh] max-w-full object-contain"
          />
          {foto.length > 1 ? (
            <>
              <button
                type="button"
                aria-label="Foto precedente"
                className="absolute left-2 rounded-full bg-white/90 p-2 shadow"
                onClick={() => setI((n) => (n - 1 + foto.length) % foto.length)}
              >
                <FaChevronLeft />
              </button>
              <button
                type="button"
                aria-label="Foto successiva"
                className="absolute right-2 rounded-full bg-white/90 p-2 shadow"
                onClick={() => setI((n) => (n + 1) % foto.length)}
              >
                <FaChevronRight />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
