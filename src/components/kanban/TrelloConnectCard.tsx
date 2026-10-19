"use client";

import { useEffect, useState } from "react";
import {
  scollegaTrelloAction,
  statoTrelloAction,
  urlCollegamentoTrelloAction,
} from "@/app/actions/trello-utente";

export function TrelloConnectCard({ onChanged }: { onChanged?: () => void }) {
  const [collegato, setCollegato] = useState(false);
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [attesa, setAttesa] = useState(false);

  async function ricarica() {
    const res = await statoTrelloAction();
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setCollegato(res.collegato);
    setUsername(res.username);
    setAvatarUrl(res.avatarUrl);
    onChanged?.();
  }

  useEffect(() => {
    void ricarica();
    // Il primo caricamento non deve dipendere da onChanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!attesa) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { tipo?: string; errore?: string };
      if (!data || data.tipo !== "trello-collegato") return;
      setAttesa(false);
      if (data.errore) {
        setErrore(data.errore);
        return;
      }
      setErrore(null);
      void ricarica();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [attesa]);

  async function collega() {
    setErrore(null);
    const res = await urlCollegamentoTrelloAction(window.location.origin);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    const popup = window.open(res.url, "trello-collega", "popup,width=520,height=720");
    if (!popup) {
      setErrore("Il browser ha bloccato la finestra di Trello.");
      return;
    }
    setAttesa(true);
  }

  return (
    <section className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm">
      {collegato ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : null}
            <p className="text-sm text-slate-800">
              <span className="mr-1" aria-hidden>
                🟢
              </span>
              Account Trello collegato: <span className="font-semibold">@{username}</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            onClick={() => {
              void scollegaTrelloAction().then((res) => {
                if (!res.success) {
                  setErrore(res.error);
                  return;
                }
                setCollegato(false);
                setUsername("");
                setAvatarUrl("");
                onChanged?.();
              });
            }}
          >
            Scollega
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Collega il tuo account Trello per importare le bacheche a cui hai accesso.
          </p>
          <button
            type="button"
            disabled={attesa}
            onClick={() => void collega()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {attesa ? "In attesa di Trello…" : "Collega il tuo Account Trello"}
          </button>
        </div>
      )}
      {errore ? <p className="mt-2 text-sm text-red-700">{errore}</p> : null}
    </section>
  );
}
