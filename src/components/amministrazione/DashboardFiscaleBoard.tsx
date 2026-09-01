"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getDashboardFiscaleScadenzarioAction,
  getDashboardFiscaleSummaryAction,
  listAdempimentiFiscaliAction,
  listDashboardFiscaleSnapshotsAction,
  saveDashboardFiscaleSnapshotAction,
  softDeleteAdempimentoFiscaleAction,
  upsertAdempimentoFiscaleAction,
  type AdempimentoFiscale,
  type DashboardFiscaleSummary,
} from "@/app/actions/dashboard-fiscale";
import { ConfirmDeleteModal } from "@/components/ui/ConfirmDeleteModal";
import { fatturaDetailPath } from "@/lib/amministrazione/fatture-storico";
import {
  formatEuro,
  type ScadenzaUnificata,
} from "@/lib/amministrazione/fiscal-dashboard";
import {
  labelFormaGiuridica,
  labelRegimeIva,
} from "@/lib/amministrazione/fiscal-profile";

export function DashboardFiscaleBoard() {
  const now = useMemo(() => new Date(), []);
  const [tipo, setTipo] = useState<"mese" | "trimestre">("trimestre");
  const [anno, setAnno] = useState(now.getFullYear());
  const [mese, setMese] = useState(now.getMonth() + 1);
  const [summary, setSummary] = useState<DashboardFiscaleSummary | null>(null);
  const [scadenze, setScadenze] = useState<ScadenzaUnificata[]>([]);
  const [adempimenti, setAdempimenti] = useState<AdempimentoFiscale[]>([]);
  const [snapshots, setSnapshots] = useState<
    Array<{
      id: string;
      periodoLabel: string;
      createdAt: string;
      profiloVersione: number;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [newAdTitle, setNewAdTitle] = useState("");
  const [deletingAd, setDeletingAd] = useState<AdempimentoFiscale | null>(null);

  async function reload() {
    setReady(false);
    const [s, c, a, sn] = await Promise.all([
      getDashboardFiscaleSummaryAction({ tipo, anno, mese }),
      getDashboardFiscaleScadenzarioAction(),
      listAdempimentiFiscaliAction(),
      listDashboardFiscaleSnapshotsAction(),
    ]);
    if (!s.success) {
      setError(s.error);
      setSummary(null);
    } else {
      setError(null);
      setSummary(s.data);
    }
    if (c.success) setScadenze(c.scadenze);
    if (a.success) setAdempimenti(a.items);
    if (sn.success) setSnapshots(sn.items);
    setReady(true);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, anno, mese]);

  async function saveSnapshot() {
    if (!summary) return;
    setInfo(null);
    const res = await saveDashboardFiscaleSnapshotAction({ summary });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setInfo("Snapshot fiscale salvato (audit created_by / created_at).");
    const sn = await listDashboardFiscaleSnapshotsAction();
    if (sn.success) setSnapshots(sn.items);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Commercialista interattivo per Cooperativa Agricola e Sociale A.R.L.
            Fonte: fatture interne registrate. Parametri in{" "}
            <Link
              href="/app/impostazioni"
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Impostazioni → Profilo fiscale
            </Link>
            .
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value === "mese" ? "mese" : "trimestre")
            }
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            <option value="trimestre">Trimestre</option>
            <option value="mese">Mese</option>
          </select>
          <input
            type="number"
            value={anno}
            onChange={(e) => setAnno(Number(e.target.value) || anno)}
            className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          />
          {tipo === "mese" ? (
            <select
              value={mese}
              onChange={(e) => setMese(Number(e.target.value))}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {String(m).padStart(2, "0")}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={() => void saveSnapshot()}
            disabled={!summary}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Salva snapshot
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {info}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : summary ? (
        <>
          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
            <p>
              <strong>{labelFormaGiuridica(summary.profile.formaGiuridica)}</strong>
              {" · "}
              {labelRegimeIva(summary.profile.regimeIva)}
              {" · Liquidazione "}
              {summary.profile.ivaPeriodo}
              {" · Profilo v"}
              {summary.profile.versione}
            </p>
            <p className="mt-1 text-[var(--muted)]">
              Periodo {summary.periodo.label} ({summary.periodo.dal} →{" "}
              {summary.periodo.al}) · {summary.conteggi.fattureEmesse} emesse /{" "}
              {summary.conteggi.fattureRicevute} ricevute
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="IVA a debito"
              value={formatEuro(summary.iva.ivaDebito)}
              hint="Da fatture emesse"
            />
            <KpiCard
              title="IVA a credito"
              value={formatEuro(summary.iva.ivaCredito)}
              hint={
                summary.profile.regimeIva === "speciale_agricolo_art34"
                  ? "Compensazione art. 34 (stima)"
                  : "Da fatture ricevute"
              }
            />
            <KpiCard
              title="Saldo IVA"
              value={formatEuro(summary.iva.ivaSaldo)}
              hint={
                summary.iva.ivaSaldo >= 0 ? "Da versare (stima)" : "A credito"
              }
              emphasis
            />
            <KpiCard
              title="Utile stimato"
              value={formatEuro(summary.utile.utileStimato)}
              hint="Imponibile emesso − ricevuto"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Stima IRES"
              value={formatEuro(summary.utile.stimaIres)}
              hint={`Aliquota ${summary.profile.aliquotaIresPct}%`}
            />
            <KpiCard
              title="Stima IRAP"
              value={formatEuro(summary.utile.stimaIrap)}
              hint={`Aliquota ${summary.profile.aliquotaIrapPct}%`}
            />
            <KpiCard
              title="Stima INPS periodo"
              value={formatEuro(summary.utile.stimaInpsPeriodo)}
              hint={`OTD ${summary.profile.otdCount} / OTI ${summary.profile.otiCount}`}
            />
            <KpiCard
              title="Stima tasse totale"
              value={formatEuro(summary.utile.stimaTasseTotale)}
              hint="Indicativa"
              emphasis
            />
          </section>

          <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
            <h3 className="text-sm font-semibold">Note di calcolo</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--muted)]">
              {[...summary.iva.noteCalcolo, ...summary.utile.noteCalcolo].map(
                (n, i) => (
                  <li key={i}>{n}</li>
                )
              )}
            </ul>
          </section>
        </>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          Scadenzario unificato (prossimi mesi)
        </h3>
        {scadenze.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuna scadenza nel periodo.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Descrizione</th>
                  <th className="px-3 py-2">Importo</th>
                  <th className="px-3 py-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {scadenze.map((s) => (
                  <tr key={s.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 tabular-nums">
                      {new Date(s.data).toLocaleDateString("it-IT")}
                    </td>
                    <td className="px-3 py-2 capitalize">{s.tipo}</td>
                    <td className="px-3 py-2">
                      {s.fatturaId && s.fatturaKind ? (
                        <Link
                          href={fatturaDetailPath(s.fatturaKind, s.fatturaId)}
                          target="_blank"
                          className="text-[var(--primary)] hover:underline"
                        >
                          {s.titolo}
                        </Link>
                      ) : (
                        s.titolo
                      )}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {s.importo != null ? formatEuro(s.importo) : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs">{s.stato}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-sm font-semibold">Adempimenti fiscali ricorrenti</h3>
          <div className="flex gap-2">
            <input
              value={newAdTitle}
              onChange={(e) => setNewAdTitle(e.target.value)}
              placeholder="Nuovo adempimento…"
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                if (!newAdTitle.trim()) return;
                const res = await upsertAdempimentoFiscaleAction({
                  titolo: newAdTitle.trim(),
                  categoria: "altro",
                  ricorrenza: "mensile",
                  giornoMese: 16,
                });
                if (res.success) {
                  setNewAdTitle("");
                  setAdempimenti((prev) => [...prev, res.item]);
                } else setError(res.error);
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Aggiungi
            </button>
          </div>
        </div>
        <ul className="space-y-2">
          {adempimenti.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium">
                  {a.titolo}{" "}
                  <span className="text-xs text-[var(--muted)]">
                    ({a.categoria} · {a.ricorrenza}
                    {a.giornoMese ? ` · giorno ${a.giornoMese}` : ""})
                  </span>
                </p>
                {a.descrizione ? (
                  <p className="text-xs text-[var(--muted)]">{a.descrizione}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setDeletingAd(a)}
                className="text-xs text-red-700 hover:underline"
              >
                Archivia
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Snapshot salvati</h3>
        {snapshots.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nessuno snapshot ancora.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {snapshots.map((s) => (
              <li
                key={s.id}
                className="rounded border border-[var(--border)] px-3 py-2"
              >
                {s.periodoLabel} · v{s.profiloVersione} ·{" "}
                {new Date(s.createdAt).toLocaleString("it-IT")}
              </li>
            ))}
          </ul>
        )}
      </section>

      {deletingAd ? (
        <ConfirmDeleteModal
          title="Archivia adempimento"
          message={`Archiviare «${deletingAd.titolo}»? Soft delete ISO: resta in archivio.`}
          confirmLabel="Archivia"
          onClose={() => setDeletingAd(null)}
          onConfirm={async () => {
            const res = await softDeleteAdempimentoFiscaleAction(deletingAd.id);
            if (res.success) {
              setAdempimenti((prev) =>
                prev.filter((x) => x.id !== deletingAd.id)
              );
              setDeletingAd(null);
            } else setError(res.error);
          }}
        />
      ) : null}
    </div>
  );
}

function KpiCard(props: {
  title: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 ${
        props.emphasis ? "ring-1 ring-[var(--primary)]/20" : ""
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
        {props.title}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{props.value}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">{props.hint}</p>
    </div>
  );
}
