"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { processOrdineInScalettaAction } from "@/app/actions/ordini";
import { listAttivitaByProdottoAction } from "@/app/actions/attivita";
import {
  calcolaConsegnaOrdineAction,
  getGiacenzaProdottoAction,
} from "@/app/actions/produzione-capacita";
import { ConsegnaCalendarioModal } from "@/components/amministrazione/ConsegnaCalendarioModal";
import {
  attivitaToOrdineDraft,
  type AttivitaOrdineDraft,
} from "@/lib/amministrazione/attivita";
import {
  formatKgLt,
  giacenzaCopreRichiesta,
  messaggioGiacenzaInsufficiente,
  quantitaRichiestaInBaseKg,
  type FonteApprovvigionamento,
} from "@/lib/amministrazione/approvvigionamento";
import {
  labelTipoOrdine,
  quantitaInUnitaBase,
  type Ordine,
} from "@/lib/amministrazione/ordini";
import type { CapacitaCalcoloResult } from "@/lib/amministrazione/produzione-capacita";

type GiacenzaRiga = {
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: string;
  giacenzaKg: number;
  richiestaKg: number | null;
  ok: boolean;
};

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
  const isCamp = ordine.tipo === "campionatura";
  const riga = ordine.righe[0];
  const [lottoCodice, setLottoCodice] = useState(riga?.lottoCodice ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [calcolo, setCalcolo] = useState<CapacitaCalcoloResult | null>(null);
  const [calcoloLoading, setCalcoloLoading] = useState(false);
  const [calendarioOpen, setCalendarioOpen] = useState(false);
  const [usaSabato, setUsaSabato] = useState(ordine.usaSabato);
  const [fonte, setFonte] = useState<FonteApprovvigionamento>(
    isCamp || ordine.usaMagazzino ? "magazzino" : "lavorazione"
  );
  const [urgente, setUrgente] = useState(ordine.urgente);
  const [attivitaDrafts, setAttivitaDrafts] = useState<AttivitaOrdineDraft[]>(
    []
  );
  const [giacenze, setGiacenze] = useState<GiacenzaRiga[]>([]);

  const usaMagazzino = fonte === "magazzino";

  useEffect(() => {
    if (isCamp) setFonte("magazzino");
  }, [isCamp]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      ordine.righe
        .filter((r) => r.prodottoId)
        .map(async (r) => {
          const stock = await getGiacenzaProdottoAction(r.prodottoId);
          const richiestaKg = quantitaRichiestaInBaseKg(
            r.quantita,
            r.unitaMisura
          );
          const giacenzaKg = stock.success ? stock.quantitaKg : 0;
          return {
            prodottoId: r.prodottoId,
            prodottoCodice: r.prodottoCodice,
            prodottoNome: r.prodottoNome,
            quantita: r.quantita,
            unitaMisura: r.unitaMisura,
            giacenzaKg,
            richiestaKg,
            ok: giacenzaCopreRichiesta(giacenzaKg, richiestaKg),
          } satisfies GiacenzaRiga;
        })
    ).then((rows) => {
      if (!cancelled) setGiacenze(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [ordine.righe]);

  const magazzinoOk = useMemo(
    () => giacenze.length > 0 && giacenze.every((g) => g.ok),
    [giacenze]
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
    if (!riga || isCamp) return;
    let cancelled = false;
    setCalcoloLoading(true);
    void calcolaConsegnaOrdineAction({
      prodottoId: riga.prodottoId,
      prodottoCodice: riga.prodottoCodice,
      quantitaKg: quantitaInUnitaBase(riga.quantita, riga.unitaMisura),
      consegnaTipo: ordine.consegnaTipo === "data" ? "data" : "asap",
      dataRichiesta:
        ordine.consegnaTipo === "data" ? ordine.dataConsegna : null,
      urgente,
      usaMagazzino,
      usaSabato,
    })
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error);
          setCalcolo(null);
          return;
        }
        setError(null);
        setCalcolo(res.calcolo);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Calcolo consegna non disponibile."
        );
        setCalcolo(null);
      })
      .finally(() => {
        if (!cancelled) setCalcoloLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    isCamp,
    riga?.prodottoId,
    riga?.prodottoCodice,
    riga?.quantita,
    riga?.unitaMisura,
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
    try {
      const result = await processOrdineInScalettaAction({
        ordineId: ordine.id,
        giorniProduzione: payload.giorniProduzione,
        giorniAttivita: payload.giorniAttivita,
        attivitaSnapshot: payload.segmentiAttivita,
        dataConsegnaCalendario: payload.dataConsegna,
        urgente,
        usaMagazzino,
        approvvigionamento: fonte,
        usaSabato,
        lottoCodice: lottoCodice.trim(),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setAttivitaDrafts(payload.attivitaDrafts);
      onSaved(result.ordine);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio non riuscito. Riprova."
      );
    } finally {
      setSaving(false);
    }
  }

  async function processDaMagazzino() {
    if (!magazzinoOk) {
      const first = giacenze.find((g) => !g.ok);
      setError(
        first
          ? `${first.prodottoCodice}: ${messaggioGiacenzaInsufficiente(first.giacenzaKg, first.richiestaKg ?? first.quantita)}`
          : "Giacenza insufficiente."
      );
      return;
    }
    const oggi = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dataConsegna =
      calcolo?.dataConsegnaStimata ??
      `${oggi.getFullYear()}-${pad(oggi.getMonth() + 1)}-${pad(oggi.getDate())}`;
    setSaving(true);
    setError(null);
    try {
      const result = await processOrdineInScalettaAction({
        ordineId: ordine.id,
        giorniProduzione: [],
        giorniAttivita: [],
        attivitaSnapshot: [],
        dataConsegnaCalendario: dataConsegna,
        urgente: isCamp ? false : urgente,
        usaMagazzino: true,
        approvvigionamento: "magazzino",
        usaSabato: false,
        lottoCodice: lottoCodice.trim(),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(result.ordine);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio non riuscito. Riprova."
      );
    } finally {
      setSaving(false);
    }
  }

  const puoLavorazione =
    !isCamp && fonte === "lavorazione" && !!calcolo && !!riga;
  const puoMagazzino = usaMagazzino && magazzinoOk && !!riga;

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
          Inserisci in produzione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {ordine.numeroInterno} · {labelTipoOrdine(ordine.tipo)} ·{" "}
          {ordine.cliente}
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="text-sm font-medium">Approvvigionamento</legend>
          {isCamp ? (
            <p className="text-sm text-[var(--muted)]">
              Campionatura: solo da magazzino. Nessuna lavorazione.
            </p>
          ) : (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="fonte"
                  checked={fonte === "magazzino"}
                  onChange={() => setFonte("magazzino")}
                />
                <span>
                  Da magazzino
                  <span className="block text-xs text-[var(--muted)]">
                    Solo se la quantità è già presente in giacenza.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="fonte"
                  checked={fonte === "lavorazione"}
                  onChange={() => setFonte("lavorazione")}
                />
                <span>
                  Da prossima lavorazione
                  <span className="block text-xs text-[var(--muted)]">
                    Inserisce l’ordine in scaletta produzione.
                  </span>
                </span>
              </label>
            </>
          )}
        </fieldset>

        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Prodotto</th>
                <th className="px-3 py-2">Richiesto</th>
                <th className="px-3 py-2">In magazzino</th>
              </tr>
            </thead>
            <tbody>
              {giacenze.map((g) => (
                <tr key={g.prodottoId} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    {g.prodottoCodice} — {g.prodottoNome}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {g.quantita.toLocaleString("it-IT")} {g.unitaMisura}
                  </td>
                  <td
                    className={`px-3 py-2 tabular-nums ${g.ok ? "text-emerald-800" : "text-red-700"}`}
                  >
                    {formatKgLt(g.giacenzaKg)}
                    {g.ok ? " · ok" : " · insufficiente"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {usaMagazzino && !magazzinoOk ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {isCamp
              ? "Non puoi inserire la campionatura in produzione: manca materiale a magazzino."
              : "Da magazzino non è possibile. Scegli «prossima lavorazione» oppure attendi il ripristino giacenza."}
          </p>
        ) : null}

        {isCamp || usaMagazzino ? (
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium">Numero di lotto</span>
            <input
              type="text"
              value={lottoCodice}
              onChange={(e) => setLottoCodice(e.target.value)}
              placeholder="Facoltativo — se già assegnato"
              className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
        ) : null}

        {!isCamp && fonte === "lavorazione" ? (
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
                checked={usaSabato}
                onChange={(e) => setUsaSabato(e.target.checked)}
              />
              Includi sabato
            </label>
            <div className="rounded-lg border border-[var(--border)] px-3 py-3">
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
                        ? new Date(
                            calcolo.dataConsegnaStimata
                          ).toLocaleDateString("it-IT")
                        : "—"}
                    </strong>
                  </li>
                </ul>
              ) : (
                <p className="text-[var(--muted)]">Calcolo non disponibile.</p>
              )}
            </div>
          </div>
        ) : null}

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
          {fonte === "lavorazione" && !isCamp ? (
            <button
              type="button"
              disabled={saving || !puoLavorazione}
              onClick={() => setCalendarioOpen(true)}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Apri calendario e inserisci"}
            </button>
          ) : (
            <button
              type="button"
              disabled={saving || !puoMagazzino}
              onClick={() => void processDaMagazzino()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Inserisci da magazzino"}
            </button>
          )}
        </div>
      </div>

      {calendarioOpen && calcolo && fonte === "lavorazione" ? (
        <ConsegnaCalendarioModal
          giorniProduzioneNecessari={calcolo.giorniLavorativiNecessari}
          kgOrdine={
            riga ? quantitaInUnitaBase(riga.quantita, riga.unitaMisura) : 0
          }
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
