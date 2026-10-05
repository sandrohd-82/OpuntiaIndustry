"use client";

import { useEffect, useRef, useState } from "react";

type Rect = { x: number; y: number; w: number; h: number };

type Props = {
  src: string;
  alt: string;
};

const MIN_SCALE = 1;
const MAX_SCALE = 8;

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function ScontrinoZoomPane({ src, alt }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [modo, setModo] = useState<"sposta" | "evidenzia">("sposta");
  const [segni, setSegni] = useState<Rect[]>([]);
  const [bozza, setBozza] = useState<Rect | null>(null);
  const scaleRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const bozzaRef = useRef<Rect | null>(null);
  const dragRef = useRef<
    | { kind: "pan"; x: number; y: number; panX: number; panY: number }
    | { kind: "box"; x: number; y: number }
    | null
  >(null);

  scaleRef.current = scale;
  panRef.current = pan;

  const fit =
    natural.w > 0 && natural.h > 0 && view.w > 0 && view.h > 0
      ? Math.min(view.w / natural.w, view.h / natural.h)
      : 0;
  const width = natural.w * fit * scale;
  const height = natural.h * fit * scale;
  const originX = (view.w - natural.w * fit) / 2 + pan.x;
  const originY = (view.h - natural.h * fit) / 2 + pan.y;

  useEffect(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
    setSegni([]);
    setBozza(null);
    bozzaRef.current = null;
    setNatural({ w: 0, h: 0 });
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const misura = () => setView({ w: el.clientWidth, h: el.clientHeight });
    misura();
    const observer = new ResizeObserver(misura);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    function onWheel(event: WheelEvent) {
      event.preventDefault();
      if (!fit) return;
      const box = el!.getBoundingClientRect();
      const mx = event.clientX - box.left;
      const my = event.clientY - box.top;
      const prev = scaleRef.current;
      const next = clampScale(prev * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
      const contentX = (mx - (view.w - natural.w * fit) / 2 - panRef.current.x) / (fit * prev);
      const contentY = (my - (view.h - natural.h * fit) / 2 - panRef.current.y) / (fit * prev);
      setScale(next);
      setPan({
        x: mx - (view.w - natural.w * fit) / 2 - contentX * fit * next,
        y: my - (view.h - natural.h * fit) / 2 - contentY * fit * next,
      });
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fit, natural.h, natural.w, view.h, view.w]);

  function puntoSullImmagine(clientX: number, clientY: number) {
    const img = imageRef.current;
    if (!img || !natural.w || !natural.h) return { x: 0, y: 0 };
    const box = img.getBoundingClientRect();
    const x = ((clientX - box.left) / box.width) * natural.w;
    const y = ((clientY - box.top) / box.height) * natural.h;
    return {
      x: Math.min(natural.w, Math.max(0, x)),
      y: Math.min(natural.h, Math.max(0, y)),
    };
  }

  function scriviBozza(rect: Rect | null) {
    bozzaRef.current = rect;
    setBozza(rect);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (modo === "sposta") {
      dragRef.current = {
        kind: "pan",
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }
    const punto = puntoSullImmagine(event.clientX, event.clientY);
    dragRef.current = { kind: "box", x: punto.x, y: punto.y };
    scriviBozza({ x: punto.x, y: punto.y, w: 0, h: 0 });
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") {
      setPan({
        x: drag.panX + (event.clientX - drag.x),
        y: drag.panY + (event.clientY - drag.y),
      });
      return;
    }
    const punto = puntoSullImmagine(event.clientX, event.clientY);
    scriviBozza({
      x: Math.min(drag.x, punto.x),
      y: Math.min(drag.y, punto.y),
      w: Math.abs(punto.x - drag.x),
      h: Math.abs(punto.y - drag.y),
    });
  }

  function onPointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    const rect = bozzaRef.current;
    if (drag?.kind === "box" && rect && rect.w > 8 && rect.h > 8) {
      setSegni((prev) => [...prev, rect]);
    }
    scriviBozza(null);
  }

  function zoomAlCentro(factor: number) {
    if (!fit || !view.w) return;
    const prev = scaleRef.current;
    const next = clampScale(prev * factor);
    const mx = view.w / 2;
    const my = view.h / 2;
    const contentX = (mx - (view.w - natural.w * fit) / 2 - panRef.current.x) / (fit * prev);
    const contentY = (my - (view.h - natural.h * fit) / 2 - panRef.current.y) / (fit * prev);
    setScale(next);
    setPan({
      x: mx - (view.w - natural.w * fit) / 2 - contentX * fit * next,
      y: my - (view.h - natural.h * fit) / 2 - contentY * fit * next,
    });
  }

  function adatta() {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }

  const segniVisibili = bozza ? [...segni, bozza] : segni;

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-white/10 px-2 py-2">
        <button
          type="button"
          onClick={() => zoomAlCentro(1.25)}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
        >
          Ingrandisci
        </button>
        <button
          type="button"
          onClick={() => zoomAlCentro(1 / 1.25)}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
        >
          Riduci
        </button>
        <button
          type="button"
          onClick={adatta}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20"
        >
          Adatta
        </button>
        <button
          type="button"
          aria-pressed={modo === "sposta"}
          onClick={() => setModo("sposta")}
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            modo === "sposta" ? "bg-white text-slate-900" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          Sposta
        </button>
        <button
          type="button"
          aria-pressed={modo === "evidenzia"}
          onClick={() => setModo("evidenzia")}
          className={`rounded-md px-2 py-1 text-xs font-medium ${
            modo === "evidenzia" ? "bg-amber-300 text-slate-900" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          Evidenzia
        </button>
        <button
          type="button"
          disabled={segni.length === 0}
          onClick={() => setSegni([])}
          className="rounded-md bg-white/10 px-2 py-1 text-xs font-medium hover:bg-white/20 disabled:opacity-40"
        >
          Pulisci
        </button>
      </div>
      <p className="px-2 py-1 text-[11px] text-slate-300">
        Rotella per ingrandire, trascina per spostare. Con Evidenzia segni la zona da copiare.
      </p>
      <div
        ref={viewportRef}
        className={`relative min-h-0 flex-1 overflow-hidden ${
          modo === "sposta" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {width > 0 ? (
          <div
            className="absolute left-0 top-0"
            style={{
              width,
              height,
              transform: `translate(${originX}px, ${originY}px)`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              draggable={false}
              className="pointer-events-none block h-full w-full select-none"
            />
            {segniVisibili.map((rect, index) => (
              <span
                key={`${rect.x}-${rect.y}-${index}`}
                className="pointer-events-none absolute border-2 border-amber-300 bg-amber-300/35"
                style={{
                  left: `${(rect.x / natural.w) * 100}%`,
                  top: `${(rect.y / natural.h) * 100}%`,
                  width: `${(rect.w / natural.w) * 100}%`,
                  height: `${(rect.h / natural.h) * 100}%`,
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
