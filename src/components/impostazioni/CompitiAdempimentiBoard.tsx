"use client";

import { useEffect, useState } from "react";
import {
  listCompitiAdempimentiAction,
  saveCompitoAdempimentoAction,
  type CompitoAdempimento,
  type OperatoreCompito,
} from "@/app/actions/compiti-adempimenti";
import { PageLoading } from "@/components/ui/BusyIndicator";

export function CompitiAdempimentiBoard() {
  const [compiti, setCompiti] = useState<CompitoAdempimento[]>([]);
  const [operatori, setOperatori] = useState<OperatoreCompito[]>([]);
  const [spiegazioni, setSpiegazioni] = useState<Record<string, string>>({});
  const [scelti, setScelti] = useState<Record<string, string[]>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    void listCompitiAdempimentiAction().then((res) => {
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setCompiti(res.compiti);
      setOperatori(res.operatori);
      setSpiegazioni(
        Object.fromEntries(res.compiti.map((c) => [c.id, c.spiegazione]))
      );
      setScelti(
        Object.fromEntries(res.compiti.map((c) => [c.id, c.persone.map((p) => p.id)]))
      );
      setReady(true);
    });
  }, []);

  function toggle(compitoId: string, profileId: string) {
    setScelti((prev) => {
      const current = prev[compitoId] ?? [];
      const next = current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId];
      return { ...prev, [compitoId]: next };
    });
  }

  async function salva(compito: CompitoAdempimento) {
    setSavingId(compito.id);
    setError(null);
    setMsg(null);
    const res = await saveCompitoAdempimentoAction({
      compitoId: compito.id,
      spiegazione: spiegazioni[compito.id] ?? "",
      profileIds: scelti[compito.id] ?? [],
    });
    setSavingId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setMsg(`${compito.titolo} aggiornato.`);
  }

  if (!ready) return <PageLoading label="Caricamento compiti" />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted)]">
        Le persone selezionate ricevono la notifica urgente quando un preventivo
        chiede il calcolo della spedizione. Chi è incaricato deve poter aprire
        Preventivi.
      </p>
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      ) : null}
      {compiti.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-8 text-sm">
          Nessun compito configurato.
        </p>
      ) : (
        compiti.map((compito) => (
          <section
            key={compito.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
          >
            <h2 className="text-base font-semibold">{compito.titolo}</h2>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block font-medium">Spiegazione</span>
              <textarea
                value={spiegazioni[compito.id] ?? ""}
                onChange={(e) =>
                  setSpiegazioni((prev) => ({ ...prev, [compito.id]: e.target.value }))
                }
                rows={4}
                className="w-full rounded border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <fieldset className="mt-3">
              <legend className="mb-2 text-sm font-medium">Persone incaricate</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {operatori.map((op) => {
                  const checked = (scelti[compito.id] ?? []).includes(op.id);
                  return (
                    <label key={op.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(compito.id, op.id)}
                      />
                      {op.nome}
                    </label>
                  );
                })}
              </div>
              {operatori.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nessun operatore attivo.</p>
              ) : null}
            </fieldset>
            <button
              type="button"
              disabled={savingId === compito.id}
              onClick={() => void salva(compito)}
              className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {savingId === compito.id ? "Salvataggio…" : "Salva compito"}
            </button>
          </section>
        ))
      )}
    </div>
  );
}
