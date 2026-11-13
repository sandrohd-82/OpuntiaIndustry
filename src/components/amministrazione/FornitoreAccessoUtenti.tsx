"use client";

import { useEffect, useState, useTransition } from "react";
import {
  cercaProfiliCollegabiliAction,
  collegaAccessoFornitoreAction,
  listaAccessiFornitoreAction,
  revocaAccessoFornitoreAction,
  type AccessoFornitoreRiga,
  type ProfiloCollegabile,
} from "@/app/actions/fornitore-accesso";

export function FornitoreAccessoUtenti({
  fornitoreId,
}: {
  fornitoreId: string;
}) {
  const [accessi, setAccessi] = useState<AccessoFornitoreRiga[]>([]);
  const [query, setQuery] = useState("");
  const [profili, setProfili] = useState<ProfiloCollegabile[]>([]);
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function ricarica() {
    startTransition(async () => {
      const res = await listaAccessiFornitoreAction(fornitoreId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setAccessi(res.accessi);
    });
  }

  useEffect(() => {
    ricarica();
    // Il pannello si monta all'apertura del dettaglio di questo fornitore.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fornitoreId]);

  function cerca(valore: string) {
    setQuery(valore);
    const testo = valore.trim();
    if (testo.length < 2) {
      setProfili([]);
      return;
    }
    startTransition(async () => {
      const res = await cercaProfiliCollegabiliAction(testo);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setProfili(res.profili);
    });
  }

  function collega(profileId: string) {
    setErrore(null);
    setMessaggio(null);
    startTransition(async () => {
      const res = await collegaAccessoFornitoreAction({
        profileId,
        fornitoreId,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio(
        res.spostato
          ? "Utente collegato. Il collegamento precedente è stato chiuso."
          : "Utente collegato a questa anagrafica."
      );
      setQuery("");
      setProfili([]);
      ricarica();
    });
  }

  function revoca(accessoId: string) {
    setErrore(null);
    setMessaggio(null);
    startTransition(async () => {
      const res = await revocaAccessoFornitoreAction(accessoId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio("Collegamento revocato.");
      ricarica();
    });
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-white p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Accesso portale fornitore
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Collega gli utenti che compilano Materiale in ingresso per questa
        anagrafica. Un utente resta collegato a un solo fornitore.
      </p>
      {accessi.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--muted)]">Nessun utente collegato.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {accessi.map((accesso) => (
            <li
              key={accesso.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span>
                <span className="font-medium">{accesso.nome}</span>
                {accesso.email ? (
                  <span className="text-[var(--muted)]"> · {accesso.email}</span>
                ) : null}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => revoca(accesso.id)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Revoca
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="block text-xs font-medium text-slate-700">
        Cerca utente per nome o email
        <input
          value={query}
          onChange={(event) => cerca(event.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Almeno 2 caratteri"
        />
      </label>
      {profili.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {profili.map((profilo) => (
            <li key={profilo.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => collega(profilo.id)}
                className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {profilo.nome}
                <span className="text-[var(--muted)]"> · {profilo.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {messaggio ? (
        <p className="mt-2 text-sm text-emerald-700">{messaggio}</p>
      ) : null}
      {errore ? <p className="mt-2 text-sm text-red-600">{errore}</p> : null}
    </div>
  );
}
