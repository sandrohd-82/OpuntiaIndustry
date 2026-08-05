"use client";

import { useMemo, useState, type FormEvent } from "react";
import { FaFilePen } from "react-icons/fa6";
import { useFogliLavorazione } from "@/hooks/useFogliLavorazione";
import { formatFoglioRange } from "@/lib/produzione/fogli-lavorazione";

type Props = {
  /** Apre subito il form di creazione (es. da query ?nuovo=1) */
  startCreate?: boolean;
};

export function FogliLavorazioneBoard({ startCreate = false }: Props) {
  const { fogli, createFoglio, closeFoglio, ready } = useFogliLavorazione();
  const [creating, setCreating] = useState(startCreate);
  const [prodotto, setProdotto] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState<"tutti" | "aperti" | "chiusi">("aperti");

  const list = useMemo(() => {
    if (filter === "aperti") return fogli.filter((f) => f.stato === "aperto");
    if (filter === "chiusi") return fogli.filter((f) => f.stato === "chiuso");
    return fogli;
  }, [fogli, filter]);

  function submitCreate(e: FormEvent) {
    e.preventDefault();
    if (!prodotto.trim()) return;
    createFoglio({ prodotto, descrizione, note });
    setProdotto("");
    setDescrizione("");
    setNote("");
    setCreating(false);
    setFilter("aperti");
  }

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento fogli…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Ogni foglio raccoglie i dati di una lavorazione (tipicamente ~24
            ore). Solo i fogli aperti possono essere associati agli essiccatori.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaFilePen size={16} />
          Crea nuovo foglio di lavoro
        </button>
      </div>

      {creating && (
        <form
          onSubmit={submitCreate}
          className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm"
        >
          <h2 className="text-base font-semibold">Nuovo foglio di lavorazione</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Verrà generato un codice FL-AAAA-NNN con fine prevista a +24 ore.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Prodotto / lotto</span>
              <input
                value={prodotto}
                onChange={(e) => setProdotto(e.target.value)}
                required
                placeholder="es. Fichi d’India — lotto A"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                autoFocus
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Descrizione</span>
              <input
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Opzionale"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Note</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Note operative…"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Crea foglio
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2">
        {(
          [
            ["aperti", "Aperti"],
            ["chiusi", "Chiusi"],
            ["tutti", "Tutti"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              filter === key
                ? "bg-[var(--primary)] text-white"
                : "bg-slate-100 text-[var(--muted)] hover:bg-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <FaFilePen className="mx-auto text-[var(--muted)]" size={36} />
          <p className="mt-3 text-sm font-medium">Nessun foglio in questa vista</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Crea un nuovo foglio di lavoro per iniziare una lavorazione.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Crea nuovo foglio di lavoro
          </button>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((foglio) => (
            <li
              key={foglio.id}
              className="flex flex-col rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-lg font-semibold">{foglio.label}</p>
                  <p className="mt-0.5 text-sm text-[var(--muted)]">
                    {foglio.prodotto}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    foglio.stato === "aperto"
                      ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/35"
                      : "bg-slate-500/10 text-slate-500 ring-1 ring-slate-400/30"
                  }`}
                >
                  {foglio.stato === "aperto" ? "Aperto" : "Chiuso"}
                </span>
              </div>
              <p className="mt-3 text-sm">{foglio.descrizione}</p>
              <p className="mt-2 text-xs tabular-nums text-[var(--muted)]">
                Durata prevista: {formatFoglioRange(foglio)}
              </p>
              {foglio.note && (
                <p className="mt-2 text-xs text-[var(--muted)]">
                  Note: {foglio.note}
                </p>
              )}
              {foglio.stato === "aperto" && (
                <button
                  type="button"
                  onClick={() => closeFoglio(foglio.id)}
                  className="mt-4 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Chiudi foglio
                </button>
              )}
              {foglio.stato === "chiuso" && foglio.closedAt && (
                <p className="mt-4 text-xs text-[var(--muted)]">
                  Chiuso il{" "}
                  {new Date(foglio.closedAt).toLocaleString("it-IT", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
