"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  createOrdineWizardAction,
  previewNumeroInternoOrdineAction,
} from "@/app/actions/ordini";
import { calcolaConsegnaOrdineAction } from "@/app/actions/produzione-capacita";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Ordine } from "@/lib/amministrazione/ordini";
import type { CapacitaCalcoloResult } from "@/lib/amministrazione/produzione-capacita";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

type Props = {
  onClose: () => void;
  onSaved: (ordine: Ordine) => void;
};

type Step = 1 | 2 | 3 | 4;

function todayInputValue() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateIt(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Cliente" },
  { n: 2, label: "Prodotto" },
  { n: 3, label: "Quantità" },
  { n: 4, label: "Consegna" },
];

export function OrdineNuovoWizardModal({ onClose, onSaved }: Props) {
  const titleId = useId();
  const { prodotti, ready: prodottiReady, addProdotto, refresh } =
    useProdottiPropri();
  const [step, setStep] = useState<Step>(1);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [clienteId, setClienteId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTarga, setClienteTarga] = useState("");
  const [dataOrdine, setDataOrdine] = useState(todayInputValue());
  const [numeroInterno, setNumeroInterno] = useState("");

  const [prodotto, setProdotto] = useState<ProdottoProprio | null>(null);
  const [creatingProdotto, setCreatingProdotto] = useState(false);

  const [quantita, setQuantita] = useState<number>(100);
  const [prezzoUnitario, setPrezzoUnitario] = useState<number>(0);

  const [consegnaTipo, setConsegnaTipo] = useState<"asap" | "data">("asap");
  const [dataRichiesta, setDataRichiesta] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [usaMagazzino, setUsaMagazzino] = useState(false);
  const [usaSabato, setUsaSabato] = useState(false);
  const [giacenzaKg, setGiacenzaKg] = useState(0);
  const [calcolo, setCalcolo] = useState<CapacitaCalcoloResult | null>(null);
  const [calcoloLoading, setCalcoloLoading] = useState(false);
  const [sabatoProposto, setSabatoProposto] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!clienteId || !clienteTarga || !dataOrdine) {
      setNumeroInterno("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const result = await previewNumeroInternoOrdineAction({
        clienteId,
        codiceTargaCliente: clienteTarga,
        dataOrdine,
      });
      if (cancelled) return;
      if (result.success) setNumeroInterno(result.numeroInterno);
    })();
    return () => {
      cancelled = true;
    };
  }, [clienteId, clienteTarga, dataOrdine]);

  const sortedProdotti = useMemo(
    () =>
      [...prodotti].sort((a, b) =>
        a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
      ),
    [prodotti]
  );

  async function runCalcolo(opts?: { usaSabatoOverride?: boolean }) {
    if (!prodotto || quantita <= 0) return;
    setCalcoloLoading(true);
    setFormError(null);
    const sab = opts?.usaSabatoOverride ?? usaSabato;
    const result = await calcolaConsegnaOrdineAction({
      prodottoId: prodotto.id,
      prodottoCodice: prodotto.codice,
      quantitaKg: quantita,
      consegnaTipo,
      dataRichiesta: consegnaTipo === "data" ? dataRichiesta || null : null,
      urgente,
      usaMagazzino,
      usaSabato: sab,
    });
    setCalcoloLoading(false);
    if (!result.success) {
      setFormError(result.error);
      setCalcolo(null);
      return;
    }
    setGiacenzaKg(result.giacenzaKg);
    setCalcolo(result.calcolo);
    if (result.calcolo.chiedereSabato && !sab) {
      setSabatoProposto(true);
    }
  }

  useEffect(() => {
    if (step !== 4 || !prodotto) return;
    void runCalcolo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    step,
    prodotto?.id,
    quantita,
    consegnaTipo,
    dataRichiesta,
    urgente,
    usaMagazzino,
    usaSabato,
  ]);

  function canNext(): boolean {
    if (step === 1) return Boolean(clienteId && clienteNome && clienteTarga);
    if (step === 2) return Boolean(prodotto);
    if (step === 3) return quantita > 0 && prezzoUnitario >= 0;
    return true;
  }

  async function submit() {
    if (!prodotto || !clienteId) return;
    setSaving(true);
    setFormError(null);
    const result = await createOrdineWizardAction({
      clienteId,
      cliente: clienteNome,
      codiceTargaCliente: clienteTarga,
      dataOrdine,
      prodottoId: prodotto.id,
      prodottoCodice: prodotto.codice,
      prodottoNome: prodotto.nome,
      quantita,
      prezzoUnitario,
      ivaPercentuale: 22,
      consegnaTipo,
      dataRichiesta: consegnaTipo === "data" ? dataRichiesta || null : null,
      urgente,
      usaMagazzino,
      usaSabato,
      tipoPagamento: "alla_consegna",
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
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
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo ordine ricevuto
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Wizard con capacità produttiva (secco ODR/NDR · gel OGL/NGL). Dati di
          prova eliminabili.
        </p>

        <ol className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                step === s.n
                  ? "bg-[var(--primary)] text-white"
                  : step > s.n
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-600"
              }`}
            >
              {s.n}. {s.label}
            </li>
          ))}
        </ol>

        <div className="mt-5 space-y-4">
          {step === 1 && (
            <>
              <div className="block text-sm">
                <span className="mb-1 block font-medium">Cliente</span>
                <ClienteSelectField
                  value={clienteId}
                  autoFocus
                  onChange={(c) => {
                    setClienteId(c?.id ?? "");
                    setClienteNome(c?.ragioneSociale ?? "");
                    setClienteTarga(c?.codiceTarga ?? "");
                  }}
                />
              </div>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Data ordine</span>
                <input
                  type="date"
                  value={dataOrdine}
                  onChange={(e) => setDataOrdine(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              {numeroInterno ? (
                <p className="text-sm text-[var(--muted)]">
                  N. interno previsto:{" "}
                  <span className="font-mono font-medium text-slate-800">
                    {numeroInterno}
                  </span>
                </p>
              ) : null}
            </>
          )}

          {step === 2 && (
            <>
              <div className="flex gap-2">
                <select
                  value={prodotto?.id ?? ""}
                  disabled={!prodottiReady}
                  onChange={(e) => {
                    const p =
                      sortedProdotti.find((x) => x.id === e.target.value) ??
                      null;
                    setProdotto(p);
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                >
                  <option value="">
                    {prodottiReady
                      ? "Seleziona prodotto proprio…"
                      : "Caricamento…"}
                  </option>
                  {sortedProdotti.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codice} — {p.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCreatingProdotto(true)}
                  className="shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
                >
                  Nuovo
                </button>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Prefissi linea: ODR/NDR → secco (essiccatori); OGL/NGL → gel
                (percorso dedicato).
              </p>
            </>
          )}

          {step === 3 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Quantità (kg)</span>
                <input
                  type="number"
                  min={0.001}
                  step="any"
                  value={quantita}
                  onChange={(e) => setQuantita(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Prezzo vendita (€/kg)
                </span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={prezzoUnitario}
                  onChange={(e) => setPrezzoUnitario(Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
              {prodotto ? (
                <p className="sm:col-span-2 text-sm text-[var(--muted)]">
                  {prodotto.codice} — {prodotto.nome}
                </p>
              ) : null}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Modalità consegna</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="consegna"
                    checked={consegnaTipo === "asap"}
                    onChange={() => setConsegnaTipo("asap")}
                  />
                  Prima possibile (calcolo capacità)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="consegna"
                    checked={consegnaTipo === "data"}
                    onChange={() => setConsegnaTipo("data")}
                  />
                  Data specifica
                </label>
                {consegnaTipo === "data" ? (
                  <input
                    type="date"
                    value={dataRichiesta}
                    min={dataOrdine}
                    onChange={(e) => setDataRichiesta(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                  />
                ) : null}
              </fieldset>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={urgente}
                  onChange={(e) => setUrgente(e.target.checked)}
                />
                Ordine urgente
              </label>

              <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-3 text-sm">
                <p className="font-medium">
                  Giacenza magazzino:{" "}
                  {giacenzaKg.toLocaleString("it-IT")} kg
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={usaMagazzino}
                    onChange={(e) => setUsaMagazzino(e.target.checked)}
                    disabled={giacenzaKg <= 0}
                  />
                  <span>
                    Usa magazzino per questo ordine
                    <span className="block text-xs text-[var(--muted)]">
                      Anche se l’ordine è maggiore della giacenza: il resto viene
                      prodotto fresco e il magazzino si rimpiazza.
                    </span>
                  </span>
                </label>
              </div>

              {(sabatoProposto || urgente) && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={usaSabato}
                    onChange={(e) => {
                      setUsaSabato(e.target.checked);
                      setSabatoProposto(false);
                    }}
                  />
                  <span>
                    Includi il sabato tra i giorni produttivi
                    <span className="block text-xs text-amber-800/80">
                      Consigliato se urgente e la giacenza non copre l’ordine.
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-lg border border-[var(--border)] px-3 py-3 text-sm">
                {calcoloLoading ? (
                  <p className="text-[var(--muted)]">Calcolo capacità…</p>
                ) : calcolo ? (
                  <ul className="space-y-1.5">
                    <li>
                      Linea:{" "}
                      <strong>
                        {calcolo.lineaCodice === "secco"
                          ? "Secco (ODR/NDR)"
                          : calcolo.lineaCodice === "gel"
                            ? "Gel (OGL/NGL)"
                            : "—"}
                      </strong>{" "}
                      · stagione {calcolo.stagione}
                    </li>
                    <li>
                      Resa usata: {calcolo.resaPercentualeUsata}% (
                      {calcolo.resaFonte === "media_osservata"
                        ? "media reale"
                        : "baseline"})
                    </li>
                    <li>
                      Capacità uscita/giorno:{" "}
                      {calcolo.capacitaUscitaGiornalieraKg.toLocaleString(
                        "it-IT"
                      )}{" "}
                      kg
                      {calcolo.essiccatoriAttivi > 0
                        ? ` · ${calcolo.essiccatoriAttivi} essiccatori × ingresso`
                        : null}
                    </li>
                    <li>
                      Giorni lavorativi stimati:{" "}
                      {calcolo.giorniLavorativiNecessari}
                    </li>
                    <li className="font-semibold text-slate-900">
                      Data consegna stimata:{" "}
                      {formatDateIt(calcolo.dataConsegnaStimata)}
                    </li>
                    {calcolo.fattibileAllaData === false ? (
                      <li className="text-amber-800">
                        Data richiesta non fattibile — proposta la prima data
                        utile.
                      </li>
                    ) : null}
                    {calcolo.avvisi.map((a) => (
                      <li key={a} className="text-xs text-[var(--muted)]">
                        {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[var(--muted)]">
                    Imposta i parametri per calcolare la consegna.
                  </p>
                )}
              </div>
            </div>
          )}

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Annulla
          </button>
          <div className="flex gap-2">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
              >
                Indietro
              </button>
            ) : null}
            {step < 4 ? (
              <button
                type="button"
                disabled={!canNext()}
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                Avanti
              </button>
            ) : (
              <button
                type="button"
                disabled={saving || calcoloLoading || !calcolo?.dataConsegnaStimata}
                onClick={() => void submit()}
                className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
              >
                {saving ? "Salvataggio…" : "Salva ordine"}
              </button>
            )}
          </div>
        </div>
      </div>

      {creatingProdotto && (
        <ProdottoProprioFormModal
          mode="create"
          catalog={prodotti}
          elevated
          onClose={() => setCreatingProdotto(false)}
          onSave={async (values) => {
            const result = await addProdotto(values);
            if (!result.success) {
              throw new Error(result.error);
            }
            setProdotto(result.prodotto);
            setCreatingProdotto(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}
