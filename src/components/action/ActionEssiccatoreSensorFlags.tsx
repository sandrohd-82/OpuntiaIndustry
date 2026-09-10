"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatSensoreValore,
  type ActionEssiccatoreSensore,
} from "@/lib/action/sensori";

type Props = {
  sensors: ActionEssiccatoreSensore[];
  setting: boolean;
  onMove: (id: string, xPct: number, yPct: number) => void;
  onCommit: (id: string, xPct: number, yPct: number) => void;
  onRename: (id: string, nome: string) => void;
  onDelete?: (sensor: ActionEssiccatoreSensore) => void;
};

function clampPct(n: number): number {
  return Math.min(100, Math.max(0, n));
}

export function ActionEssiccatoreSensorFlags({
  sensors,
  setting,
  onMove,
  onCommit,
  onRename,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [cloud, setCloud] = useState<{
    nome: string;
    left: number;
    top: number;
  } | null>(null);

  function showCloud(el: HTMLElement, nome: string) {
    const r = el.getBoundingClientRect();
    setCloud({
      nome,
      left: r.left + r.width / 2,
      top: r.top,
    });
  }

  useEffect(() => {
    if (!cloud) return;
    const hide = () => setCloud(null);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [cloud]);

  function pctFromEvent(clientX: number, clientY: number) {
    const box = layerRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      xPct: clampPct(((clientX - box.left) / box.width) * 100),
      yPct: clampPct(((clientY - box.top) / box.height) * 100),
    };
  }

  function startDrag(e: React.PointerEvent<HTMLButtonElement>, id: string) {
    if (!setting) return;
    e.preventDefault();
    e.stopPropagation();
    setCloud(null);
    const pointerId = e.pointerId;

    const onWinMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const pct = pctFromEvent(ev.clientX, ev.clientY);
      if (pct) onMove(id, pct.xPct, pct.yPct);
    };
    const onWinUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
      window.removeEventListener("pointercancel", onWinUp);
      const pct = pctFromEvent(ev.clientX, ev.clientY);
      if (pct) onCommit(id, pct.xPct, pct.yPct);
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    window.addEventListener("pointercancel", onWinUp);
  }

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-20">
      {sensors.map((s) => (
        <div
          key={s.id}
          className="pointer-events-auto absolute z-20 -translate-x-1/2 -translate-y-1/2 hover:z-100"
          style={{ left: `${s.xPct}%`, top: `${s.yPct}%` }}
        >
          {setting && editingId === s.id ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                const nome = draft.trim();
                setEditingId(null);
                if (nome && nome !== s.nome) onRename(s.id, nome);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingId(null);
              }}
              className="w-28 rounded-full border border-slate-300 px-2 py-0.5 text-[11px]"
            />
          ) : (
            <button
              type="button"
              aria-label={s.nome}
              onMouseEnter={(e) => showCloud(e.currentTarget, s.nome)}
              onMouseLeave={() => setCloud(null)}
              onFocus={(e) => showCloud(e.currentTarget, s.nome)}
              onBlur={() => setCloud(null)}
              onDoubleClick={
                setting
                  ? () => {
                      setEditingId(s.id);
                      setDraft(s.nome);
                    }
                  : undefined
              }
              onPointerDown={
                setting ? (e) => startDrag(e, s.id) : undefined
              }
              className={`rounded-full border border-slate-200 bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold tabular-nums shadow-sm ${
                setting ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              {formatSensoreValore(s)}
            </button>
          )}
        </div>
      ))}
      {cloud && typeof document !== "undefined"
        ? createPortal(
            <div
              role="tooltip"
              className="pointer-events-none fixed z-200 w-max max-w-48 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-center text-[11px] font-medium leading-snug text-white shadow-lg"
              style={{ left: cloud.left, top: cloud.top - 6 }}
            >
              {cloud.nome}
              <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
