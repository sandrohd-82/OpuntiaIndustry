"use client";

import { useCallback, useEffect, useState } from "react";
import { FaLocationDot, FaPen, FaPlus, FaTrash } from "react-icons/fa6";
import {
  listSediAllAction,
  softDeleteSedeAction,
  upsertSedeAction,
} from "@/app/actions/impostazioni-sedi";
import { ChatLocationMapModal } from "@/components/chat/ChatLocationMapModal";
import {
  SEDI_TIPI,
  SEDI_TIPO_LABEL,
  type ImpostazioniSede,
  type SedeTipo,
} from "@/lib/impostazioni/sedi";
import type { LocationPayload } from "@/lib/chat/share";

type Draft = {
  id?: string;
  nome: string;
  indirizzo: string;
  descrizione: string;
  tipoSede: SedeTipo;
  mapsUrl: string;
  lat: number | null;
  lng: number | null;
};

const emptyDraft = (): Draft => ({
  nome: "",
  indirizzo: "",
  descrizione: "",
  tipoSede: "amministrativa",
  mapsUrl: "",
  lat: null,
  lng: null,
});

function draftFromSede(s: ImpostazioniSede): Draft {
  return {
    id: s.id,
    nome: s.nome,
    indirizzo: s.indirizzo,
    descrizione: s.descrizione,
    tipoSede: s.tipoSede,
    mapsUrl: s.mapsUrl,
    lat: s.lat,
    lng: s.lng,
  };
}

export function SediBoard() {
  const [sedi, setSedi] = useState<ImpostazioniSede[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [mapsOpen, setMapsOpen] = useState(false);
  const [mapsError, setMapsError] = useState("");

  const reload = useCallback(async () => {
    const res = await listSediAllAction();
    if (!res.success) {
      setError(res.error);
      setSedi([]);
      return;
    }
    setError("");
    setSedi(res.sedi);
  }, []);

  useEffect(() => {
    setLoading(true);
    void reload().finally(() => setLoading(false));
  }, [reload]);

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    const res = await upsertSedeAction({
      id: draft.id,
      nome: draft.nome,
      indirizzo: draft.indirizzo,
      descrizione: draft.descrizione,
      tipoSede: draft.tipoSede,
      mapsUrl: draft.mapsUrl,
      lat: draft.lat,
      lng: draft.lng,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setDraft(null);
    await reload();
  }

  async function archive(s: ImpostazioniSede) {
    if (
      !window.confirm(
        `Archiviare la sede «${s.nome}»? Resta in storico (soft delete), non viene cancellata.`
      )
    ) {
      return;
    }
    const res = await softDeleteSedeAction(s.id);
    if (!res.success) {
      setError(res.error);
      return;
    }
    await reload();
  }

  function onMapsConfirm(payload: LocationPayload) {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            indirizzo: payload.label,
            lat: payload.lat,
            lng: payload.lng,
            mapsUrl: `https://www.google.com/maps/search/?api=1&query=${payload.lat},${payload.lng}`,
          }
        : prev
    );
    setMapsOpen(false);
    setMapsError("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-slate-600">
          Catalogo delle sedi aziendali. Servono per il luogo di partenza
          (spedizione / ritiro) e per distinguere uffici, produzione, magazzini
          e terreni. Puoi crearne quante ne servono.
        </p>
        <button
          type="button"
          onClick={() => {
            setError("");
            setDraft(emptyDraft());
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
        >
          <FaPlus size={12} />
          Nuova sede
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Caricamento sedi…</p>
      ) : sedi.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-slate-500">
          Nessuna sede registrata. Crea la prima con «Nuova sede».
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sedi.map((s) => (
            <li
              key={s.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">{s.nome}</p>
                  <p className="mt-0.5 text-xs font-medium text-[var(--primary)]">
                    {SEDI_TIPO_LABEL[s.tipoSede]}
                    {!s.attiva ? " · non attiva" : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setDraft(draftFromSede(s));
                    }}
                    className="rounded-lg border border-[var(--border)] p-2 text-slate-600 hover:bg-slate-50"
                    title="Modifica"
                    aria-label="Modifica"
                  >
                    <FaPen size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void archive(s)}
                    className="rounded-lg border border-[var(--border)] p-2 text-red-600 hover:bg-red-50"
                    title="Archivia"
                    aria-label="Archivia"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </div>
              {s.indirizzo ? (
                <p className="mt-2 text-sm text-slate-700">{s.indirizzo}</p>
              ) : null}
              {s.descrizione ? (
                <p className="mt-1 text-xs text-slate-500">{s.descrizione}</p>
              ) : null}
              {s.mapsUrl ? (
                <a
                  href={s.mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--primary)]"
                >
                  <FaLocationDot size={11} />
                  Apri in Maps
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center"
          onClick={() => !saving && setDraft(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-semibold">
              {draft.id ? "Modifica sede" : "Nuova sede"}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Nome
                </span>
                <input
                  value={draft.nome}
                  onChange={(e) =>
                    setDraft({ ...draft, nome: e.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="Es. Stabilimento Licata"
                />
              </label>

              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Indirizzo (Maps)
                </span>
                <div className="flex gap-2">
                  <input
                    value={draft.indirizzo}
                    onChange={(e) =>
                      setDraft({ ...draft, indirizzo: e.target.value })
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    placeholder="Cerca e conferma su Google Maps"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setMapsError("");
                      setMapsOpen(true);
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium"
                  >
                    <FaLocationDot size={12} />
                    Maps
                  </button>
                </div>
                {mapsError ? (
                  <p className="mt-1 text-xs text-red-700">{mapsError}</p>
                ) : null}
              </div>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Tipo di sede
                </span>
                <select
                  value={draft.tipoSede}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      tipoSede: e.target.value as SedeTipo,
                    })
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {SEDI_TIPI.map((t) => (
                    <option key={t} value={t}>
                      {SEDI_TIPO_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">
                  Descrizione (facoltativa)
                </span>
                <textarea
                  value={draft.descrizione}
                  onChange={(e) =>
                    setDraft({ ...draft, descrizione: e.target.value })
                  }
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  placeholder="Note operative, accessi, referenti…"
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDraft(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                {saving ? "Salvataggio…" : "Salva sede"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ChatLocationMapModal
        open={mapsOpen}
        onClose={() => setMapsOpen(false)}
        onConfirm={onMapsConfirm}
        onError={setMapsError}
        confirmLabel="Usa questo indirizzo"
      />
    </div>
  );
}
