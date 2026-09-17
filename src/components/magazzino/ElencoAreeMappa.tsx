"use client";

import { formattaQuadrati, formattaLunghezzaReale, type MappaScalaUnita } from "@/lib/magazzino/mappa";
import type { MappaAreaDisegnata } from "@/lib/magazzino/ubicazioni";

export function ElencoAreeMappa({
  aree,
  selectedId,
  griglia,
  scalaValore,
  scalaUnita,
  canEdit,
  parentLabel,
  onSelect,
  onModifica,
  onCopia,
}: {
  aree: MappaAreaDisegnata[];
  selectedId: string | null;
  griglia: number;
  scalaValore: number;
  scalaUnita: MappaScalaUnita;
  canEdit: boolean;
  parentLabel: (parentId: string | null) => string;
  onSelect: (id: string) => void;
  onModifica: (id: string) => void;
  onCopia: (id: string) => void;
}) {
  if (aree.length === 0) {
    return (
      <div className="shrink-0 rounded-xl border border-dashed border-[var(--border)] px-3 py-3 text-sm text-[var(--muted)]">
        Nessuna area su questa pianta. Disegna un posto o copialo da un altro dopo
        la prima creazione.
      </div>
    );
  }

  const g = Math.max(griglia, 1);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
        <p className="text-sm font-semibold">Aree / posti di questa pianta</p>
        <p className="text-xs text-[var(--muted)]">
          Clic sulla riga: accende il posto e mostra i dati.
        </p>
      </div>
      <div>
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-3 py-1.5 font-medium">Codice</th>
              <th className="px-3 py-1.5 font-medium">Nome</th>
              <th className="px-3 py-1.5 font-medium">Madre</th>
              <th className="px-3 py-1.5 font-medium">Misure</th>
              <th className="px-3 py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {aree.map((a) => {
              const wq = a.width / g;
              const hq = a.height / g;
              const sel = a.id === selectedId;
              return (
                <tr
                  key={a.id}
                  onClick={() => onSelect(a.id)}
                  className={`cursor-pointer border-t border-[var(--border)] ${
                    sel ? "bg-teal-100/80" : "hover:bg-slate-50"
                  }`}
                >
                  <td className="px-3 py-1.5 font-medium">{a.codice}</td>
                  <td className="px-3 py-1.5">{a.nome}</td>
                  <td className="px-3 py-1.5 text-[var(--muted)]">
                    {parentLabel(a.parentId)}
                  </td>
                  <td className="px-3 py-1.5 text-xs">
                    {formattaQuadrati(wq)} × {formattaQuadrati(hq)} q ·{" "}
                    {formattaLunghezzaReale(wq, scalaValore, scalaUnita)} ×{" "}
                    {formattaLunghezzaReale(hq, scalaValore, scalaUnita)}
                  </td>
                  <td className="px-3 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => onModifica(a.id)}
                      className="text-sm font-medium text-teal-800 hover:underline"
                    >
                      Modifica
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => onCopia(a.id)}
                        className="ml-3 text-sm text-slate-600 hover:underline"
                      >
                        Copia
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
