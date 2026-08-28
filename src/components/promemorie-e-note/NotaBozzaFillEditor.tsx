"use client";

import {
  applyPlaceholderValues,
  splitTemplateSegments,
} from "@/lib/promemorie-e-note/bozze";
import type { PnNotaBozzaPlaceholder } from "@/lib/promemorie-e-note/types";

type Props = {
  template: string;
  placeholders: PnNotaBozzaPlaceholder[];
  values: Record<string, string>;
  onChangeValues: (next: Record<string, string>) => void;
  /** Corpo libero editabile al 100% (dopo merge o scrittura diretta) */
  freeBody: string;
  onChangeFreeBody: (next: string) => void;
  mode: "placeholders" | "free";
  onToggleFree: () => void;
};

/**
 * Anteprima bozza: campi matita trasparente + possibilità di editare tutto.
 */
export function NotaBozzaFillEditor({
  template,
  placeholders,
  values,
  onChangeValues,
  freeBody,
  onChangeFreeBody,
  mode,
  onToggleFree,
}: Props) {
  const segments = splitTemplateSegments(template);

  if (mode === "free") {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">Testo nota (editabile)</span>
          <button
            type="button"
            onClick={onToggleFree}
            className="text-[10px] text-sky-700 hover:underline"
          >
            Torna ai campi bozza
          </button>
        </div>
        <textarea
          value={freeBody}
          onChange={(e) => onChangeFreeBody(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Compila i campi (matita) — la nota resta editabile al 100%
        </span>
        <button
          type="button"
          onClick={() => {
            onChangeFreeBody(applyPlaceholderValues(template, values));
            onToggleFree();
          }}
          className="text-[10px] text-sky-700 hover:underline"
        >
          Modifica testo libero
        </button>
      </div>
      <div className="min-h-[5rem] whitespace-pre-wrap rounded-lg border border-dashed border-amber-300/80 bg-amber-50/40 px-3 py-2 text-sm leading-relaxed text-slate-800">
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return <span key={i}>{seg.text}</span>;
          }
          const ph = placeholders.find((p) => p.key === seg.key);
          const label = ph?.label || seg.label;
          return (
            <input
              key={`${seg.key}-${i}`}
              value={values[seg.key] ?? ""}
              onChange={(e) =>
                onChangeValues({ ...values, [seg.key]: e.target.value })
              }
              placeholder={label}
              title={label}
              className="mx-0.5 inline-block min-w-[4.5rem] max-w-[12rem] border-0 border-b border-slate-400/70 bg-transparent px-0.5 py-0 text-sm italic text-slate-700 outline-none placeholder:text-slate-400/80 focus:border-amber-600"
              style={{ width: `${Math.max(4.5, (values[seg.key] || label).length * 0.55 + 1)}rem` }}
            />
          );
        })}
      </div>
    </div>
  );
}
