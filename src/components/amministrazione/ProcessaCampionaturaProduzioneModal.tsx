"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { processCampionaturaInProduzioneAction } from "@/app/actions/campionature";
import { getGiacenzaProdottoAction } from "@/app/actions/produzione-capacita";
import {
  formatKgLt,
  giacenzaCopreRichiesta,
  messaggioGiacenzaInsufficiente,
  quantitaRichiestaInBaseKg,
} from "@/lib/amministrazione/approvvigionamento";
import type { Campionatura } from "@/lib/amministrazione/campionature";

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
  item: Campionatura;
  onClose: () => void;
  onSaved: (item: Campionatura) => void;
};

export function ProcessaCampionaturaProduzioneModal({
  item,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [lottoCodice, setLottoCodice] = useState(
    item.righe[0]?.lottoCodice ?? ""
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [giacenze, setGiacenze] = useState<GiacenzaRiga[]>([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      item.righe
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
  }, [item.righe]);

  const magazzinoOk = useMemo(
    () => giacenze.length > 0 && giacenze.every((g) => g.ok),
    [giacenze]
  );

  async function onConfirm() {
    if (!magazzinoOk) {
      const first = giacenze.find((g) => !g.ok);
      setError(
        first
          ? `${first.prodottoCodice}: ${messaggioGiacenzaInsufficiente(first.giacenzaKg, first.richiestaKg ?? first.quantita)}`
          : "Giacenza insufficiente."
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await processCampionaturaInProduzioneAction({
        campionaturaId: item.id,
        lottoCodice: lottoCodice.trim(),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      onSaved(result.item);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Salvataggio non riuscito. Riprova."
      );
    } finally {
      setSaving(false);
    }
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
          Inserisci in produzione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {item.numeroInterno} · Campionatura · {item.cliente}
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Approvvigionamento solo da magazzino. Per la campionatura non è
          prevista alcuna lavorazione.
        </p>

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

        {!magazzinoOk && giacenze.length > 0 ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Non puoi inserire in produzione: manca materiale a magazzino.
          </p>
        ) : null}

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
          <button
            type="button"
            disabled={saving || !magazzinoOk}
            onClick={() => void onConfirm()}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Inserisci da magazzino"}
          </button>
        </div>
      </div>
    </div>
  );
}
