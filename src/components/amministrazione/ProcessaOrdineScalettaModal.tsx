"use client";

import { useEffect, useId, useState } from "react";
import { processOrdineInScalettaAction } from "@/app/actions/ordini";
import { listAttivitaByProdottoAction } from "@/app/actions/attivita";
import { calcolaConsegnaOrdineAction } from "@/app/actions/produzione-capacita";
import { ConsegnaCalendarioModal } from "@/components/amministrazione/ConsegnaCalendarioModal";
import {
  attivitaToOrdineDraft,
  type AttivitaOrdineDraft,
} from "@/lib/amministrazione/attivita";
import {
  labelTipoOrdine,
  type Ordine,
} from "@/lib/amministrazione/ordini";
import type { CapacitaCalcoloResult } from "@/lib/amministrazione/produzione-capacita";

type Props = {
  ordine: Ordine;
  onClose: () => void;
  onSaved: (ordine: Ordine) => void;
};

export function ProcessaOrdineScalettaModal({
  ordine,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const riga = ordine.righe[0];
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calcolo, setCalcolo] = useState<CapacitaCalcoloResult | null>(null);
  const [calcoloLoading, setCalcoloLoading] = useState(false);
  const [calendarioOpen, setCalendarioOpen] = useState(false);
  const [usaSabato, setUsaSabato] = useState(ordine.usaSabato);
  const [usaMagazzino, setUsaMagazzino] = useState(ordine.usaMagazzino);
  const [urgente, setUrgente] = useState(ordine.urgente);
  const [attivitaDrafts, setAttivitaDrafts] = useState<AttivitaOrdineDraft[]>(
    []
  );

  useEffect(() => {
    if (!riga?.prodottoId) return;
    let cancelled = false;
    void listAttivitaByProdottoAction(riga.prodottoId).then((res) => {
      if (cancelled || !res.success) return;
      setAttivitaDrafts(res.attivita.map(attivitaToOrdineDraft));
    });
    return () => {
      cancelled = true;
    };
  }, [riga?.prodottoId]);

  useEffect(() => {
    if (!riga) return;
    let cancelled = false;
    setCalcoloLoading(true);
    void calcolaConsegnaOrdineAction({
      prodottoId: riga.prodottoId,
      prodottoCodice: riga.prodottoCodice,
      quantitaKg: riga.quantita,
      consegnaTipo: ordine.consegnaTipo === "data" ? "data" : "asap",
      dataRichiesta:
        ordine.consegnaTipo === "data" ? ordine.dataConsegna : null,
      urgente,
      usaMagazzino,
      usaSabato,
    }).then((res) => {
      if (cancelled) return;
      setCalcoloLoading(false);
      if (!res.success) {
        setError(res.error);
        setCalcolo(null);
        return;
      }
      setError(null);
      setCalcolo(res.calcolo);
    });
    return () => {
      cancelled = true;
    };
  }, [
    riga?.prodottoId,
    riga?.prodottoCodice,
    riga?.quantita,
    ordine.consegnaTipo,
    ordine.dataConsegna,
    urgente,
    usaMagazzino,
    usaSabato,
  ]);

  async function confirmCalendario(payload: {
    giorniProduzione: string[];
    giorniAttivita: string[];
    segmentiAttivita: Array<{
      attivitaId: string;
      codice: string;
      titolo: string;
      dates: string[];
    }>;
    dataConsegna: string;
    attivitaDrafts: AttivitaOrdineDraft[];
  }) {
    setSaving(true);
    setError(null);
    const result = await processOrdineInScalettaAction({
      ordineId: ordine.id,
      giorniProduzione: payload.giorniProduzione,
      giorniAttivita: payload.giorniAttivita,
      attivitaSnapshot: payload.segmentiAttivita,
      dataConsegnaCalendario: payload.dataConsegna,
      urgente,
      usaMagazzino,
      usaSabato,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setAttivitaDrafts(payload.attivitaDrafts);
    onSaved(result.ordine);
  }

  async function processSenzaGiorni() {
    if (!calcolo?.dataConsegnaStimata) {
      setError("Impossibile stimare la data di consegna.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await processOrdineInScalettaAction({
      ordineId: ordine.id,
      giorniProduzione: [],
      giorniAttivita: [],
      attivitaSnapshot: [],
      dataConsegnaCalendario: calcolo.dataConsegnaStimata,
      urgente,
      usaMagazzino,
      usaSabato,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error);
      return;
    }
    onSaved(result.ordine);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Processa e metti in scaletta
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {ordine.numeroInterno} · {labelTipoOrdine(ordine.tipo)} ·{" "}
          {ordine.cliente}
        </p>
        {riga ? (
          <p className="mt-1 text-sm">
            {riga.prodottoCodice} — {riga.prodottoNome} ·{" "}
            {riga.quantita.toLocaleString("it-IT")} kg
          </p>
        ) : (
          <p className="mt-2 text-sm text-red-700">Nessuna riga prodotto.</p>
        )}

        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={urgente}
              onChange={(e) => setUrgente(e.target.checked)}
            />
            Urgente
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={usaMagazzino}
              onChange={(e) => setUsaMagazzino(e.target.checked)}
            />
            Usa magazzino
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={usaSabato}
              onChange={(e) => setUsaSabato(e.target.checked)}
            />
            Includi sabato
          </label>
        </div>

        <div className="mt-4 rounded-lg border border-[var(--border)] px-3 py-3 text-sm">
          {calcoloLoading ? (
            <p className="text-[var(--muted)]">Calcolo capacità…</p>
          ) : calcolo ? (
            <ul className="space-y-1">
              <li>
                Giorni lavorativi stimati:{" "}
                <strong>{calcolo.giorniLavorativiNecessari}</strong>
              </li>
              <li>
                Consegna stimata:{" "}
                <strong>
                  {calcolo.dataConsegnaStimata
                    ? new Date(calcolo.dataConsegnaStimata).toLocaleDateString(
                        "it-IT"
                      )
                    : "—"}
                </strong>
              </li>
            </ul>
          ) : (
            <p className="text-[var(--muted)]">Calcolo non disponibile.</p>
          )}
        </div>

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Annulla
          </button>
          {calcolo && calcolo.giorniLavorativiNecessari > 0 ? (
            <button
              type="button"
              disabled={saving || !riga}
              onClick={() => setCalendarioOpen(true)}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Apri calendario e processa"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !calcolo || !riga}
              onClick={() => void processSenzaGiorni()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Processa senza giorni di linea"}
            </button>
          )}
        </div>
      </div>

      {calendarioOpen && calcolo ? (
        <ConsegnaCalendarioModal
          giorniProduzioneNecessari={calcolo.giorniLavorativiNecessari}
          kgOrdine={riga?.quantita ?? 0}
          usaSabato={usaSabato}
          onToggleSabato={setUsaSabato}
          attivitaDrafts={attivitaDrafts}
          onAttivitaDraftsChange={setAttivitaDrafts}
          onConfirm={(payload) => {
            setCalendarioOpen(false);
            void confirmCalendario(payload);
          }}
          onClose={() => setCalendarioOpen(false)}
        />
      ) : null}
    </div>
  );
}
