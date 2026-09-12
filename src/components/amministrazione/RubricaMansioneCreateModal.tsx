"use client";

import { useMemo, useState } from "react";
import { FaXmark } from "react-icons/fa6";
import { createRubricaMansioneAction } from "@/app/actions/rubrica";
import { mansioniAffini } from "@/lib/rubrica/mansioni-affinita";
import type { RubricaMansione } from "@/lib/rubrica/types";

type Props = {
  catalog: RubricaMansione[];
  onClose: () => void;
  onCreated: (item: RubricaMansione) => void;
  onSelectExisting: (item: RubricaMansione) => void;
  testMode?: boolean;
  elevated?: boolean;
};

export function RubricaMansioneCreateModal({
  catalog,
  onClose,
  onCreated,
  onSelectExisting,
  testMode = false,
  elevated = false,
}: Props) {
  const [nome, setNome] = useState("");
  const [continua, setContinua] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const affini = useMemo(() => mansioniAffini(nome, catalog), [nome, catalog]);
  const exact = affini.find((a) => a.affinita >= 100);
  const salvaAttivo =
    nome.trim().length >= 2 && !exact && (affini.length === 0 || continua);

  function resetNome(next: string) {
    setNome(next);
    setContinua(false);
    setError(null);
  }

  async function save() {
    if (!salvaAttivo) return;
    setBusy(true);
    setError(null);
    if (testMode) {
      const item: RubricaMansione = {
        id: crypto.randomUUID(),
        codice: nome.trim().toLowerCase().replace(/\s+/g, "-"),
        nome: nome.trim(),
        documentoStato: "approvato",
        versione: 1,
      };
      setBusy(false);
      onCreated(item);
      return;
    }
    const res = await createRubricaMansioneAction({
      nome: nome.trim(),
      confermaAffinita: continua,
    });
    setBusy(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    onCreated(res.item);
  }

  return (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10 ${
        elevated ? "z-[100]" : "z-[90]"
      }`}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Nuova mansione</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Prima di attivare Salva, il sistema confronta il nome con le
              mansioni già presenti (affinità &gt; 75%).
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Chiudi">
            <FaXmark />
          </button>
        </div>

        <label className="mt-4 block text-sm">
          <span className="mb-1 block font-medium">Nome mansione *</span>
          <input
            value={nome}
            onChange={(e) => resetNome(e.target.value)}
            placeholder="Es. Autista, Titolare, Commerciale…"
            className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
        </label>

        {affini.length > 0 ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-sm font-medium text-amber-950">
              Mansioni con affinità maggiore del 75%
            </p>
            <p className="mt-1 text-xs text-amber-900">
              Seleziona una voce esistente per interrompere il salvataggio,
              oppure continua se è davvero una mansione nuova.
            </p>
            <ul className="mt-2 space-y-1.5">
              {affini.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      const hit = catalog.find((m) => m.id === a.id);
                      if (hit) onSelectExisting(hit);
                    }}
                    className="flex w-full items-center justify-between rounded-md bg-white px-2.5 py-1.5 text-left text-sm ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    <span>{a.nome}</span>
                    <span className="text-xs font-semibold text-amber-800">
                      {a.affinita}%
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {exact ? (
              <p className="mt-2 text-xs text-amber-900">
                Nome già presente: usa la mansione esistente.
              </p>
            ) : !continua ? (
              <button
                type="button"
                onClick={() => setContinua(true)}
                className="mt-2 text-sm font-medium text-amber-950 underline"
              >
                Continua comunque
              </button>
            ) : (
              <p className="mt-2 text-xs font-medium text-amber-950">
                Hai scelto di continuare. Ora puoi salvare.
              </p>
            )}
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-[var(--border)] py-2.5 text-sm"
          >
            Annulla
          </button>
          <button
            type="button"
            disabled={busy || !salvaAttivo}
            onClick={() => void save()}
            className="flex-1 rounded-lg bg-[var(--primary)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Salvataggio…" : "Salva mansione"}
          </button>
        </div>
      </div>
    </div>
  );
}
