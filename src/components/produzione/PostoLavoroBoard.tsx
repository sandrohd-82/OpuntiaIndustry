"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  addAutorizzazionePostoAction,
  listAutorizzatiPostoAction,
  listPersoneMinimeAction,
  removeAutorizzazionePostoAction,
} from "@/app/actions/organigramma";
import { listProduzioneAreeAction } from "@/app/actions/produzione-aree";
import { WorkcenterCameraBar } from "@/components/produzione/WorkcenterCameraBar";
import type { PersonaMinima, PostoAutorizzato } from "@/lib/amministrazione/organigramma";
import type { ProduzioneArea, ProduzionePostoLavoro } from "@/lib/produzione/aree-posti";

type Props = {
  areaCodice: string;
  postoCodice: string;
};

export function PostoLavoroBoard({ areaCodice, postoCodice }: Props) {
  const [pending, start] = useTransition();
  const [area, setArea] = useState<ProduzioneArea | null>(null);
  const [posto, setPosto] = useState<ProduzionePostoLavoro | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    start(async () => {
      const res = await listProduzioneAreeAction();
      if (!res.success) {
        setError(res.error);
        return;
      }
      const a = res.items.find((x) => x.codice === areaCodice) ?? null;
      setArea(a);
      setPosto(a?.posti.find((p) => p.codice === postoCodice) ?? null);
    });
  }, [areaCodice, postoCodice]);

  if (pending && !area) {
    return <p className="text-sm text-[var(--muted)]">Caricamento posto…</p>;
  }
  if (error || !area || !posto) {
    return (
      <p className="text-sm text-red-700">
        {error ?? "Posto lavoro non trovato."}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <WorkcenterCameraBar
        targetKind="posto"
        areaCodice={area.codice}
        postoCodice={posto.codice}
      />
      <p className="text-sm text-[var(--muted)]">
        Postazione in area <strong>{area.nome}</strong>. L’operatore esegue{" "}
        <strong>{posto.nome}</strong>
        {posto.descrizione ? ` (${posto.descrizione})` : ""}. Gli altri posti
        dell’area svolgono operazioni diverse sullo stesso lotto.
      </p>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase text-[var(--muted)]">Codice</p>
        <p className="font-mono text-sm">{posto.codice}</p>
        <p className="mt-3 text-xs uppercase text-[var(--muted)]">Area</p>
        <p className="text-sm">{area.nome}</p>
        <p className="mt-3 text-xs uppercase text-[var(--muted)]">
          Posti collegati
        </p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {area.posti.map((p) => (
            <li key={p.id}>
              <Link
                href={`/app/produzione/gestione-aree/${area.codice}/postazioni/${p.codice}`}
                className={`rounded-full px-2.5 py-0.5 text-xs ${
                  p.id === posto.id
                    ? "bg-[var(--primary)] text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {p.nome}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <PostoAutorizzatiBlock postoId={posto.id} />
      <Link
        href={`/app/produzione/gestione-aree/${area.codice}/postazioni`}
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        Torna alla panoramica {area.nome}
      </Link>
    </div>
  );
}

function PostoAutorizzatiBlock({ postoId }: { postoId: string }) {
  const [items, setItems] = useState<PostoAutorizzato[]>([]);
  const [persone, setPersone] = useState<PersonaMinima[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [personaId, setPersonaId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [a, p] = await Promise.all([
      listAutorizzatiPostoAction(postoId),
      listPersoneMinimeAction(),
    ]);
    if (!a.success) {
      setError(a.error);
      return;
    }
    if (!p.success) {
      setError(p.error);
      return;
    }
    setError(null);
    setItems(a.items);
    setPersone(p.items);
    setIsAdmin(p.isAdmin);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postoId]);

  const used = new Set(items.map((i) => i.personaId));

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Persone autorizzate</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Solo chi è in organigramma e autorizzato può operare su questa
        postazione.
      </p>
      {isAdmin ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="min-w-[14rem] flex-1 text-xs text-[var(--muted)]">
            Persona
            <select
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">Seleziona…</option>
              {persone
                .filter((p) => !used.has(p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.cognome} {p.nome}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!personaId}
            onClick={async () => {
              const res = await addAutorizzazionePostoAction({
                postoId,
                personaId,
              });
              if (!res.success) setError(res.error);
              else {
                setPersonaId("");
                await load();
              }
            }}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Autorizza
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 divide-y divide-[var(--border)]">
        {items.length === 0 ? (
          <li className="py-2 text-sm text-[var(--muted)]">
            Nessuna persona autorizzata.
          </li>
        ) : (
          items.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between py-2 text-sm"
            >
              <span>{a.personaNome}</span>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={async () => {
                    const res = await removeAutorizzazionePostoAction(a.id);
                    if (!res.success) setError(res.error);
                    else await load();
                  }}
                  className="text-red-700 hover:underline"
                >
                  Revoca
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
