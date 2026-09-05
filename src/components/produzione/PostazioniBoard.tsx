"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  createPostoLavoroAction,
  listProduzioneAreeAction,
  softDeletePostoLavoroAction,
} from "@/app/actions/produzione-aree";
import { PericolositaBandiera } from "@/components/produzione/PericolositaBandiera";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import {
  POSTO_PERICOLOSITA,
  pericolositaLabel,
  slugPosto,
  type PostoPericolosita,
  type ProduzioneArea,
} from "@/lib/produzione/aree-posti";

function notifyAreeNav() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PRODUZIONE_AREE_NAV_EVENT));
  }
}

type Props = {
  areaCodice: string;
};

export function PostazioniBoard({ areaCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [pericolosita, setPericolosita] = useState<PostoPericolosita>("bassa");

  function load() {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setArea(res.items.find((a) => a.codice === areaCodice) ?? null);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaCodice]);

  function addPosto() {
    if (!area || !nome.trim()) return;
    start(async () => {
      const res = await createPostoLavoroAction({
        areaId: area.id,
        codice: codice.trim() || slugPosto(nome),
        nome: nome.trim(),
        descrizione: descrizione.trim(),
        pericolosita,
        sortOrder: (area.posti.at(-1)?.sortOrder ?? 0) + 10,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNome("");
      setCodice("");
      setDescrizione("");
      setPericolosita("bassa");
      setAdding(false);
      notifyAreeNav();
      load();
    });
  }

  if (!area && !error) {
    return <p className="text-sm text-[var(--muted)]">Caricamento postazioni…</p>;
  }
  if (!area) {
    return (
      <p className="text-sm text-red-700">{error ?? "Area non trovata."}</p>
    );
  }

  const base = `/app/produzione/gestione-aree/${area.codice}`;
  const posti = area.posti.filter((p) => p.attivo);

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        Le postazioni sono punti di lavoro che richiedono la presenza di una
        persona. Gli impianti senza operatore (es. vasca di lavaggio) restano
        tra i macchinari.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Elenco Postazioni</h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
        >
          {adding ? "Annulla" : "Aggiungi postazioni"}
        </button>
      </div>

      {adding ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="text-sm font-semibold">Nuova postazione</h3>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-[var(--muted)]">
              Nome
              <input
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  if (!codice) setCodice(slugPosto(e.target.value));
                }}
                className="mt-1 block w-48 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Codice
              <input
                value={codice}
                onChange={(e) => setCodice(slugPosto(e.target.value))}
                className="mt-1 block w-40 rounded-md border border-[var(--border)] px-2 py-1.5 font-mono text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Operazione
              <input
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                className="mt-1 block w-64 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs text-[var(--muted)]">
              Pericolosità
              <select
                value={pericolosita}
                onChange={(e) =>
                  setPericolosita(e.target.value as PostoPericolosita)
                }
                className="mt-1 block w-52 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
              >
                {POSTO_PERICOLOSITA.map((level) => (
                  <option key={level} value={level}>
                    {pericolositaLabel(level)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={pending || !nome.trim()}
              onClick={addPosto}
              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Salva postazione
            </button>
          </div>
        </div>
      ) : null}

      {posti.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nessuna postazione per questa area
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {posti.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{p.nome}</p>
                    <PericolositaBandiera level={p.pericolosita} compact />
                  </div>
                  <p className="font-mono text-xs text-[var(--muted)]">{p.codice}</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {p.descrizione || "Operazione dedicata in quest’area."}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-700 hover:underline"
                  onClick={() =>
                    start(async () => {
                      const res = await softDeletePostoLavoroAction(p.id);
                      if (!res.success) setError(res.error);
                      else {
                        notifyAreeNav();
                        load();
                      }
                    })
                  }
                >
                  Rimuovi
                </button>
              </div>
              <div className="mt-3">
                <WorkcenterCameraBar
                  compact
                  targetKind="posto"
                  areaCodice={area.codice}
                  postoCodice={p.codice}
                />
              </div>
              <Link
                href={`${base}/postazioni/${p.codice}`}
                className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
              >
                Apri postazione
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
