"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  FaArrowDown,
  FaArrowLeft,
  FaArrowRight,
  FaArrowUp,
  FaMinus,
  FaPlus,
} from "react-icons/fa6";

const BOX = 176;
const ACCEPT = "image/jpeg,image/png,image/webp";

export type FotoTesseraHandle = {
  exportIfNeeded: () => Promise<File | null>;
};

type Props = {
  coverUrl: string | null;
  busy?: boolean;
  disabled?: boolean;
  alt?: string;
  onInvalid?: (message: string) => void;
};

function isImageFile(file: File): boolean {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.type);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossibile leggere la foto."));
    img.src = url;
  });
}

async function cropToFile(
  sourceUrl: string,
  scale: number,
  offsetX: number,
  offsetY: number
): Promise<File> {
  const img = await loadImage(sourceUrl);
  const nw = img.naturalWidth || 1;
  const nh = img.naturalHeight || 1;
  const cover = Math.max(BOX / nw, BOX / nh);
  const dw = nw * cover * scale;
  const dh = nh * cover * scale;
  const left = (BOX - dw) / 2 + offsetX;
  const top = (BOX - dh) / 2 + offsetY;
  const out = 512;
  const k = out / BOX;
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Ritaglio foto non riuscito.");
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(img, left * k, top * k, dw * k, dh * k);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Ritaglio foto non riuscito."))),
      "image/jpeg",
      0.9
    );
  });
  return new File([blob], "foto-tessera.jpg", { type: "image/jpeg" });
}

const arrowBtn =
  "flex h-7 w-7 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-sky-50 hover:text-[var(--primary)] disabled:opacity-40";

export const FotoTesseraBox = forwardRef<FotoTesseraHandle, Props>(
  function FotoTesseraBox(
    { coverUrl, busy = false, disabled = false, alt = "Foto operatore", onInvalid },
    ref
  ) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
      null
    );
    const [dragOver, setDragOver] = useState(false);
    const [sourceUrl, setSourceUrl] = useState<string | null>(null);
    const [localUrl, setLocalUrl] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [scale, setScale] = useState(1);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);

    const photoSrc = localUrl ?? sourceUrl ?? coverUrl ?? null;

    useEffect(() => {
      setEditing(false);
      setDirty(false);
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
      setSourceUrl(null);
      setLocalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }, [coverUrl]);

    useEffect(() => {
      return () => {
        if (localUrl) URL.revokeObjectURL(localUrl);
      };
    }, [localUrl]);

    useImperativeHandle(ref, () => ({
      async exportIfNeeded() {
        if (!dirty || !photoSrc) return null;
        return cropToFile(localUrl ?? photoSrc, scale, offsetX, offsetY);
      },
    }));

    function resetTransform() {
      setScale(1);
      setOffsetX(0);
      setOffsetY(0);
    }

    function take(files: FileList | null) {
      const next = files?.[0];
      if (!next || disabled || busy) return;
      if (!isImageFile(next)) {
        onInvalid?.("Formato ammesso: JPG, PNG, WebP.");
        return;
      }
      const url = URL.createObjectURL(next);
      setLocalUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setSourceUrl(url);
      resetTransform();
      setEditing(true);
      setDirty(true);
    }

    async function startEdit() {
      if (disabled || busy) return;
      if (!localUrl && coverUrl) {
        try {
          const blob = await fetch(coverUrl).then((r) => {
            if (!r.ok) throw new Error("Foto non disponibile.");
            return r.blob();
          });
          const url = URL.createObjectURL(blob);
          setLocalUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return url;
          });
          setSourceUrl(url);
        } catch {
          onInvalid?.("Impossibile aprire la foto per la modifica. Ricarica il file.");
          return;
        }
      }
      setEditing(true);
      setDirty(true);
    }

    function move(dx: number, dy: number) {
      setOffsetX((v) => v + dx);
      setOffsetY((v) => v + dy);
      setDirty(true);
    }

    function zoom(delta: number) {
      setScale((v) => Math.min(3, Math.max(1, Math.round((v + delta) * 10) / 10)));
      setDirty(true);
    }

    function onPointerDown(e: ReactPointerEvent) {
      if (!editing || disabled) return;
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
    }

    function onPointerMove(e: ReactPointerEvent) {
      if (!dragRef.current) return;
      setOffsetX(dragRef.current.ox + (e.clientX - dragRef.current.x));
      setOffsetY(dragRef.current.oy + (e.clientY - dragRef.current.y));
      setDirty(true);
    }

    function onPointerUp() {
      dragRef.current = null;
    }

    const overlayTexts = (
      <>
        <span
          className={`text-sm font-semibold ${photoSrc ? "text-white" : "text-slate-900"}`}
        >
          Trascina qui la foto
        </span>
        <span className={`text-xs ${photoSrc ? "text-white/90" : "text-slate-600"}`}>
          oppure{" "}
          <button
            type="button"
            className={`font-semibold underline decoration-2 underline-offset-2 ${
              photoSrc ? "text-white" : "text-[var(--primary)]"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            scegli dal computer
          </button>
        </span>
        <span
          className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            photoSrc ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
          }`}
        >
          JPG, PNG, WebP
        </span>
        {photoSrc && !editing ? (
          <button
            type="button"
            className="mt-1 rounded-full bg-white px-3 py-0.5 text-xs font-semibold text-slate-900 shadow-sm"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void startEdit();
            }}
          >
            Modifica
          </button>
        ) : null}
      </>
    );

    const frame = (
      <div
        className={`relative h-44 w-44 overflow-hidden rounded-2xl border-2 border-dashed transition ${
          disabled
            ? ""
            : dragOver
              ? "border-emerald-500 shadow-md shadow-emerald-100"
              : editing
                ? "border-emerald-400"
                : photoSrc
                  ? "border-slate-300 group-hover:border-[var(--primary)]"
                  : "border-slate-300 hover:border-[var(--primary)]"
        } ${photoSrc ? "bg-slate-200" : "bg-gradient-to-b from-slate-50 to-white"}`}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
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
        onClick={() => {
          if (!photoSrc && !disabled) inputRef.current?.click();
        }}
      >
        {photoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoSrc}
            alt={alt}
            draggable={false}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`absolute inset-0 h-full w-full object-cover ${
              editing ? "cursor-grab active:cursor-grabbing" : ""
            }`}
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        ) : null}
        {!editing ? (
          <span
            className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 px-3 text-center transition ${
              photoSrc
                ? dragOver || busy
                  ? "bg-slate-950/55 opacity-100"
                  : "bg-slate-950/50 opacity-0 group-hover:opacity-100"
                : "opacity-100"
            }`}
          >
            <span className="pointer-events-auto flex flex-col items-center gap-1">
              {busy ? (
                <span
                  className={`text-xs font-medium ${
                    photoSrc ? "text-white" : "text-slate-700"
                  }`}
                >
                  Salvataggio…
                </span>
              ) : (
                overlayTexts
              )}
            </span>
          </span>
        ) : null}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          disabled={disabled || busy}
          className="sr-only"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    );

    if (disabled) {
      return photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoSrc}
          alt={alt}
          className="h-44 w-44 rounded-2xl object-cover"
        />
      ) : (
        <div className="h-44 w-44 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50" />
      );
    }

    return (
      <div className="group relative flex flex-col items-center px-8 pb-2 pt-8">
        {editing ? (
          <button
            type="button"
            aria-label="Sposta in alto"
            className={`${arrowBtn} absolute top-0 left-1/2 -translate-x-1/2`}
            onClick={() => move(0, -10)}
          >
            <FaArrowUp size={12} />
          </button>
        ) : null}
        <div className="relative flex items-center">
          {editing ? (
            <button
              type="button"
              aria-label="Sposta a sinistra"
              className={`${arrowBtn} absolute -left-8 z-10`}
              onClick={() => move(-10, 0)}
            >
              <FaArrowLeft size={12} />
            </button>
          ) : null}
          {frame}
          {editing ? (
            <button
              type="button"
              aria-label="Sposta a destra"
              className={`${arrowBtn} absolute -right-8 z-10`}
              onClick={() => move(10, 0)}
            >
              <FaArrowRight size={12} />
            </button>
          ) : null}
        </div>
        {editing ? (
          <>
            <button
              type="button"
              aria-label="Sposta in basso"
              className={`${arrowBtn} mt-1`}
              onClick={() => move(0, 10)}
            >
              <FaArrowDown size={12} />
            </button>
            <div className="mt-1 flex items-center gap-1">
              <button
                type="button"
                aria-label="Riduci"
                className={arrowBtn}
                onClick={() => zoom(-0.1)}
              >
                <FaMinus size={11} />
              </button>
              <button
                type="button"
                aria-label="Ingrandisci"
                className={arrowBtn}
                onClick={() => zoom(0.1)}
              >
                <FaPlus size={11} />
              </button>
            </div>
            <p className="mt-1 max-w-[11rem] text-center text-[10px] text-slate-500">
              Sposta e ridimensiona, poi premi Salva.
            </p>
          </>
        ) : null}
      </div>
    );
  }
);
