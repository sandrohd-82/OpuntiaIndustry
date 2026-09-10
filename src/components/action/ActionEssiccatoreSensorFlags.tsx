"use client";

import { useRef, useState } from "react";
import { FaFlag, FaTrash } from "react-icons/fa6";
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
  onDelete,
}: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

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
    <div ref={layerRef} className="pointer-events-none absolute inset-0 z-10">
      {sensors.map((s) => (
        <div
          key={s.id}
          className="pointer-events-auto absolute max-w-[9.5rem] -translate-x-1/2 -translate-y-full"
          style={{ left: `${s.xPct}%`, top: `${s.yPct}%` }}
        >
          <div className="flex flex-col items-center">
            <div className="mb-0.5 flex items-center gap-1 rounded-md border border-slate-200 bg-white/95 px-1.5 py-0.5 shadow-sm">
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
                  className="w-24 rounded border border-slate-300 px-1 py-0.5 text-[11px]"
                />
              ) : (
                <button
                  type="button"
                  title={
                    setting
                      ? "Trascina per posizionare · doppio clic per rinominare"
                      : `${s.nome}: ${formatSensoreValore(s)}`
                  }
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
                  className={`flex max-w-[9rem] items-center gap-1 text-left text-[11px] leading-tight ${
                    setting ? "cursor-grab active:cursor-grabbing" : ""
                  }`}
                >
                  <span className="truncate font-medium">{s.nome}</span>
                  <span className="shrink-0 tabular-nums text-[var(--muted)]">
                    {formatSensoreValore(s)}
                  </span>
                </button>
              )}
              {setting && onDelete ? (
                <button
                  type="button"
                  title="Rimuovi bandiera"
                  aria-label={`Rimuovi ${s.nome}`}
                  className="rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                  onClick={() => onDelete(s)}
                >
                  <FaTrash size={9} />
                </button>
              ) : null}
            </div>
            <FaFlag
              size={14}
              className={setting ? "text-amber-500" : "text-red-600"}
              aria-hidden
            />
          </div>
        </div>
      ))}
    </div>
  );
}
