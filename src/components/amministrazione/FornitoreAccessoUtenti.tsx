"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startImpersonationAction } from "@/app/actions/impersonation";
import {
  cercaProfiliCollegabiliAction,
  collegaAccessoFornitoreAction,
  creaAccountFornitoreAction,
  impostaStatoAccountFornitoreAction,
  listaAccessiFornitoreAction,
  revocaAccessoFornitoreAction,
  type AccessoFornitoreRiga,
  type ProfiloCollegabile,
} from "@/app/actions/fornitore-accesso";
import { PROFILE_STATO_LABELS, type ProfileStatoOperativo } from "@/lib/auth/stato-operativo";

function etichettaStato(stato: ProfileStatoOperativo): string {
  if (stato === "operativo") return "Attivo";
  if (stato === "sospeso" || stato === "bloccato") return "Sospeso";
  return PROFILE_STATO_LABELS[stato];
}

export function FornitoreAccessoUtenti({
  fornitoreId,
}: {
  fornitoreId: string;
}) {
  const router = useRouter();
  const [accessi, setAccessi] = useState<AccessoFornitoreRiga[]>([]);
  const [gestioneAccount, setGestioneAccount] = useState(false);
  const [query, setQuery] = useState("");
  const [profili, setProfili] = useState<ProfiloCollegabile[]>([]);
  const [nome, setNome] = useState("");
  const [cognome, setCognome] = useState("");
  const [email, setEmail] = useState("");
  const [confermaSospensione, setConfermaSospensione] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);
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
      setGestioneAccount(res.gestioneAccount);
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
    setAvviso(null);
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
    setAvviso(null);
    startTransition(async () => {
      const res = await revocaAccessoFornitoreAction(accessoId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setMessaggio("Collegamento revocato. L'account resta attivo.");
      ricarica();
    });
  }

  function crea() {
    setErrore(null);
    setMessaggio(null);
    setAvviso(null);
    startTransition(async () => {
      const res = await creaAccountFornitoreAction({
        fornitoreId,
        nome,
        cognome,
        email,
      });
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setNome("");
      setCognome("");
      setEmail("");
      setMessaggio(
        "Account creato e collegato. Parte con i soli accessi dell'Area Fornitori. Il primo accesso si invia quando il profilo diventa operativo."
      );
      ricarica();
    });
  }

  function permessi(profileId: string) {
    setErrore(null);
    startTransition(async () => {
      const res = await startImpersonationAction(profileId);
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      router.push(res.redirectTo);
      router.refresh();
    });
  }

  function statoAccount(profileId: string, stato: "sospeso" | "operativo", conferma = false) {
    setErrore(null);
    setMessaggio(null);
    setAvviso(null);
    startTransition(async () => {
      const res = await impostaStatoAccountFornitoreAction({
        fornitoreId,
        profileId,
        stato,
        confermaAltriAccessi: conferma,
      });
      if (!res.success) {
        if (res.richiedeConferma) {
          setConfermaSospensione(profileId);
          setAvviso(res.error);
          return;
        }
        setErrore(res.error);
        return;
      }
      setConfermaSospensione(null);
      setMessaggio(
        stato === "sospeso"
          ? "Account sospeso. Non entra nel gestionale. Il collegamento al fornitore resta."
          : "Account riattivato."
      );
      ricarica();
    });
  }

  return (
    <div className="sm:col-span-2 rounded-lg border border-[var(--border)] bg-white p-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Accesso portale fornitore
      </p>
      <p className="mb-3 text-sm text-slate-600">
        Un account resta collegato a un solo fornitore. Questo fornitore può averne più di uno.
        Sospendere blocca il login. Revocare toglie solo il collegamento.
      </p>
      {accessi.length === 0 ? (
        <p className="mb-3 text-sm text-[var(--muted)]">Nessun utente collegato.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {accessi.map((accesso) => {
            const sospeso = accesso.stato === "sospeso" || accesso.stato === "bloccato";
            return (
              <li key={accesso.id} className="rounded-md border border-slate-100 px-2 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{accesso.nome}</span>
                    {accesso.email ? (
                      <span className="text-[var(--muted)]"> · {accesso.email}</span>
                    ) : null}
                    <span className="text-[var(--muted)]"> · {etichettaStato(accesso.stato)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {gestioneAccount ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => permessi(accesso.profileId)}
                        className="rounded-md px-2 py-1 text-xs font-medium text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                      >
                        Gestisci permessi
                      </button>
                    ) : null}
                    {gestioneAccount && !sospeso ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => statoAccount(accesso.profileId, "sospeso")}
                        className="rounded-md px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                      >
                        Sospendi account
                      </button>
                    ) : null}
                    {gestioneAccount && sospeso ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => statoAccount(accesso.profileId, "operativo")}
                        className="rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        Riattiva account
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => revoca(accesso.id)}
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Revoca collegamento
                    </button>
                  </span>
                </div>
                {confermaSospensione === accesso.profileId && avviso ? (
                  <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-950">
                    <p>{avviso}</p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => statoAccount(accesso.profileId, "sospeso", true)}
                      className="mt-2 rounded-md bg-amber-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                    >
                      Conferma sospensione
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {gestioneAccount ? (
        <form
          className="mb-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            crea();
          }}
        >
          <input
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Nome"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            value={cognome}
            onChange={(event) => setCognome(event.target.value)}
            placeholder="Cognome"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60 sm:col-span-3 sm:w-fit"
          >
            Crea account
          </button>
        </form>
      ) : null}
      <label className="block text-xs font-medium text-slate-700">
        Collega account esistente
        <input
          value={query}
          onChange={(event) => cerca(event.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--border)] px-3 py-2 text-sm"
          placeholder="Cerca per nome o email, almeno 2 caratteri"
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
      {messaggio ? <p className="mt-2 text-sm text-emerald-700">{messaggio}</p> : null}
      {errore ? <p className="mt-2 text-sm text-red-600">{errore}</p> : null}
    </div>
  );
}
