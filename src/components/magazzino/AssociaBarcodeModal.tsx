"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { FaCamera, FaImage, FaKeyboard, FaXmark } from "react-icons/fa6";
import { setArticoloBarcodeAction } from "@/app/actions/magazzino-barcode";
import type { MagazzinoCatalogKind } from "@/lib/magazzino/types";

type Step = "scelta" | "camera" | "foto" | "stringa";

type Props = {
  catalogKind: MagazzinoCatalogKind;
  prodottoId: string;
  prodottoLabel: string;
  barcodeAttuale: string | null;
  onClose: () => void;
  onSaved: (barcode: string | null) => void;
};

export function AssociaBarcodeModal({
  catalogKind,
  prodottoId,
  prodottoLabel,
  barcodeAttuale,
  onClose,
  onSaved,
}: Props) {
  const scannerId = useId().replace(/:/g, "");
  const [step, setStep] = useState<Step>("scelta");
  const [text, setText] = useState(barcodeAttuale ?? "");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const scanningLock = useRef(false);

  useEffect(() => {
    if (step !== "camera") return;
    let scanner: { stop: () => Promise<void> } | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const elId = `associa-qr-${scannerId}`;
        const inst = new Html5Qrcode(elId);
        scanner = inst;
        await inst.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 140 } },
          (decoded) => {
            if (scanningLock.current || cancelled) return;
            scanningLock.current = true;
            void saveBarcode(decoded).finally(() => {
              setTimeout(() => {
                scanningLock.current = false;
              }, 800);
            });
          },
          () => undefined
        );
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
      void scanner?.stop().catch(() => undefined);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start only when step=camera
  }, [step, scannerId]);

  function saveBarcode(raw: string) {
    const value = raw.trim();
    if (!value) {
      setError("Barcode vuoto.");
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await setArticoloBarcodeAction({
          catalogKind,
          prodottoId,
          barcode: value,
        });
        if (!res.success) {
          setError(res.error);
          resolve();
          return;
        }
        setInfo(`Associato: ${value}`);
        setError(null);
        onSaved(value);
        onClose();
        resolve();
      });
    });
  }

  function clearBarcode() {
    startTransition(async () => {
      const res = await setArticoloBarcodeAction({
        catalogKind,
        prodottoId,
        barcode: null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved(null);
      onClose();
    });
  }

  async function onPhotoSelected(file: File | null) {
    if (!file) return;
    setError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const reader = new Html5Qrcode(`associa-file-${scannerId}`);
      const decoded = await reader.scanFile(file, false);
      await reader.clear().catch(() => undefined);
      await saveBarcode(decoded);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossibile leggere barcode dalla foto."
      );
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
      role="dialog"
      aria-modal
      aria-labelledby="associa-barcode-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="associa-barcode-title"
              className="text-base font-semibold text-slate-900"
            >
              Associa barcode
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

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {info}
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
              onClick={() => {
                setError(null);
                setStep("foto");
                fileRef.current?.click();
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              <FaImage className="text-slate-600" />
              Carica una foto
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setError(null);
                setStep("stringa");
              }}
              className="flex w-full items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-3 text-left text-sm font-medium hover:bg-slate-50"
            >
              <FaKeyboard className="text-slate-600" />
              Inserisci stringa
            </button>
            {barcodeAttuale ? (
              <button
                type="button"
                disabled={pending}
                onClick={clearBarcode}
                className="w-full rounded-lg px-3 py-2 text-xs text-red-700 hover:bg-red-50"
              >
                Rimuovi barcode attuale ({barcodeAttuale})
              </button>
            ) : null}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                void onPhotoSelected(e.target.files?.[0] ?? null);
                e.target.value = "";
                setStep("scelta");
              }}
            />
            {/* Elemento richiesto da html5-qrcode per scanFile */}
            <div id={`associa-file-${scannerId}`} className="hidden" />
          </div>
        ) : null}

        {step === "camera" ? (
          <div className="mt-4 space-y-3">
            <div
              id={`associa-qr-${scannerId}`}
              className="overflow-hidden rounded-lg border border-[var(--border)] bg-black"
            />
            <button
              type="button"
              onClick={() => setStep("scelta")}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Indietro
            </button>
          </div>
        ) : null}

        {step === "stringa" ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Stringa barcode</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm"
                placeholder="Codice da associare"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStep("scelta")}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Indietro
              </button>
              <button
                type="button"
                disabled={pending || !text.trim()}
                onClick={() => void saveBarcode(text)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Associa"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
