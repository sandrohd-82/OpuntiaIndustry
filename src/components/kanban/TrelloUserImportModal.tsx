"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  bachecheTrelloAction,
  importaBachecaTrelloAction,
  listeTrelloAction,
  statoTrelloAction,
} from "@/app/actions/trello-utente";
import { TrelloConnectCard } from "@/components/kanban/TrelloConnectCard";

export function TrelloUserImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const titleId = useId();
  const [collegato, setCollegato] = useState<boolean | null>(null);
  const [bacheche, setBacheche] = useState<{ id: string; nome: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [liste, setListe] = useState<{ id: string; nome: string }[]>([]);
  const [scelte, setScelte] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  async function leggiStato() {
    const stato = await statoTrelloAction();
    if (!stato.success) {
      setErrore(stato.error);
      setCollegato(false);
      return;
    }
    setCollegato(stato.collegato);
    if (!stato.collegato) return;
    const res = await bachecheTrelloAction();
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setBacheche(res.bacheche);
  }

  useEffect(() => {
    void leggiStato();
  }, []);

  useEffect(() => {
    if (!boardId) {
      setListe([]);
      setScelte([]);
      return;
    }
    void listeTrelloAction(boardId).then((res) => {
      if (!res.success) {
        setErrore(res.error);
        return;
      }
      setListe(res.liste);
      setScelte(res.liste.map((lista) => lista.id));
    });
  }, [boardId]);

  async function importa() {
    if (!boardId || invio) return;
    setInvio(true);
    setErrore(null);
    const res = await importaBachecaTrelloAction(boardId, scelte);
    setInvio(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    router.push(`/app/promemorie-e-note/bacheche/${res.id}`);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/60 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 text-slate-900 shadow-xl"
      >
        <h2 id={titleId} className="text-base font-semibold">
          Importa da Trello
        </h2>
        {collegato === null ? <p className="mt-3 text-sm text-slate-500">Caricamento…</p> : null}
        {collegato === false ? (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-slate-600">
              Per vedere le tue bacheche devi prima collegare il tuo account Trello.
            </p>
            <TrelloConnectCard onChanged={() => void leggiStato()} />
          </div>
        ) : null}
        {collegato ? (
          <div className="mt-4 space-y-3">
            <label className="block text-sm">
              Bacheca
              <select
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="">Scegli una bacheca</option>
                {bacheche.map((bacheca) => (
                  <option key={bacheca.id} value={bacheca.id}>
                    {bacheca.nome}
                  </option>
                ))}
              </select>
            </label>
            {liste.length ? (
              <fieldset className="space-y-1">
                <legend className="text-sm">Liste da importare</legend>
                {liste.map((lista) => (
                  <label key={lista.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={scelte.includes(lista.id)}
                      onChange={() => {
                        setScelte((prev) =>
                          prev.includes(lista.id)
                            ? prev.filter((id) => id !== lista.id)
                            : [...prev, lista.id]
                        );
                      }}
                    />
                    {lista.nome}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </div>
        ) : null}
        {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={invio}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
          >
            Chiudi
          </button>
          {collegato ? (
            <button
              type="button"
              onClick={() => void importa()}
              disabled={invio || !boardId || scelte.length === 0}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {invio ? "Importazione…" : "Importa"}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
