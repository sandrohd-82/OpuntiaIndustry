"use client";

import { useEffect, useRef, useState } from "react";
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
  const popupRef = useRef<Window | null>(null);
  const provaAnnullata = useRef(false);

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
    const timer = window.setInterval(() => {
      if (provaAnnullata.current || !popupRef.current?.closed) return;
      popupRef.current = null;
      setAttesa(false);
      void ricarica();
    }, 400);
    return () => window.clearInterval(timer);
  }, [attesa]);

  useEffect(() => {
    if (!attesa) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { tipo?: string; errore?: string };
      if (!data || data.tipo !== "trello-collegato" || provaAnnullata.current) return;
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
    provaAnnullata.current = false;
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
    popupRef.current = popup;
    setAttesa(true);
  }

  async function annullaProva() {
    provaAnnullata.current = true;
    popupRef.current?.close();
    popupRef.current = null;
    setAttesa(false);
    const res = await scollegaTrelloAction();
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setErrore(null);
    setCollegato(false);
    setUsername("");
    setAvatarUrl("");
    onChanged?.();
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
            onClick={() => void annullaProva()}
          >
            {errore ? "Elimina il collegamento e ricomincia" : "Scollega"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">
            Collega il tuo account Trello per importare le bacheche a cui hai accesso.
          </p>
          <div className="flex flex-wrap gap-2">
            {attesa || errore ? (
              <button
                type="button"
                onClick={() => void annullaProva()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                Elimina la prova e ricomincia
              </button>
            ) : null}
            <button
              type="button"
              disabled={attesa}
              onClick={() => void collega()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {attesa ? "In attesa di Trello…" : "Collega il tuo Account Trello"}
            </button>
          </div>
        </div>
      )}
      {errore ? <p className="mt-2 text-sm text-red-700">{errore}</p> : null}
      {attesa ? (
        <p className="mt-2 text-sm text-slate-600">
          Se Trello segnala un errore, elimina la prova e ripeti il collegamento.
        </p>
      ) : null}
    </section>
  );
}
