"use client";

import { useMemo, useState } from "react";
import { syncImballaggioVoceProdottiAction } from "@/app/actions/imballaggi-spedizioni";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  IMBALLAGGIO_PRODOTTO_UM,
  type ImballaggioProdottoUm,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";

type Draft = {
  selected: boolean;
  maxKg: number | "";
  unitaMisura: ImballaggioProdottoUm;
};

type Props = {
  voce: ImballaggioVoce;
  onClose: () => void;
  onSaved: (item: ImballaggioVoce) => void;
};

function breve(note: string) {
  const t = note.trim();
  if (!t) return "Nessuna descrizione";
  return t.length > 140 ? `${t.slice(0, 137)}…` : t;
}

export function ImballaggioVoceProdottiModal({
  voce,
  onClose,
  onSaved,
}: Props) {
  const { prodotti, ready } = useProdottiPropri();
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>(() => {
    const init: Record<string, Draft> = {};
    for (const p of voce.prodotti) {
      init[p.prodottoId] = {
        selected: true,
        maxKg: p.maxKg,
        unitaMisura: p.unitaMisura ?? "kg",
      };
    }
    return init;
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...prodotti].sort((a, b) =>
      a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
    );
    if (!q) return list;
    return list.filter(
      (p) =>
        p.nome.toLowerCase().includes(q) ||
        p.codice.toLowerCase().includes(q) ||
        p.note.toLowerCase().includes(q)
    );
  }, [prodotti, query]);

  const selectedCount = Object.values(draft).filter((d) => d.selected).length;

  function rowState(id: string): Draft {
    return draft[id] ?? { selected: false, maxKg: "", unitaMisura: "kg" };
  }

  async function save() {
    const links = Object.entries(draft)
      .filter(([, d]) => d.selected)
      .map(([prodottoId, d]) => ({
        prodottoId,
        maxKg: d.maxKg === "" ? 0 : d.maxKg,
        unitaMisura: d.unitaMisura,
      }));
    if (links.some((l) => !(l.maxKg > 0))) {
      setError("Per ogni prodotto selezionato indica una quantità max maggiore di zero.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await syncImballaggioVoceProdottiAction({
      voceId: voce.id,
      links,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onSaved(res.item);
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">Collega a prodotti</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {voce.codice} — {voce.nome}. Spunta i prodotti, indica la quantità
          massima inseribile e l’unità (kg, lt, g, ml, pz).
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cerca prodotto…"
          className="mt-4 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />

        <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-lg border border-[var(--border)]">
          {!ready ? (
            <p className="px-3 py-6 text-sm text-[var(--muted)]">
              Caricamento prodotti…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[var(--muted)]">
              Nessun prodotto.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {filtered.map((p) => {
                const st = rowState(p.id);
                return (
                  <li key={p.id} className="flex items-start gap-3 px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={st.selected}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          [p.id]: {
                            selected: e.target.checked,
                            maxKg: prev[p.id]?.maxKg ?? "",
                            unitaMisura: prev[p.id]?.unitaMisura ?? "kg",
                          },
                        }))
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        <span className="font-mono text-xs text-[var(--muted)]">
                          {p.codice}
                        </span>{" "}
                        {p.nome}
                        {p.isBio ? (
                          <span className="ml-1 text-[10px] uppercase text-emerald-700">
                            bio
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {breve(p.note)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-end gap-1">
                      <label className="text-xs">
                        Max
                        <ClearableNumberInput
                          min={0}
                          disabled={!st.selected}
                          value={st.maxKg}
                          onValueChange={(v) =>
                            setDraft((prev) => ({
                              ...prev,
                              [p.id]: {
                                selected: prev[p.id]?.selected ?? true,
                                maxKg: v,
                                unitaMisura: prev[p.id]?.unitaMisura ?? "kg",
                              },
                            }))
                          }
                          className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1 text-sm disabled:opacity-40"
                        />
                      </label>
                      <label className="text-xs">
                        UM
                        <select
                          disabled={!st.selected}
                          value={st.unitaMisura}
                          onChange={(e) =>
                            setDraft((prev) => ({
                              ...prev,
                              [p.id]: {
                                selected: prev[p.id]?.selected ?? true,
                                maxKg: prev[p.id]?.maxKg ?? "",
                                unitaMisura: e.target
                                  .value as ImballaggioProdottoUm,
                              },
                            }))
                          }
                          className="ml-1 rounded border border-[var(--border)] px-1.5 py-1 text-sm disabled:opacity-40"
                        >
                          {IMBALLAGGIO_PRODOTTO_UM.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mt-2 text-xs text-[var(--muted)]">
          {selectedCount} prodotti selezionati
        </p>

        {error ? (
          <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva collegamenti"}
          </button>
        </div>
      </div>
    </div>
  );
}
