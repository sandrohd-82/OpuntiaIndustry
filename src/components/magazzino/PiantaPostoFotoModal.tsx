"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaSpinner } from "react-icons/fa6";
import {
  aggiornaFitFotoAction,
  eliminaFotoPostoAction,
  impostaFotoPrincipaleAction,
} from "@/app/actions/magazzino-posto-foto";
import { PiantaPostoFotoCarousel } from "@/components/magazzino/PiantaPostoFotoCarousel";
import { PiantaPostoFotoOccupazione } from "@/components/magazzino/PiantaPostoFotoOccupazione";
import { preparaFotoPostoPerUpload } from "@/lib/magazzino/posto-foto-client";
import {
  POSTO_FOTO_SCALE_DEFAULT,
  fetchFotoPosto,
  fileSembraFoto,
  rettangoloFotoNelBox,
  type PostoFoto,
} from "@/lib/magazzino/posto-foto";

type Props = {
  ubicazioneId: string;
  postoCodice: string;
  postoNome?: string;
  boxW?: number;
  boxH?: number;
  onClose: () => void;
  onCambio: () => void;
};

export function PiantaPostoFotoModal({
  ubicazioneId,
  postoCodice,
  postoNome,
  boxW = 160,
  boxH = 110,
  onClose,
  onCambio,
}: Props) {
  const titleId = useId();
  const [foto, setFoto] = useState<PostoFoto[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [load, setLoad] = useState(true);
  const [busy, setBusy] = useState("");
  const [errore, setErrore] = useState("");
  const [carousel, setCarousel] = useState<string | null>(null);
  const [scale, setScale] = useState(POSTO_FOTO_SCALE_DEFAULT);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null
  );
  const previewW = 240;
  const previewH = Math.max(80, Math.round((previewW * boxH) / Math.max(boxW, 1)));

  async function reload() {
    setLoad(true);
    try {
      const res = await fetchFotoPosto(ubicazioneId);
      if (!res.success) {
        setErrore(res.error);
        setFoto([]);
        return;
      }
      setFoto(res.foto);
      setErrore("");
      const keep = res.foto.find((f) => f.id === selId) ?? res.foto[0] ?? null;
      setSelId(keep?.id ?? null);
      if (keep) {
        setScale(keep.fitScale);
        setOx(keep.offsetX);
        setOy(keep.offsetY);
      }
    } catch (e) {
      setErrore(
        e instanceof Error ? e.message : "Elenco foto non disponibile."
      );
      setFoto([]);
    } finally {
      setLoad(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ubicazioneId]);

  const sel = foto.find((f) => f.id === selId) ?? null;

  useEffect(() => {
    if (!sel) return;
    setScale(sel.fitScale);
    setOx(sel.offsetX);
    setOy(sel.offsetY);
  }, [sel?.id]);

  async function carica(raw: File[]) {
    const files = raw.filter(fileSembraFoto);
    if (!files.length) {
      if (raw.length) {
        setErrore(
          "Il file selezionato non è un’immagine riconoscibile (JPG, PNG, WebP)."
        );
      }
      return;
    }
    setErrore("");
    try {
      const pronti: File[] = [];
      for (let i = 0; i < files.length; i += 1) {
        setBusy(`Preparazione foto ${i + 1} di ${files.length}…`);
        pronti.push(await preparaFotoPostoPerUpload(files[i]));
      }
      setBusy(
        files.length > 1
          ? `Invio ${files.length} foto…`
          : "Invio foto in corso…"
      );
      const fd = new FormData();
      fd.set("ubicazioneId", ubicazioneId);
      for (const f of pronti) fd.append("file", f, f.name);
      const res = await fetch("/api/magazzino/posto-foto", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = (await res.json().catch(() => null)) as
        | { success: true }
        | { success: false; error: string }
        | null;
      if (!data?.success) {
        setErrore(
          data && "error" in data
            ? data.error
            : res.status === 413
              ? "File troppo grande per il trasferimento."
              : "Caricamento fallito."
        );
        return;
      }
      await reload();
      onCambio();
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Caricamento fallito.");
    } finally {
      setBusy("");
    }
  }

  async function salvaFit() {
    if (!sel) return;
    setBusy("Salvo ritaglio…");
    const res = await aggiornaFitFotoAction({
      id: sel.id,
      fitScale: scale,
      offsetX: ox,
      offsetY: oy,
    });
    setBusy("");
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setFoto((prev) =>
      prev.map((f) =>
        f.id === sel.id ? { ...f, fitScale: scale, offsetX: ox, offsetY: oy } : f
      )
    );
    onCambio();
  }

  const fit = rettangoloFotoNelBox({
    x: 0,
    y: 0,
    width: previewW,
    height: previewH,
    fitScale: scale,
    offsetX: ox,
    offsetY: oy,
  });

  const modal = (
    <div
      className="fixed inset-0 z-[280] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      onMouseDown={(e) => {
        if (busy) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby={titleId}
        className="relative w-full max-w-3xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {busy ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-white/85"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <FaSpinner className="animate-spin text-2xl text-green-900" />
            <p className="px-4 text-center text-sm font-medium text-slate-800">
              {busy}
            </p>
            <p className="text-xs text-slate-500">Attendi, non è bloccato.</p>
          </div>
        ) : null}
        <h2 id={titleId} className="text-base font-semibold">
          Foto posto {postoCodice}
          {postoNome?.trim() ? ` — ${postoNome.trim()}` : ""}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          All’upload la foto è circa il doppio del box. Se è troppo grande viene
          ridimensionata. Ingrandisci, riduci e trascina per centrarla. La
          principale si vede sulle viste laterali, mai Dall’alto.
        </p>

        {errore ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {errore}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (!files.length) return;
              void carica(files);
            }}
          />
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg bg-green-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            Carica foto
          </button>
          {sel ? (
            <button
              type="button"
              onClick={() => void salvaFit()}
              className="rounded-lg border border-green-800 px-3 py-1.5 text-sm font-medium"
            >
              Salva ritaglio
            </button>
          ) : null}
        </div>

        {load ? (
          <p className="mt-4 text-sm text-slate-600">Caricamento elenco…</p>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_16rem]">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Anteprima nel box
              </p>
              <div
                className="relative overflow-hidden rounded-lg border-2 border-slate-400 bg-slate-200"
                style={{ width: previewW, height: previewH, cursor: sel ? "grab" : "default" }}
                onMouseDown={(e) => {
                  if (!sel) return;
                  drag.current = {
                    x: e.clientX,
                    y: e.clientY,
                    ox,
                    oy,
                  };
                }}
                onMouseMove={(e) => {
                  if (!drag.current) return;
                  const dx = (e.clientX - drag.current.x) / previewW;
                  const dy = (e.clientY - drag.current.y) / previewH;
                  setOx(Math.max(-4, Math.min(4, drag.current.ox + dx)));
                  setOy(Math.max(-4, Math.min(4, drag.current.oy + dy)));
                }}
                onMouseUp={() => {
                  drag.current = null;
                }}
                onMouseLeave={() => {
                  drag.current = null;
                }}
              >
                {sel?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={sel.url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none select-none"
                    style={{
                      left: fit.x,
                      top: fit.y,
                      width: fit.width,
                      height: fit.height,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <p className="flex h-full items-center justify-center text-xs text-slate-500">
                    Nessuna foto
                  </p>
                )}
              </div>
              {sel ? (
                <label className="mt-3 block text-xs font-medium text-slate-700">
                  Grandezza ({scale.toFixed(1)}× il box)
                  <input
                    type="range"
                    min={0.8}
                    max={4}
                    step={0.1}
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="mt-1 w-full"
                  />
                </label>
              ) : null}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Foto ({foto.length})
              </p>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {foto.map((f) => (
                  <li
                    key={f.id}
                    className={`flex gap-2 rounded-lg border p-1.5 ${
                      f.id === selId
                        ? "border-green-800 bg-green-50"
                        : "border-slate-200"
                    }`}
                  >
                    <button
                      type="button"
                      className="shrink-0"
                      onClick={() => setSelId(f.id)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={f.url}
                        alt=""
                        className="h-16 w-20 rounded object-cover"
                      />
                    </button>
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="truncate font-medium">{f.fileName}</p>
                      {f.isPrincipale ? (
                        <p className="text-green-800">Principale</p>
                      ) : (
                        <button
                          type="button"
                          className="text-green-900 underline"
                          onClick={() =>
                            void impostaFotoPrincipaleAction(f.id).then(() => {
                              void reload();
                              onCambio();
                            })
                          }
                        >
                          Rendi principale
                        </button>
                      )}
                      <div className="mt-1 flex gap-2">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setCarousel(f.id)}
                        >
                          Apri
                        </button>
                        <button
                          type="button"
                          className="text-rose-800 underline"
                          onClick={() =>
                            void eliminaFotoPostoAction(f.id).then(() => {
                              void reload();
                              onCambio();
                            })
                          }
                        >
                          Elimina
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

        <PiantaPostoFotoOccupazione
          ubicazioneId={ubicazioneId}
          onCambio={onCambio}
        />

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={Boolean(busy)}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm disabled:opacity-60"
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return (
    <>
      {createPortal(modal, document.body)}
      {carousel ? (
        <PiantaPostoFotoCarousel
          foto={foto}
          startId={carousel}
          titolo={`Posto ${postoCodice}`}
          onClose={() => setCarousel(null)}
        />
      ) : null}
    </>
  );
}
