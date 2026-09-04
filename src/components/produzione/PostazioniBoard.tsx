"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  createPostoLavoroAction,
  listProduzioneAreeAction,
  softDeletePostoLavoroAction,
} from "@/app/actions/produzione-aree";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import { PRODUZIONE_AREE_NAV_EVENT } from "@/lib/areas/produzione";
import { slugPosto, type ProduzioneArea } from "@/lib/produzione/aree-posti";

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
  const [nome, setNome] = useState("");
  const [codice, setCodice] = useState("");
  const [descrizione, setDescrizione] = useState("");

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
        sortOrder: (area.posti.at(-1)?.sortOrder ?? 0) + 10,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setNome("");
      setCodice("");
      setDescrizione("");
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

  return (
    <div className="space-y-5">
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted)]">
        Postazioni di {area.nome}: ogni posto ha un operatore e un’operazione
        dedicata. L’obiettivo di lotto è comune all’area.
      </p>

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
          <button
            type="button"
            disabled={pending || !nome.trim()}
            onClick={addPosto}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Aggiungi
          </button>
        </div>
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {area.posti.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">
            Nessuna postazione. Aggiungine una per il sottomenu.
          </li>
        ) : (
          area.posti.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{p.nome}</p>
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
          ))
        )}
      </ul>
    </div>
  );
}
