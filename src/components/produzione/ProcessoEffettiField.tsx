"use client";

import { FaPlus, FaXmark } from "react-icons/fa6";
import { ACTION_ESSICCATORI } from "@/lib/action/essiccatori";
import {
  PROCESSO_EFFETTO_TIPI,
  PROCESSO_EFFETTO_UNITA,
  labelEffettoTipo,
  type ProcessoEffettoDraft,
  type ProcessoEffettoTipo,
  type ProcessoEffettoUnita,
} from "@/lib/produzione/processo-effetti";

type Props = {
  value: ProcessoEffettoDraft[];
  onChange: (next: ProcessoEffettoDraft[]) => void;
};

function emptyDraft(): ProcessoEffettoDraft {
  return {
    tipo: "magazzino.consuma",
    codiceMp: "",
    unita: "kg",
    essiccatoreId: "",
    note: "",
  };
}

export function ProcessoEffettiField({ value, onChange }: Props) {
  function patch(index: number, partial: Partial<ProcessoEffettoDraft>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...partial } : row)));
  }

  return (
    <div className="sm:col-span-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium">Obiettivi / effetti</span>
        <button
          type="button"
          onClick={() => onChange([...value, emptyDraft()])}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium"
        >
          <FaPlus size={10} />
          Aggiungi effetto
        </button>
      </div>
      <p className="mb-2 text-xs text-[var(--muted)]">
        Contratti che il gestionale esegue: consumare o produrre in magazzino,
        caricare il cestone. Le quantità reali si registrano sul foglio.
      </p>
      {value.length === 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Nessuno. Esempio conversione: consuma NDRi + produce NDRa. Esempio
          riempimento: carica cestone essiccatore.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((row, index) => (
            <li
              key={`effetto-${index}`}
              className="space-y-2 rounded-lg border border-[var(--border)] px-3 py-2"
            >
              <div className="flex items-start gap-2">
                <select
                  value={row.tipo}
                  onChange={(e) => {
                    const tipo = e.target.value as ProcessoEffettoTipo;
                    patch(index, {
                      tipo,
                      unita: tipo === "essiccatore.carica_cestone" ? "kg" : row.unita,
                      codiceMp:
                        tipo === "essiccatore.carica_cestone" ? "" : row.codiceMp,
                      essiccatoreId:
                        tipo === "essiccatore.carica_cestone"
                          ? row.essiccatoreId
                          : "",
                    });
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                >
                  {PROCESSO_EFFETTO_TIPI.map((t) => (
                    <option key={t} value={t}>
                      {labelEffettoTipo(t)}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  aria-label="Rimuovi effetto"
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="rounded p-1 text-red-600 hover:bg-red-50"
                >
                  <FaXmark size={12} />
                </button>
              </div>
              {row.tipo === "essiccatore.carica_cestone" ? (
                <select
                  value={row.essiccatoreId}
                  onChange={(e) => patch(index, { essiccatoreId: e.target.value })}
                  className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                >
                  <option value="">Essiccatore in esecuzione</option>
                  {ACTION_ESSICCATORI.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={row.codiceMp}
                    onChange={(e) =>
                      patch(index, { codiceMp: e.target.value.toUpperCase() })
                    }
                    placeholder="Targa MP (es. NDRi) — vuoto = in esecuzione"
                    className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
                  />
                  <select
                    value={row.unita}
                    onChange={(e) =>
                      patch(index, {
                        unita: e.target.value as ProcessoEffettoUnita,
                      })
                    }
                    className="rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                  >
                    {PROCESSO_EFFETTO_UNITA.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <input
                value={row.note}
                onChange={(e) => patch(index, { note: e.target.value })}
                placeholder="Nota (opzionale)"
                className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
