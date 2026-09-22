"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { passaCampionaturaInScalettaAction } from "@/app/actions/campionature";
import { FaCheck } from "react-icons/fa6";
import { listImballaggiVociAction } from "@/app/actions/imballaggi-spedizioni";
import {
  listLottiMagazzinoInserimentoAction,
  listProcessiInserimentoProduzioneAction,
} from "@/app/actions/lotto-produzione-magazzino";
import { getGiacenzaProdottoAction } from "@/app/actions/produzione-capacita";
import {
  formatKgLt,
  giacenzaCopreRichiesta,
  quantitaRichiestaInBaseKg,
} from "@/lib/amministrazione/approvvigionamento";
import type { Campionatura } from "@/lib/amministrazione/campionature";
import {
  filterVociForMagazzinoStadio,
  labelImballaggioVoce,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import { SpedizioneMailPanel } from "@/components/amministrazione/SpedizioneMailPanel";
import { getClienteEmailSpedizioneAction } from "@/app/actions/spedizione-mail";
import type {
  LottoInserimentoOption,
  ProcessoInserimentoOption,
} from "@/lib/produzione/lotto-produzione-magazzino";

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

type Step = 1 | 2 | 3;

type PackDraft = {
  serveMov: boolean;
  serveConf: boolean;
  serveIso: boolean;
  movId: string;
  confId: string;
  isoId: string;
};

type Props = {
  item: Campionatura;
  onClose: () => void;
  onSaved: (item: Campionatura) => void;
};

function oggiISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function labelLotto(l: LottoInserimentoOption): string {
  const nome = l.prodottoNome ? ` — ${l.prodottoNome}` : "";
  const ext = l.lottoEsternoCodice
    ? ` · ext ${l.lottoEsternoCodice}`
    : "";
  return `${l.lottoInternoCodice}${ext} · ${l.prodottoCodice}${nome} · ${l.quantitaKg.toLocaleString("it-IT")} kg`;
}

export function ProcessaCampionaturaProduzioneModal({
  item,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [giacenze, setGiacenze] = useState<GiacenzaRiga[]>([]);
  const [lotti, setLotti] = useState<LottoInserimentoOption[]>([]);
  const [processi, setProcessi] = useState<ProcessoInserimentoOption[]>([]);
  const [imballaggi, setImballaggi] = useState<ImballaggioVoce[]>([]);
  const [lottiLoading, setLottiLoading] = useState(true);
  const [sceltaPerRiga, setSceltaPerRiga] = useState<Record<string, string>>(
    {}
  );
  const [processoPerRiga, setProcessoPerRiga] = useState<
    Record<string, string>
  >({});
  const [dataLavorazione, setDataLavorazione] = useState(oggiISO);
  const [dataConfezionamento, setDataConfezionamento] = useState(oggiISO);
  const [pack, setPack] = useState<PackDraft>({
    serveMov: false,
    serveConf: false,
    serveIso: false,
    movId: "",
    confId: "",
    isoId: "",
  });
  const [destEmail, setDestEmail] = useState("");

  const righe = useMemo(
    () => item.righe.filter((r) => r.prodottoId),
    [item.righe]
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      righe.map(async (r) => {
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
  }, [righe]);

  useEffect(() => {
    let cancelled = false;
    setLottiLoading(true);
    void listLottiMagazzinoInserimentoAction()
      .then((res) => {
        if (cancelled) return;
        if (!res.success) {
          setError(res.error);
          return;
        }
        setLotti(res.lotti);
        setSceltaPerRiga((prev) => {
          const next = { ...prev };
          for (const r of righe) {
            if (next[r.id]) continue;
            const match = res.lotti.find((l) => l.prodottoId === r.prodottoId);
            if (match) next[r.id] = match.key;
          }
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setLottiLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [righe]);

  useEffect(() => {
    void getClienteEmailSpedizioneAction(item.clienteId).then((res) => {
      if (res.success) setDestEmail(res.email);
    });
  }, [item.clienteId]);

  useEffect(() => {
    if (step < 2) return;
    let cancelled = false;
    void Promise.all([
      listProcessiInserimentoProduzioneAction(),
      listImballaggiVociAction(),
    ]).then(([proc, imb]) => {
      if (cancelled) return;
      if (proc.success) setProcessi(proc.processi);
      if (imb.success) setImballaggi(imb.items);
    });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const lottoByKey = useMemo(() => {
    const m = new Map<string, LottoInserimentoOption>();
    for (const l of lotti) m.set(l.key, l);
    return m;
  }, [lotti]);

  const movVoci = filterVociForMagazzinoStadio(imballaggi, "movimentazione");
  const confVoci = filterVociForMagazzinoStadio(imballaggi, "confezione");
  const isoVoci = filterVociForMagazzinoStadio(imballaggi, "isolamento");

  function lottoDi(rigaId: string): LottoInserimentoOption | null {
    const key = sceltaPerRiga[rigaId];
    return key ? lottoByKey.get(key) ?? null : null;
  }

  function haLottoRichiesto(prodottoId: string): boolean {
    return lotti.some((l) => l.prodottoId === prodottoId);
  }

  function conforme(rigaId: string, prodottoId: string): boolean {
    const lot = lottoDi(rigaId);
    return Boolean(lot && lot.prodottoId === prodottoId);
  }

  function vaiStep2() {
    setError(null);
    if (lottiLoading) return;
    for (const r of righe) {
      if (!sceltaPerRiga[r.id]) {
        setError(`Seleziona un lotto per ${r.prodottoCodice}.`);
        return;
      }
    }
    setStep(2);
  }

  function vaiStep3() {
    setError(null);
    for (const r of righe) {
      if (!conforme(r.id, r.prodottoId) && !processoPerRiga[r.id]) {
        setError(
          `Indica il processo di trasformazione per ${r.prodottoCodice}.`
        );
        return;
      }
    }
    if (!dataLavorazione || !dataConfezionamento) {
      setError("Imposta data di lavorazione e di confezionamento.");
      return;
    }
    if (pack.serveMov && !pack.movId) {
      setError("Seleziona la movimentazione oppure togli la spunta.");
      return;
    }
    if (pack.serveConf && !pack.confId) {
      setError("Seleziona la confezione oppure togli la spunta.");
      return;
    }
    if (pack.serveIso && !pack.isoId) {
      setError("Seleziona l’isolamento oppure togli la spunta.");
      return;
    }
    setStep(3);
  }

  async function passaInScaletta() {
    setError(null);
    const payload = righe.map((r) => {
      const lot = lottoDi(r.id);
      const ok = conforme(r.id, r.prodottoId);
      const proc = processi.find((p) => p.id === processoPerRiga[r.id]);
      return {
        rigaId: r.id,
        lottoInternoCodice: lot?.lottoInternoCodice ?? "",
        lottoProdottoId: lot?.prodottoId ?? r.prodottoId,
        lottoProdottoCodice: lot?.prodottoCodice ?? r.prodottoCodice,
        conforme: ok,
        processoId: ok ? null : processoPerRiga[r.id] || null,
        processoCodice: proc?.codice ?? "",
        processoNome: proc?.nome ?? "",
      };
    });
    if (payload.some((p) => !p.lottoInternoCodice)) {
      setError("Seleziona un lotto per ogni riga.");
      return;
    }
    setSaving(true);
    try {
      const res = await passaCampionaturaInScalettaAction({
        campionaturaId: item.id,
        dataLavorazione,
        dataConfezionamento,
        righe: payload,
        pack: {
          movimentazioneId: pack.serveMov ? pack.movId || null : null,
          confezioneId: pack.serveConf ? pack.confId || null : null,
          isolamentoId: pack.serveIso ? pack.isoId || null : null,
        },
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSaved(res.item);
      router.push("/app/produzione/ordini/scaletta");
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
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Inserisci in produzione
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {item.numeroInterno} · Campionatura · {item.cliente}
        </p>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-slate-500">
          Step {step} di 3
          {step === 1
            ? " · Lotto"
            : step === 2
              ? " · Conformità e confezionamento"
              : " · Spedizione"}
        </p>

        {step === 1 ? (
          <>
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
                    <tr
                      key={g.prodottoId}
                      className="border-t border-[var(--border)]"
                    >
                      <td className="px-3 py-2">
                        {g.prodottoCodice} — {g.prodottoNome}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {g.quantita.toLocaleString("it-IT")} {g.unitaMisura}
                      </td>
                      <td
                        className={`px-3 py-2 tabular-nums ${
                          g.ok ? "text-emerald-800" : "text-red-700"
                        }`}
                      >
                        {formatKgLt(g.giacenzaKg)}
                        {g.ok ? " · ok" : " · insufficiente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {righe.map((r) => {
              const match = haLottoRichiesto(r.prodottoId);
              const consigliati = lotti.filter(
                (l) => l.prodottoId === r.prodottoId
              );
              const altri = lotti.filter((l) => l.prodottoId !== r.prodottoId);
              return (
                <label key={r.id} className="mt-4 block text-sm">
                  <span className="mb-1 block font-medium">
                    Numero di lotto
                    {righe.length > 1 ? ` · ${r.prodottoCodice}` : ""}
                  </span>
                  <select
                    value={sceltaPerRiga[r.id] ?? ""}
                    disabled={lottiLoading}
                    onChange={(e) =>
                      setSceltaPerRiga((prev) => ({
                        ...prev,
                        [r.id]: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)] disabled:bg-slate-50"
                  >
                    <option value="">
                      {lottiLoading
                        ? "Caricamento lotti…"
                        : "Seleziona un lotto a magazzino"}
                    </option>
                    {consigliati.length ? (
                      <optgroup label="Consigliati">
                        {consigliati.map((l) => (
                          <option key={l.key} value={l.key}>
                            Consigliato · {labelLotto(l)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {altri.length ? (
                      <optgroup label="Altri lotti">
                        {altri.map((l) => (
                          <option key={l.key} value={l.key}>
                            {labelLotto(l)}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                  {match ? (
                    <span className="mt-1 block text-xs font-medium text-emerald-700">
                      Nel menù è già presente un lotto del prodotto richiesto (
                      {r.prodottoCodice}). Non è vincolante: puoi scegliere un
                      lotto di partenza (es. seconda lavorazione).
                    </span>
                  ) : (
                    <span className="mt-1 block text-xs text-[var(--muted)]">
                      Puoi selezionare anche un lotto di un altro prodotto (es.
                      NDRi per ottenere {r.prodottoCodice}).
                    </span>
                  )}
                </label>
              );
            })}
          </>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-4">
            {righe.map((r) => {
              const lot = lottoDi(r.id);
              const ok = conforme(r.id, r.prodottoId);
              return (
                <div
                  key={r.id}
                  className="rounded-lg border border-[var(--border)] px-3 py-3"
                >
                  <p className="text-sm font-medium">
                    {r.prodottoCodice} — {r.prodottoNome}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-600">
                    Lotto {lot?.lottoInternoCodice ?? "—"} ·{" "}
                    {lot?.prodottoCodice ?? "—"}
                  </p>
                  {ok ? (
                    <label className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded border border-emerald-600 bg-emerald-600 text-white">
                        <FaCheck size={11} />
                      </span>
                      Lotto conforme al prodotto richiesto
                    </label>
                  ) : (
                    <label className="mt-3 block text-sm">
                      <span className="mb-1 block font-medium">
                        Processo per rendere {r.prodottoCodice} compatibile con{" "}
                        {lot?.prodottoCodice ?? "il lotto"}
                      </span>
                      <select
                        value={processoPerRiga[r.id] ?? ""}
                        onChange={(e) =>
                          setProcessoPerRiga((prev) => ({
                            ...prev,
                            [r.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                      >
                        <option value="">Seleziona processo…</option>
                        {processi.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.codice} — {p.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              );
            })}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  Data di lavorazione
                </span>
                <input
                  type="date"
                  value={dataLavorazione}
                  onChange={(e) => setDataLavorazione(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block font-medium">
                  Data di confezionamento
                </span>
                <input
                  type="date"
                  value={dataConfezionamento}
                  onChange={(e) => setDataConfezionamento(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                />
              </label>
            </div>

            <div className="rounded-lg border border-[var(--border)] px-3 py-3">
              <p className="text-sm font-medium">
                Processo di confezionamento
              </p>
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Compila solo ciò che è necessario.
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pack.serveMov}
                      onChange={(e) =>
                        setPack((p) => ({
                          ...p,
                          serveMov: e.target.checked,
                          movId: e.target.checked ? p.movId : "",
                        }))
                      }
                    />
                    Movimentazione necessaria
                  </label>
                  {pack.serveMov ? (
                    <select
                      value={pack.movId}
                      onChange={(e) =>
                        setPack((p) => ({ ...p, movId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona movimentazione…</option>
                      {movVoci.map((v) => (
                        <option key={v.id} value={v.id}>
                          {labelImballaggioVoce(v)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pack.serveConf}
                      onChange={(e) =>
                        setPack((p) => ({
                          ...p,
                          serveConf: e.target.checked,
                          confId: e.target.checked ? p.confId : "",
                        }))
                      }
                    />
                    Confezione necessaria
                  </label>
                  {pack.serveConf ? (
                    <select
                      value={pack.confId}
                      onChange={(e) =>
                        setPack((p) => ({ ...p, confId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona confezione…</option>
                      {confVoci.map((v) => (
                        <option key={v.id} value={v.id}>
                          {labelImballaggioVoce(v)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={pack.serveIso}
                      onChange={(e) =>
                        setPack((p) => ({
                          ...p,
                          serveIso: e.target.checked,
                          isoId: e.target.checked ? p.isoId : "",
                        }))
                      }
                    />
                    Isolamento necessario
                  </label>
                  {pack.serveIso ? (
                    <select
                      value={pack.isoId}
                      onChange={(e) =>
                        setPack((p) => ({ ...p, isoId: e.target.value }))
                      }
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Seleziona isolamento…</option>
                      {isoVoci.map((v) => (
                        <option key={v.id} value={v.id}>
                          {labelImballaggioVoce(v)}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 space-y-3 text-sm">
            <p className="text-xs text-slate-500">
              Spedizione: tracking se già disponibile, oppure salva e resta in
              attesa. La mail al cliente è facoltativa.
            </p>
            <p className="text-xs text-slate-500">
              Lavorazione {dataLavorazione} · Confezionamento{" "}
              {dataConfezionamento}
              {righe[0]
                ? ` · ${righe[0].prodottoCodice} · lotto ${
                    lottoDi(righe[0].id)?.lottoInternoCodice ?? "—"
                  }`
                : ""}
            </p>
            <SpedizioneMailPanel
              entityType="campionatura"
              entityId={item.id}
              clienteNome={item.cliente}
              numero={item.numeroInterno}
              prodotti={righe
                .map((r) => `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura}`)
                .join(", ")}
              destEmailDefault={destEmail}
            />
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
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep((s) => (s === 3 ? 2 : 1));
              }}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Indietro
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              disabled={step === 1 && lottiLoading}
              onClick={() => (step === 1 ? vaiStep2() : vaiStep3())}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              Avanti
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => void passaInScaletta()}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Passa in scaletta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
