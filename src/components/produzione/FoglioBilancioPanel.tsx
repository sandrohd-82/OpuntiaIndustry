"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getFoglioConteggioAction,
  upsertFoglioConteggioAction,
} from "@/app/actions/produzione-aree";
import { calcolaBilancioMassa } from "@/lib/produzione/aree-posti";
import type { FoglioConteggio } from "@/lib/produzione/aree-posti";

type Props = {
  foglioId: string;
  foglioLabel: string;
  areaId: string;
  areaNome: string;
};

export function FoglioBilancioPanel({
  foglioId,
  foglioLabel,
  areaId,
  areaNome,
}: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<FoglioConteggio | null>(null);
  const [kgVersati, setKgVersati] = useState("");
  const [kgEssiccatori, setKgEssiccatori] = useState("");
  const [kgNc, setKgNc] = useState("");
  const [noteNc, setNoteNc] = useState("");
  const [esitoNc, setEsitoNc] = useState("");

  function load() {
    start(async () => {
      const res = await getFoglioConteggioAction(foglioId, areaId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItem(res.item);
      if (res.item) {
        setKgVersati(String(res.item.kgVersati));
        setKgEssiccatori(String(res.item.kgEssiccatori));
        setKgNc(String(res.item.kgNonConformi));
        setNoteNc(res.item.noteNc);
        setEsitoNc(res.item.esitoNc);
      }
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foglioId, areaId]);

  const preview = calcolaBilancioMassa({
    kgVersati: Number(kgVersati) || 0,
    kgEssiccatori: Number(kgEssiccatori) || 0,
    kgNonConformi: Number(kgNc) || 0,
  });

  function save() {
    start(async () => {
      const res = await upsertFoglioConteggioAction({
        foglioId,
        areaId,
        kgVersati: Number(kgVersati) || 0,
        kgEssiccatori: Number(kgEssiccatori) || 0,
        kgNonConformi: Number(kgNc) || 0,
        noteNc,
        esitoNc,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItem(res.item);
    });
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">
        Bilancio di massa · {areaNome}
      </h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Foglio {foglioLabel}: kg versati = kg pesati negli essiccatori + kg non
        conformi. Tolleranza 0,01 kg. Registrato sul foglio giornaliero.
      </p>
      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-[var(--muted)]">
          Kg versati (ingresso)
          <input
            type="number"
            min={0}
            step="0.001"
            value={kgVersati}
            onChange={(e) => setKgVersati(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Kg essiccatori
          <input
            type="number"
            min={0}
            step="0.001"
            value={kgEssiccatori}
            onChange={(e) => setKgEssiccatori(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Kg non conformi
          <input
            type="number"
            min={0}
            step="0.001"
            value={kgNc}
            onChange={(e) => setKgNc(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--muted)]">
          Note non conformità
          <input
            value={noteNc}
            onChange={(e) => setNoteNc(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs text-[var(--muted)]">
          Esito NC
          <input
            value={esitoNc}
            onChange={(e) => setEsitoNc(e.target.value)}
            placeholder="Aperta / chiusa / in corso"
            className="mt-1 w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p
          className={`text-xs font-medium ${
            preview.esito === "ok"
              ? "text-emerald-700"
              : preview.esito === "squilibrio"
                ? "text-red-700"
                : "text-[var(--muted)]"
          }`}
        >
          {preview.esito === "ok"
            ? "In equilibrio"
            : preview.esito === "squilibrio"
              ? `Squilibrio ${preview.deltaKg > 0 ? "+" : ""}${preview.deltaKg} kg`
              : "Incompleto: inserisci le quantità"}
          {item?.approvedAt
            ? ` · confermato ${new Date(item.approvedAt).toLocaleString("it-IT")}`
            : ""}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Salvataggio…" : "Registra sul foglio"}
        </button>
      </div>
    </div>
  );
}
