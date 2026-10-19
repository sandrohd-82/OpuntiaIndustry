"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiviaBachecaAction,
  creaBachecaAction,
  listBachecheAction,
} from "@/app/actions/kanban";

export function BachecheHome() {
  const router = useRouter();
  const [aperte, setAperte] = useState<{ id: string; titolo: string; descrizione: string }[]>([]);
  const [archiviate, setArchiviate] = useState<{ id: string; titolo: string }[]>([]);
  const [titolo, setTitolo] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [archivio, setArchivio] = useState(false);

  async function ricarica() {
    const res = await listBachecheAction();
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    setAperte(res.aperte);
    setArchiviate(res.archiviate);
  }

  useEffect(() => {
    void ricarica();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {errore ? (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errore}</p>
      ) : null}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void creaBachecaAction(titolo).then((res) => {
            if (!res.success) {
              setErrore(res.error);
              return;
            }
            router.push(`/app/promemorie-e-note/bacheche/${res.id}`);
          });
        }}
      >
        <input
          value={titolo}
          onChange={(e) => setTitolo(e.target.value)}
          placeholder="Nome della nuova bacheca"
          className="min-w-64 flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white">
          Crea bacheca
        </button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {aperte.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => router.push(`/app/promemorie-e-note/bacheche/${board.id}`)}
            className="rounded-xl border border-[var(--border)] bg-white p-4 text-left shadow-sm hover:border-[var(--primary)]"
          >
            <span className="block font-semibold text-slate-900">{board.titolo}</span>
            <span className="mt-1 block text-sm text-slate-500">{board.descrizione || "Bacheca di lavoro"}</span>
          </button>
        ))}
      </div>
      <button type="button" className="text-sm text-slate-600 underline" onClick={() => setArchivio((v) => !v)}>
        {archivio ? "Nascondi archiviate" : `Bacheche archiviate (${archiviate.length})`}
      </button>
      {archivio ? (
        <ul className="space-y-2">
          {archiviate.map((board) => (
            <li key={board.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2">
              <span>{board.titolo}</span>
              <button
                type="button"
                className="text-sm text-[var(--primary)] underline"
                onClick={() => {
                  void archiviaBachecaAction(board.id, true).then(() => ricarica());
                }}
              >
                Ripristina
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
