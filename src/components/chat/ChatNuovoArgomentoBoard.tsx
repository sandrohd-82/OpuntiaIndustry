"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createChatTopic } from "@/lib/chat/topic-api";
import { listPeerCandidates } from "@/lib/chat/queries";
import type { ChatStatus } from "@/lib/chat/types";
import { createClient } from "@/lib/supabase/client";

type Props = { userId: string };

type Step = "titolo" | "membri";

export function ChatNuovoArgomentoBoard({ userId }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("titolo");
  const [titolo, setTitolo] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peers, setPeers] = useState<
    { id: string; name: string; email: string; chatStatus: ChatStatus }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    void listPeerCandidates(supabase, userId)
      .then(setPeers)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Errore caricamento utenti")
      );
  }, [userId]);

  function goMembri() {
    const t = titolo.trim();
    if (!t) {
      setError("Inserisci il titolo dell’argomento.");
      return;
    }
    if (t.length > 100) {
      setError("Il titolo non può superare 100 caratteri (spazi inclusi).");
      return;
    }
    setError(null);
    setStep("membri");
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function create() {
    startTransition(async () => {
      const supabase = createClient();
      try {
        const id = await createChatTopic(
          supabase,
          titolo,
          [...selected]
        );
        router.push(`/app/chat/argomento/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Creazione fallita");
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {step === "titolo" ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Titolo dell’argomento</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Massimo 100 caratteri (spazi inclusi).
          </p>
          <input
            value={titolo}
            onChange={(e) => setTitolo(e.target.value.slice(0, 100))}
            maxLength={100}
            autoFocus
            placeholder="Es. Incontro Aboca 01/12/26"
            className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                goMembri();
              }
            }}
          />
          <p className="mt-1 text-right text-xs text-[var(--muted)]">
            {titolo.length}/100
          </p>
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={goMembri}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
            >
              Continua → membri
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <h2 className="text-sm font-semibold">Membri dell’argomento</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Argomento: <strong>{titolo.trim()}</strong>. Tu sei già incluso.
            Seleziona gli altri partecipanti.
          </p>
          <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
            {peers.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {p.name}
                    </span>
                    <span className="block truncate text-xs text-[var(--muted)]">
                      {p.email}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex justify-between gap-2">
            <button
              type="button"
              onClick={() => setStep("titolo")}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Indietro
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={create}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Creazione…" : "Crea e apri chat"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
