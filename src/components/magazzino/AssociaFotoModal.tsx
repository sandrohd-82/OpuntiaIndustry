"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FaCamera, FaImage, FaXmark } from "react-icons/fa6";
import {
  getMagazzinoFotoUrlAction,
  removeMagazzinoFotoAction,
  uploadMagazzinoFotoAction,
} from "@/app/actions/magazzino-foto";
import type { MagazzinoCatalogKind } from "@/lib/magazzino/types";

type Step = "scelta" | "camera";

type Props = {
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  prodottoLabel: string;
  fotoPath: string | null;
  onClose: () => void;
  onSaved: (fotoPath: string | null, previewUrl: string | null) => void;
};

export function AssociaFotoModal({
  catalogKind,
  prodottoId,
  prodottoLabel,
  fotoPath,
  onClose,
  onSaved,
}: Props) {
  const [step, setStep] = useState<Step>("scelta");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!fotoPath) return;
    void (async () => {
      const res = await getMagazzinoFotoUrlAction({ catalogKind, prodottoId });
      if (res.success && res.url) setPreview(res.url);
    })();
  }, [catalogKind, prodottoId, fotoPath]);

  useEffect(() => {
    if (step !== "camera") {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : "Fotocamera non disponibile (serve HTTPS / permesso)."
          );
          setStep("scelta");
        }
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [step]);

  function uploadFile(file: File | null) {
    if (!file) return;
    setError(null);
    const fd = new FormData();
    fd.set("catalogKind", catalogKind);
    fd.set("prodottoId", prodottoId);
    fd.set("foto", file);
    startTransition(async () => {
      const res = await uploadMagazzinoFotoAction(fd);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved(res.fotoPath, res.url || null);
      onClose();
    });
  }

  function scattaDaVideo() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError("Anteprima fotocamera non pronta.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Canvas non disponibile.");
      return;
    }
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("Scatto non riuscito.");
          return;
        }
        const file = new File([blob], `foto-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        uploadFile(file);
      },
      "image/jpeg",
      0.9
    );
  }

  function removeFoto() {
    startTransition(async () => {
      const res = await removeMagazzinoFotoAction({ catalogKind, prodottoId });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved(null, null);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="dialog"
      aria-modal
      aria-labelledby="associa-foto-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="associa-foto-title"
              className="text-base font-semibold text-slate-900"
            >
              Associa foto
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{prodottoLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={16} />
          </button>
        </div>

        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="Foto prodotto"
            className="mt-3 max-h-48 w-full rounded-lg border border-[var(--border)] object-contain bg-slate-50"
          />
        ) : (
          <p className="mt-3 rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--muted)]">
            Nessuna foto associata
          </p>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {step === "scelta" ? (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep("camera");
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              <FaCamera className="text-slate-600" />
              Apri fotocamera
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => cameraRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              <FaCamera className="text-slate-600" />
              Scatta / scegli da telefono
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              <FaImage className="text-slate-600" />
              Carica un file
            </button>
            {fotoPath ? (
              <button
                type="button"
                disabled={pending}
                onClick={removeFoto}
                className="w-full rounded-lg px-3 py-2 text-xs text-red-700 hover:bg-red-50"
              >
                Rimuovi foto attuale
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                uploadFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                uploadFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
        ) : null}

        {step === "camera" ? (
          <div className="mt-4 space-y-3">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full rounded-lg border border-[var(--border)] bg-black"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep("scelta")}
                className="flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Indietro
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={scattaDaVideo}
                className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Scatta"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
