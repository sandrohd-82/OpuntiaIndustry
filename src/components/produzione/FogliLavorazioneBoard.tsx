"use client";

import { useMemo, useState } from "react";
import { FaFilePen } from "react-icons/fa6";
import { NuovoFoglioModal } from "@/components/produzione/NuovoFoglioModal";
import { useFogliLavorazione } from "@/hooks/useFogliLavorazione";
import { formatFoglioRange } from "@/lib/produzione/fogli-lavorazione";

type Props = {
  /** Apre subito la modale di creazione (es. da query ?nuovo=1) */
  startCreate?: boolean;
  initialFilter?: "tutti" | "aperti" | "chiusi";
};

export function FogliLavorazioneBoard({
  startCreate = false,
  initialFilter = "aperti",
}: Props) {
  const { fogli, createFoglio, closeFoglio, ready } = useFogliLavorazione();
  const [creating, setCreating] = useState(startCreate);
  const [filter, setFilter] = useState<"tutti" | "aperti" | "chiusi">(
    initialFilter
  );
  const [error, setError] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);

  const list = useMemo(() => {
    if (filter === "aperti") return fogli.filter((f) => f.stato === "aperto");
    if (filter === "chiusi") return fogli.filter((f) => f.stato === "chiuso");
    return fogli;
  }, [fogli, filter]);

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

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

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
              <dl className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                <div className="flex justify-between gap-2">
                  <dt>Motivo</dt>
                  <dd className="font-medium text-[var(--foreground)]">
                    {foglio.motivo === "magazzino" ? "Magazzino" : "Ordine"}
                    {foglio.ordineLabel ? ` · ${foglio.ordineLabel}` : ""}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Lotto</dt>
                  <dd className="font-medium text-[var(--foreground)]">
                    {foglio.lottoLabel}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt>Prodotto uscita</dt>
                  <dd className="text-right font-medium text-[var(--foreground)]">
                    {foglio.codiceProdottoUscita}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs tabular-nums text-[var(--muted)]">
                Durata prevista: {formatFoglioRange(foglio)}
              </p>
              {foglio.stato === "aperto" && (
                <button
                  type="button"
                  disabled={closingId === foglio.id}
                  onClick={() => {
                    setClosingId(foglio.id);
                    setError(null);
                    void closeFoglio(foglio.id).then((r) => {
                      setClosingId(null);
                      if (!r.ok) setError(r.error);
                    });
                  }}
                  className="mt-4 rounded-lg border border-[var(--border)] py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                >
                  {closingId === foglio.id
                    ? "Verifica chiusura…"
                    : "Chiudi foglio"}
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

      {creating && (
        <NuovoFoglioModal
          onClose={() => setCreating(false)}
          onCreate={async (values) => {
            setError(null);
            await createFoglio(values);
            setCreating(false);
            setFilter("aperti");
          }}
        />
      )}
    </div>
  );
}
