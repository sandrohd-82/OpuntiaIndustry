"use client";

import { useEffect, useId, useState } from "react";
import {
  createCorriereAction,
  forzaConsegnaSchedaAction,
  listCorrieriAction,
  registraRitiroAction,
} from "@/app/actions/ritiro-ordini";
import { checkShippingTrackingAction } from "@/app/actions/shipping-tracking";
import { getSchedaOrdineDettaglioAction } from "@/app/actions/schede-ordini";
import type { ProduzioneCorriere } from "@/lib/produzione/corrieri";
import {
  SCHEDA_EVENTO_LABEL,
  SCHEDA_STATO_LABEL,
  type SchedaDettaglio,
  type SchedaEventoTipo,
} from "@/lib/produzione/schede-ordini";

type Props = {
  schedaId: string;
  onClose: () => void;
  focusRitiro?: boolean;
  onChanged?: () => void;
};

function toLocalInput(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function classeEvento(tipo: SchedaEventoTipo): string {
  if (tipo === "problema") return "border-amber-300 bg-amber-50";
  if (tipo === "completa" || tipo === "lavorazione") {
    return "border-emerald-300 bg-emerald-50";
  }
  if (tipo === "confezionamento" || tipo === "pronto_ritiro") {
    return "border-sky-300 bg-sky-50";
  }
  if (tipo === "archivio") return "border-slate-300 bg-slate-50";
  if (tipo === "ritiro" || tipo === "concluso") return "border-indigo-300 bg-indigo-50";
  if (tipo === "consegnata" || tipo === "chiuso") return "border-emerald-400 bg-emerald-50";
  if (tipo === "spedizione") return "border-sky-300 bg-sky-50";
  return "border-slate-200 bg-white";
}

export function SchedaOrdineModal({
  schedaId,
  onClose,
  focusRitiro = false,
  onChanged,
}: Props) {
  const titleId = useId();
  const [dettaglio, setDettaglio] = useState<SchedaDettaglio | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(true);
  const [corrieri, setCorrieri] = useState<ProduzioneCorriere[]>([]);
  const [ritiroAt, setRitiroAt] = useState(toLocalInput());
  const [corriereId, setCorriereId] = useState("");
  const [nuovoCorriere, setNuovoCorriere] = useState("");
  const [motivoForza, setMotivoForza] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getSchedaOrdineDettaglioAction(schedaId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setDettaglio(null);
      } else {
        setError("");
        setDettaglio(res.dettaglio);
        if (res.dettaglio.spedizione.ritiroAt) {
          setRitiroAt(toLocalInput(res.dettaglio.spedizione.ritiroAt));
        }
        if (res.dettaglio.spedizione.trackingId) {
          void checkShippingTrackingAction({
            trackingId: res.dettaglio.spedizione.trackingId,
            force: false,
          }).then((chk) => {
            if (cancelled || !chk.success) return;
            void getSchedaOrdineDettaglioAction(schedaId).then((again) => {
              if (!cancelled && again.success) setDettaglio(again.dettaglio);
            });
          });
        }
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [schedaId]);

  useEffect(() => {
    void listCorrieriAction().then((res) => {
      if (res.success) setCorrieri(res.corrieri);
    });
  }, []);

  const s = dettaglio?.scheda;
  const sped = dettaglio?.spedizione;

  async function salvaRitiro() {
    setError("");
    setInfo("");
    setSaving(true);
    const res = await registraRitiroAction({
      schedaId,
      ritiroAt,
      corriereId,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setInfo("Ritiro registrato. L’ordine è Concluso, in attesa di consegna.");
    const again = await getSchedaOrdineDettaglioAction(schedaId);
    if (again.success) setDettaglio(again.dettaglio);
    onChanged?.();
  }

  async function aggiungiCorriere() {
    setError("");
    const res = await createCorriereAction({ nome: nuovoCorriere });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setCorrieri((prev) => [...prev, res.corriere]);
    setCorriereId(res.corriere.id);
    setNuovoCorriere("");
  }

  async function forzaConsegna() {
    setError("");
    setInfo("");
    setSaving(true);
    const res = await forzaConsegnaSchedaAction({
      schedaId,
      motivo: motivoForza,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setInfo("Consegna dichiarata. Ordine chiuso.");
    const again = await getSchedaOrdineDettaglioAction(schedaId);
    if (again.success) setDettaglio(again.dettaglio);
    onChanged?.();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {s ? `Scheda ${s.numeroScheda}` : "Scheda ordine"}
            </h2>
            {s ? (
              <p className="mt-1 text-sm text-slate-600">
                {s.cliente || "—"}
                {s.prodotto ? ` · ${s.prodotto}` : ""} ·{" "}
                {s.entityTipo === "campionatura" ? "Campionatura" : "Ordine"} ·{" "}
                {sped?.parentStatoLabel || SCHEDA_STATO_LABEL[s.schedaStato]}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
          >
            Chiudi
          </button>
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Caricamento timeline…</p>
        ) : null}
        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {sped ? (
          <div className="mt-4 space-y-3 rounded-xl border border-[var(--border)] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Stato spedizione
              </span>
              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-900">
                {sped.shippingLabel}
              </span>
              {sped.corriereNome ? (
                <span className="text-xs text-slate-600">
                  Corriere: {sped.corriereNome}
                </span>
              ) : null}
              {sped.ritiroAt ? (
                <span className="text-xs text-slate-600">
                  Ritiro: {formatWhen(sped.ritiroAt)}
                </span>
              ) : null}
            </div>
            {sped.shippingNote ? (
              <p className="text-xs text-slate-500">{sped.shippingNote}</p>
            ) : null}

            {sped.canRegistraRitiro ? (
              <div
                className={`space-y-2 rounded-lg border px-3 py-3 ${
                  focusRitiro
                    ? "border-indigo-300 bg-indigo-50"
                    : "border-[var(--border)]"
                }`}
              >
                <p className="text-sm font-medium">Registra ritiro</p>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-600">
                    Ora di ritiro
                  </span>
                  <input
                    type="datetime-local"
                    value={ritiroAt}
                    onChange={(e) => setRitiroAt(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-600">
                    Corriere
                  </span>
                  <select
                    value={corriereId}
                    onChange={(e) => setCorriereId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="">Seleziona corriere…</option>
                    {corrieri.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex gap-2">
                  <input
                    value={nuovoCorriere}
                    onChange={(e) => setNuovoCorriere(e.target.value)}
                    placeholder="Aggiungi altro corriere"
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void aggiungiCorriere()}
                    className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-2 text-xs"
                  >
                    Aggiungi
                  </button>
                </div>
                <button
                  type="button"
                  disabled={saving || !corriereId || !ritiroAt}
                  onClick={() => void salvaRitiro()}
                  className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm text-white disabled:opacity-40"
                >
                  {saving ? "Salvataggio…" : "Conferma ritiro · Concluso"}
                </button>
              </div>
            ) : null}

            {sped.canForzaConsegna ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-sm font-medium text-amber-950">
                  Dichiara consegnato (forza)
                </p>
                <p className="text-xs text-amber-900">
                  Usa se il tracking non si aggiorna o non è allineato al
                  gestionale.
                </p>
                <textarea
                  value={motivoForza}
                  onChange={(e) => setMotivoForza(e.target.value)}
                  rows={2}
                  placeholder="Motivo (obbligatorio)"
                  className="w-full rounded-lg border border-amber-200 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={saving || motivoForza.trim().length < 5}
                  onClick={() => void forzaConsegna()}
                  className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:opacity-40"
                >
                  {saving ? "Salvataggio…" : "Forza consegnato e chiudi"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {info ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {info}
          </p>
        ) : null}

        {dettaglio ? (
          <ol className="relative mt-6 space-y-4 border-l-2 border-slate-200 pl-5">
            {dettaglio.timeline.length === 0 ? (
              <li className="text-sm text-slate-500">
                Nessun evento registrato.
              </li>
            ) : (
              dettaglio.timeline.map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[1.6rem] top-2 h-3 w-3 rounded-full border-2 border-white bg-[var(--primary)]" />
                  <div
                    className={`rounded-xl border px-3 py-2 ${classeEvento(ev.eventoTipo)}`}
                  >
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                      {SCHEDA_EVENTO_LABEL[ev.eventoTipo]} · {formatWhen(ev.eventoAt)}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-slate-900">
                      {ev.titolo}
                    </p>
                    {ev.dettaglio ? (
                      <p className="mt-0.5 text-xs text-slate-600">{ev.dettaglio}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-500">{ev.actorLabel}</p>
                  </div>
                </li>
              ))
            )}
          </ol>
        ) : null}
      </div>
    </div>
  );
}
