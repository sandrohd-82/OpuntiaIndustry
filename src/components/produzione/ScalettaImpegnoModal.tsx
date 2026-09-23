"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  getScalettaImpegnoDettaglioAction,
  registraScalettaEsitoAction,
} from "@/app/actions/scaletta-produzione";
import { listSediAttiveAction } from "@/app/actions/impostazioni-sedi";
import { labelSede, type ImpostazioniSede } from "@/lib/impostazioni/sedi";
import {
  SCALETTA_ESECUZIONE_LABEL,
  SCALETTA_TIPO_LABEL,
  type ScalettaDettaglio,
  type ScalettaEsecuzioneStato,
} from "@/lib/amministrazione/scaletta-produzione";

type Props = {
  impegnoId: string;
  onClose: () => void;
  onChanged: (dettaglio: ScalettaDettaglio) => void;
};

function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return new Date(`${day}T12:00:00`).toLocaleDateString("it-IT");
  }
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

function classeEsito(stato: ScalettaEsecuzioneStato): string {
  if (stato === "completata") return "bg-emerald-50 text-emerald-900";
  if (stato === "pronto_ritiro") return "bg-indigo-50 text-indigo-900";
  if (stato === "problema") return "bg-amber-100 text-amber-950";
  return "bg-slate-100 text-slate-700";
}

function Campo({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm text-slate-900">{value || "—"}</p>
    </div>
  );
}

export function ScalettaImpegnoModal({ impegnoId, onClose, onChanged }: Props) {
  const titleId = useId();
  const [dettaglio, setDettaglio] = useState<ScalettaDettaglio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nota, setNota] = useState("");
  const [sedi, setSedi] = useState<ImpostazioniSede[]>([]);
  const [sedeId, setSedeId] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getScalettaImpegnoDettaglioAction(impegnoId).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setDettaglio(null);
        setLoading(false);
        return;
      }
      setDettaglio(res.dettaglio);
      setNota(res.dettaglio.impegno.problemaNote);
      setSedeId(res.dettaglio.documento.sedePartenzaId);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [impegnoId]);

  useEffect(() => {
    void listSediAttiveAction().then((res) => {
      if (res.success) setSedi(res.sedi);
    });
  }, []);

  async function registra(
    modo: "completa" | "problema" | "pronto_ritiro"
  ) {
    setError(null);
    setInfo(null);
    setSaving(true);
    try {
      const res = await registraScalettaEsitoAction({
        impegnoId,
        modo,
        nota,
        sedePartenzaId: sedeId || null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setDettaglio(res.dettaglio);
      setNota(res.dettaglio.impegno.problemaNote);
      setSedeId(res.dettaglio.documento.sedePartenzaId);
      onChanged(res.dettaglio);
      setInfo(
        modo === "problema"
          ? "Problema salvato. Resta visibile sulla riga."
          : modo === "pronto_ritiro"
            ? "Confezionamento chiuso: pronto per il ritiro."
            : "Lavorazione dichiarata completa."
      );
    } finally {
      setSaving(false);
    }
  }

  const doc = dettaglio?.documento;
  const proc = dettaglio?.processazione;
  const imp = dettaglio?.impegno;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {doc?.numeroInterno ?? "Lavorazione"}
          {imp ? ` · ${SCALETTA_TIPO_LABEL[imp.tipo]}` : ""}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Specifica ordine e processazione. Sul confezionamento puoi chiudere
          come Completato o Pronto per il ritiro.
        </p>

        {loading ? (
          <p className="mt-4 text-sm text-[var(--muted)]">Caricamento…</p>
        ) : null}

        {dettaglio && doc && proc && imp ? (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${classeEsito(imp.esecuzioneStato)}`}
              >
                {SCALETTA_ESECUZIONE_LABEL[imp.esecuzioneStato]}
              </span>
              <span className="text-sm text-slate-600">
                Giorno {formatData(imp.dataGiorno)}
              </span>
            </div>

            {dettaglio.schedaId ? (
              <p className="text-sm">
                <Link
                  href={`/app/produzione/ordini/schede?id=${dettaglio.schedaId}`}
                  className="font-medium text-[var(--primary)] hover:underline"
                >
                  Apri scheda ordine (timeline)
                </Link>
              </p>
            ) : null}

            <section className="rounded-lg border border-[var(--border)] px-3 py-3">
              <p className="text-sm font-medium">
                {doc.entityType === "campionatura" ? "Campionatura" : "Ordine"}
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Campo label="Numero" value={doc.numeroInterno} />
                <Campo label="Cliente" value={doc.cliente} />
                <Campo label="Stato" value={doc.stato} />
                <Campo
                  label="Documento"
                  value={`${doc.documentoStato} · v${doc.versione}`}
                />
                <Campo
                  label={
                    doc.entityType === "campionatura"
                      ? "Data invio"
                      : "Data ordine"
                  }
                  value={formatData(doc.dataDocumento)}
                />
                <Campo
                  label="Consegna"
                  value={formatData(doc.dataConsegna)}
                />
                {doc.destinatario ? (
                  <Campo label="Destinatario" value={doc.destinatario} />
                ) : null}
                {doc.indirizzo ? (
                  <Campo label="Indirizzo" value={doc.indirizzo} />
                ) : null}
                {doc.trackingUrl ? (
                  <Campo label="Tracking" value={doc.trackingUrl} />
                ) : null}
                <Campo
                  label="Luogo di partenza"
                  value={doc.sedePartenzaLabel || "Non indicato"}
                />
                <Campo
                  label="Approvvigionamento"
                  value={
                    doc.usaMagazzino ? "Da magazzino" : "Da lavorazione"
                  }
                />
                {doc.urgente ? (
                  <Campo label="Priorità" value="Urgente" />
                ) : null}
                {doc.note ? <Campo label="Note ordine" value={doc.note} /> : null}
              </div>
            </section>

            <section className="rounded-lg border border-[var(--border)] px-3 py-3">
              <p className="text-sm font-medium">Processazione</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Campo
                  label="Data lavorazione"
                  value={formatData(proc.dataLavorazione)}
                />
                <Campo
                  label="Data confezionamento"
                  value={formatData(proc.dataConfezionamento)}
                />
                <Campo label="Fonte" value={proc.fonte} />
                {proc.giorniProduzione.length ? (
                  <Campo
                    label="Giorni produzione"
                    value={proc.giorniProduzione
                      .map((d) => formatData(d))
                      .join(", ")}
                  />
                ) : null}
                {proc.pack.length ? (
                  <Campo label="Imballaggio" value={proc.pack.join(" · ")} />
                ) : null}
                {proc.extra.length ? (
                  <Campo label="Attività" value={proc.extra.join(" · ")} />
                ) : null}
                <Campo label="Attività in scaletta" value={imp.etichetta} />
              </div>
            </section>

            <section className="overflow-hidden rounded-lg border border-[var(--border)]">
              <p className="bg-slate-50 px-3 py-2 text-sm font-medium">
                Righe e lotti
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Prodotto</th>
                      <th className="px-3 py-2">Q.tà</th>
                      <th className="px-3 py-2">Lotto</th>
                      <th className="px-3 py-2">Processo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dettaglio.righe.map((r, idx) => (
                      <tr
                        key={`${r.prodottoCodice}-${idx}`}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-3 py-2">
                          {r.prodottoCodice}
                          {r.prodottoNome ? ` — ${r.prodottoNome}` : ""}
                          {r.conforme === true ? (
                            <span className="ml-2 text-xs text-emerald-700">
                              conforme
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {r.quantita.toLocaleString("it-IT")} {r.unitaMisura}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {r.lottoCodice || "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.processo || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {imp.problemaNote ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Problema già registrato
                {imp.problemaAt ? ` · ${formatData(imp.problemaAt)}` : ""}
                : {imp.problemaNote}
              </p>
            ) : null}
            {imp.eseguitaAt ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Completata il {formatData(imp.eseguitaAt)}
                {imp.esitoNote ? ` · ${imp.esitoNote}` : ""}
              </p>
            ) : null}

            {dettaglio.prerequisiti.confezionamentoBloccato ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <p className="font-medium">
                  Confezionamento bloccato: completa prima le lavorazioni.
                </p>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {dettaglio.prerequisiti.pendenti.map((p) => (
                    <li key={p.id}>
                      {p.etichetta} · {p.stato}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {imp.tipo === "confezionamento" ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Luogo di partenza (ritiro)
                </span>
                <select
                  value={sedeId}
                  onChange={(e) => setSedeId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  <option value="">
                    {sedi.length
                      ? "Seleziona sede di partenza…"
                      : "Nessuna sede in Impostazioni → Sedi"}
                  </option>
                  {sedi.map((s) => (
                    <option key={s.id} value={s.id}>
                      {labelSede(s)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Nota problema / osservazione
              </span>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                rows={3}
                placeholder="Descrivi il problema riscontrato, oppure una nota in chiusura."
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {info ? (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {info}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
          {imp &&
          (imp.esecuzioneStato === "completata" ||
            imp.esecuzioneStato === "pronto_ritiro") ? null : (
          <>
          <button
            type="button"
            disabled={saving || !dettaglio}
            onClick={() => void registra("problema")}
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-50"
          >
            {saving ? "Salvataggio…" : "Salva problema"}
          </button>
          {imp?.tipo === "confezionamento" ? (
            <>
              <button
                type="button"
                disabled={
                  saving ||
                  !dettaglio ||
                  dettaglio.prerequisiti.confezionamentoBloccato
                }
                onClick={() => void registra("completa")}
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Completato"}
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  !dettaglio ||
                  dettaglio.prerequisiti.confezionamentoBloccato
                }
                onClick={() => void registra("pronto_ritiro")}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Pronto per il ritiro"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={saving || !dettaglio}
              onClick={() => void registra("completa")}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Dichiara completa"}
            </button>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
