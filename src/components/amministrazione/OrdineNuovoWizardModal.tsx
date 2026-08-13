"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createOrdineWizardAction,
  previewNumeroInternoOrdineAction,
} from "@/app/actions/ordini";
import {
  createCorriereAction,
  listCorrieriAction,
  listImballaggiVociAction,
} from "@/app/actions/imballaggi-spedizioni";
import { calcolaConsegnaOrdineAction } from "@/app/actions/produzione-capacita";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import type { Ordine } from "@/lib/amministrazione/ordini";
import {
  childStadioFor,
  emptyConfezionamentoDraft,
  emptyNodo,
  totaleKgConfezionati,
  type ConfezionamentoDraft,
  type ConfezionamentoNodoDraft,
  type Corriere,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";
import type { CapacitaCalcoloResult } from "@/lib/amministrazione/produzione-capacita";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";
import type { OrdineConfezionamentoNodoStadio } from "@/types/database";

type Props = {
  onClose: () => void;
  onSaved: (ordine: Ordine) => void;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

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
  { n: 5, label: "Spedizione" },
  { n: 6, label: "Confezione" },
];

function updateNodoInTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string,
  patch: Partial<ConfezionamentoNodoDraft>
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === localId) return { ...n, ...patch };
    return { ...n, children: updateNodoInTree(n.children, localId, patch) };
  });
}

function removeNodoFromTree(
  nodes: ConfezionamentoNodoDraft[],
  localId: string
): ConfezionamentoNodoDraft[] {
  return nodes
    .filter((n) => n.localId !== localId)
    .map((n) => ({
      ...n,
      children: removeNodoFromTree(n.children, localId),
    }));
}

function addChildToNode(
  nodes: ConfezionamentoNodoDraft[],
  parentId: string,
  child: ConfezionamentoNodoDraft
): ConfezionamentoNodoDraft[] {
  return nodes.map((n) => {
    if (n.localId === parentId) {
      return { ...n, children: [...n.children, child] };
    }
    return {
      ...n,
      children: addChildToNode(n.children, parentId, child),
    };
  });
}

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
  const [resaOverride, setResaOverride] = useState<number | "">("");
  const [kgEssiccatore, setKgEssiccatore] = useState<number | "">(2200);
  const [overridesSeeded, setOverridesSeeded] = useState(false);

  const [corrieri, setCorrieri] = useState<Corriere[]>([]);
  const [corriereId, setCorriereId] = useState<string>("");
  const [corriereDopo, setCorriereDopo] = useState(false);
  const [nuovoCorriereNome, setNuovoCorriereNome] = useState("");
  const [aCarico, setACarico] = useState<
    "cliente" | "agrinsicilia" | "diviso"
  >("cliente");
  const [pctAgrin, setPctAgrin] = useState<number | "">(50);

  const [catalogo, setCatalogo] = useState<ImballaggioVoce[]>([]);
  const [conf, setConf] = useState<ConfezionamentoDraft>(
    emptyConfezionamentoDraft()
  );

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

  useEffect(() => {
    void (async () => {
      const [cRes, iRes] = await Promise.all([
        listCorrieriAction(),
        listImballaggiVociAction(),
      ]);
      if (cRes.success) setCorrieri(cRes.items);
      if (iRes.success) setCatalogo(iRes.items);
    })();
  }, []);

  const sortedProdotti = useMemo(
    () =>
      [...prodotti].sort((a, b) =>
        a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
      ),
    [prodotti]
  );

  const vociByStadio = useMemo(() => {
    const map: Record<string, ImballaggioVoce[]> = {
      movimentazione: [],
      confezione: [],
      isolamento: [],
    };
    for (const v of catalogo) {
      map[v.stadio]?.push(v);
    }
    return map;
  }, [catalogo]);

  const kgConfezionati = useMemo(
    () => totaleKgConfezionati(conf.nodi),
    [conf.nodi]
  );
  const kgDelta = Math.round((quantita - kgConfezionati) * 1000) / 1000;

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
      resaPercentualeOverride:
        resaOverride === "" ? null : Number(resaOverride),
      capacitaIngressoKgPerEssiccatoreOverride:
        kgEssiccatore === "" ? null : Number(kgEssiccatore),
    });
    setCalcoloLoading(false);
    if (!result.success) {
      setFormError(result.error);
      setCalcolo(null);
      return;
    }
    setGiacenzaKg(result.giacenzaKg);
    setCalcolo(result.calcolo);
    if (!overridesSeeded) {
      setResaOverride(result.calcolo.resaPercentualeUsata);
      if (result.calcolo.essiccatoriAttivi > 0) {
        const per =
          result.calcolo.capacitaIngressoGiornalieraKg /
          result.calcolo.essiccatoriAttivi;
        if (Number.isFinite(per) && per > 0) setKgEssiccatore(Math.round(per));
      }
      setOverridesSeeded(true);
    }
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
    resaOverride,
    kgEssiccatore,
  ]);

  function canNext(): boolean {
    if (step === 1) return Boolean(clienteId && clienteNome && clienteTarga);
    if (step === 2) return Boolean(prodotto);
    if (step === 3) return quantita > 0 && prezzoUnitario >= 0;
    if (step === 4) return Boolean(calcolo?.dataConsegnaStimata);
    if (step === 5) {
      if (!corriereDopo && !corriereId) return false;
      if (aCarico === "diviso" && (pctAgrin === "" || Number(pctAgrin) < 0))
        return false;
      return true;
    }
    return true;
  }

  async function submit() {
    if (!prodotto || !clienteId) return;
    if (Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0 && !conf.coerenzaIgnorata) {
      setFormError(
        kgDelta > 0
          ? `${kgDelta} kg restano fuori dal confezionamento: modifica oppure spunta «Ignora».`
          : `Confezionamento supera l’ordine di ${Math.abs(kgDelta)} kg: modifica oppure spunta «Ignora».`
      );
      return;
    }
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
      resaPercentualeOverride:
        resaOverride === "" ? null : Number(resaOverride),
      capacitaIngressoKgPerEssiccatoreOverride:
        kgEssiccatore === "" ? null : Number(kgEssiccatore),
      spedizioneMezzo: "corriere",
      corriereId: corriereDopo ? null : corriereId || null,
      corriereDaCompilare: corriereDopo,
      spedizioneACarico: aCarico,
      spedizionePctAgrinsicilia:
        aCarico === "diviso" ? Number(pctAgrin) : null,
      confezionamento: conf,
      tipoPagamento: "alla_consegna",
    });
    setSaving(false);
    if (!result.success) {
      setFormError(result.error);
      return;
    }
    onSaved(result.ordine);
  }

  function applyCatalogToNodo(
    localId: string,
    voceId: string,
    stadio: OrdineConfezionamentoNodoStadio
  ) {
    const voce = catalogo.find((v) => v.id === voceId);
    if (!voce) return;
    setConf((prev) => ({
      ...prev,
      nodi: updateNodoInTree(prev.nodi, localId, {
        catalogoId: voce.id,
        nome: voce.nome,
        codice: voce.codice,
        stadio: stadio === "prodotto_kg" ? "prodotto_kg" : voce.stadio,
      }),
    }));
  }

  function renderNodo(nodo: ConfezionamentoNodoDraft, depth: number) {
    const nextStadio = childStadioFor(nodo.stadio, conf.movimentazioneModo);
    const options =
      nodo.stadio === "prodotto_kg"
        ? []
        : vociByStadio[nodo.stadio] ?? [];
    return (
      <div
        key={nodo.localId}
        className="rounded-lg border border-[var(--border)] bg-white p-3"
        style={{ marginLeft: depth * 12 }}
      >
        <div className="flex flex-wrap items-end gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            {nodo.stadio === "prodotto_kg"
              ? "Prodotto (kg)"
              : nodo.stadio}
          </span>
          {nodo.stadio !== "prodotto_kg" ? (
            <select
              value={nodo.catalogoId ?? ""}
              onChange={(e) =>
                applyCatalogToNodo(nodo.localId, e.target.value, nodo.stadio)
              }
              className="min-w-[180px] flex-1 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
            >
              <option value="">Seleziona da catalogo…</option>
              {options.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-slate-700">
              {prodotto ? `${prodotto.codice} — ${prodotto.nome}` : "Prodotto"}
            </span>
          )}
          <label className="text-xs">
            N
            <input
              type="number"
              min={0.001}
              step="any"
              value={nodo.quantita}
              onChange={(e) =>
                setConf((prev) => ({
                  ...prev,
                  nodi: updateNodoInTree(prev.nodi, nodo.localId, {
                    quantita: Number(e.target.value) || 0,
                  }),
                }))
              }
              className="ml-1 w-16 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          {nodo.stadio === "prodotto_kg" ? (
            <label className="text-xs">
              kg
              <input
                type="number"
                min={0.001}
                step="any"
                value={nodo.kgProdotto ?? ""}
                onChange={(e) =>
                  setConf((prev) => ({
                    ...prev,
                    nodi: updateNodoInTree(prev.nodi, nodo.localId, {
                      kgProdotto: Number(e.target.value) || 0,
                      nome: prodotto?.nome ?? "Prodotto",
                      codice: prodotto?.codice ?? "",
                    }),
                  }))
                }
                className="ml-1 w-20 rounded border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
          ) : null}
          {nextStadio ? (
            <button
              type="button"
              className="rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50"
              onClick={() => {
                const child = emptyNodo(nextStadio);
                if (nextStadio === "prodotto_kg" && prodotto) {
                  child.nome = prodotto.nome;
                  child.codice = prodotto.codice;
                  child.kgProdotto = 20;
                }
                setConf((prev) => ({
                  ...prev,
                  nodi: addChildToNode(prev.nodi, nodo.localId, child),
                }));
              }}
            >
              + {nextStadio === "prodotto_kg" ? "kg prodotto" : nextStadio}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded p-1.5 text-red-600 hover:bg-red-50"
            aria-label="Rimuovi"
            onClick={() =>
              setConf((prev) => ({
                ...prev,
                nodi: removeNodoFromTree(prev.nodi, nodo.localId),
              }))
            }
          >
            <FaTrash size={11} />
          </button>
        </div>
        {nodo.stadio !== "prodotto_kg" && nodo.catalogoId ? (
          <p className="mt-1 text-xs text-[var(--muted)]">
            1 {nodo.nome} composto da:{" "}
            {nodo.children.length
              ? nodo.children
                  .map((c) => `N${c.quantita} ${c.nome || c.stadio}`)
                  .join(" + ")
              : "— (aggiungi livello successivo)"}
          </p>
        ) : null}
        <div className="mt-2 space-y-2">
          {nodo.children.map((c) => renderNodo(c, depth + 1))}
        </div>
      </div>
    );
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
        className="w-full max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          Nuovo ordine ricevuto
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Wizard con capacità, spedizione corriere e confezionamento a stadi.
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
                    setOverridesSeeded(false);
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
                  onChange={(e) => {
                    setQuantita(Number(e.target.value));
                    setOverridesSeeded(false);
                  }}
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
                  Giacenza magazzino: {giacenzaKg.toLocaleString("it-IT")} kg
                </p>
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={usaMagazzino}
                    onChange={(e) => setUsaMagazzino(e.target.checked)}
                    disabled={giacenzaKg <= 0}
                  />
                  <span>Usa magazzino per questo ordine</span>
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
                  <span>Includi il sabato tra i giorni produttivi</span>
                </label>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Resa usata (%)
                  </span>
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step="0.01"
                    value={resaOverride}
                    onChange={(e) =>
                      setResaOverride(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Modificabile: ricalcola giorni e data (non altera i default
                    globali).
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    kg / essiccatore
                  </span>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={kgEssiccatore}
                    onChange={(e) =>
                      setKgEssiccatore(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                  />
                  <span className="mt-1 block text-xs text-[var(--muted)]">
                    Default tipico 2200 kg ingresso per essiccatore attivo.
                  </span>
                </label>
              </div>

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
                      {calcolo.resaFonte === "override_operatore"
                        ? "modificata operatore"
                        : calcolo.resaFonte === "media_osservata"
                          ? "media reale"
                          : "baseline"}
                      )
                    </li>
                    <li>
                      Capacità ingresso/giorno:{" "}
                      {calcolo.capacitaIngressoGiornalieraKg.toLocaleString(
                        "it-IT"
                      )}{" "}
                      kg
                      {calcolo.essiccatoriAttivi > 0
                        ? ` · ${calcolo.essiccatoriAttivi} essiccatori`
                        : null}
                    </li>
                    <li>
                      Capacità uscita/giorno:{" "}
                      {calcolo.capacitaUscitaGiornalieraKg.toLocaleString(
                        "it-IT"
                      )}{" "}
                      kg
                    </li>
                    <li>
                      Giorni lavorativi stimati:{" "}
                      {calcolo.giorniLavorativiNecessari}
                    </li>
                    <li className="font-semibold text-slate-900">
                      Data consegna stimata:{" "}
                      {formatDateIt(calcolo.dataConsegnaStimata)}
                    </li>
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

          {step === 5 && (
            <div className="space-y-4">
              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">Mezzo</legend>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked readOnly />
                  Corriere
                </label>
                <p className="text-xs text-[var(--muted)]">
                  Mezzo corriere resta selezionato.
                </p>
                <select
                  disabled={corriereDopo}
                  value={corriereId}
                  onChange={(e) => setCorriereId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm disabled:bg-slate-50"
                >
                  <option value="">Seleziona corriere…</option>
                  {corrieri.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={corriereDopo}
                    onChange={(e) => {
                      setCorriereDopo(e.target.checked);
                      if (e.target.checked) setCorriereId("");
                    }}
                  />
                  Compilerò dopo
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={nuovoCorriereNome}
                    onChange={(e) => setNuovoCorriereNome(e.target.value)}
                    placeholder="Nuovo corriere…"
                    className="min-w-[160px] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
                    onClick={async () => {
                      if (!nuovoCorriereNome.trim()) return;
                      const res = await createCorriereAction({
                        nome: nuovoCorriereNome.trim(),
                      });
                      if (!res.success) {
                        setFormError(res.error);
                        return;
                      }
                      setCorrieri((prev) =>
                        [...prev, res.item].sort((a, b) =>
                          a.nome.localeCompare(b.nome, "it")
                        )
                      );
                      setCorriereId(res.item.id);
                      setCorriereDopo(false);
                      setNuovoCorriereNome("");
                    }}
                  >
                    <FaPlus size={11} /> Aggiungi
                  </button>
                </div>
              </fieldset>

              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">A carico</legend>
                {(
                  [
                    ["cliente", "Cliente"],
                    ["agrinsicilia", "Agrinsicilia"],
                    ["diviso", "Diviso"],
                  ] as const
                ).map(([val, label]) => (
                  <label key={val} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="aCarico"
                      checked={aCarico === val}
                      onChange={() => setACarico(val)}
                    />
                    {label}
                  </label>
                ))}
                {aCarico === "diviso" ? (
                  <label className="mt-2 block text-sm">
                    <span className="mb-1 block font-medium">
                      % Agrinsicilia (resto al cliente)
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={pctAgrin}
                      onChange={(e) =>
                        setPctAgrin(
                          e.target.value === "" ? "" : Number(e.target.value)
                        )
                      }
                      className="w-40 rounded-lg border border-[var(--border)] px-3 py-2"
                    />
                    {pctAgrin !== "" ? (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        Cliente: {Math.round((100 - Number(pctAgrin)) * 100) / 100}%
                      </span>
                    ) : null}
                  </label>
                ) : null}
              </fieldset>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <legend className="px-1 text-sm font-medium">
                  Movimentazione
                </legend>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={conf.movimentazioneModo === "su_pallet"}
                    onChange={() =>
                      setConf((p) => ({
                        ...p,
                        movimentazioneModo: "su_pallet",
                        nodi: [],
                      }))
                    }
                  />
                  Su pallet
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={conf.movimentazioneModo === "nessun_pallet"}
                    onChange={() =>
                      setConf((p) => ({
                        ...p,
                        movimentazioneModo: "nessun_pallet",
                        palletCatalogoId: null,
                        nodi: [],
                      }))
                    }
                  />
                  Nessun pallet
                </label>
                {conf.movimentazioneModo === "su_pallet" ? (
                  <>
                    <select
                      value={conf.palletCatalogoId ?? ""}
                      onChange={(e) =>
                        setConf((p) => ({
                          ...p,
                          palletCatalogoId: e.target.value || null,
                        }))
                      }
                      className="mt-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                    >
                      <option value="">Tipo pallet (catalogo)…</option>
                      {vociByStadio.movimentazione.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome}
                        </option>
                      ))}
                    </select>
                    <label className="mt-2 block text-sm">
                      <span className="mb-1 block text-xs text-[var(--muted)]">
                        Misure personalizzate (opz.)
                      </span>
                      <input
                        value={conf.palletMisureCustom}
                        onChange={(e) =>
                          setConf((p) => ({
                            ...p,
                            palletMisureCustom: e.target.value,
                          }))
                        }
                        placeholder="es. 1100×900 mm"
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </label>
                  </>
                ) : null}
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Confezione (blocchi)</p>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                  onClick={() => {
                    const rootStadio = childStadioFor(
                      null,
                      conf.movimentazioneModo
                    )!;
                    const n = emptyNodo(rootStadio);
                    if (
                      conf.movimentazioneModo === "su_pallet" &&
                      conf.palletCatalogoId
                    ) {
                      const v = catalogo.find(
                        (x) => x.id === conf.palletCatalogoId
                      );
                      if (v) {
                        n.catalogoId = v.id;
                        n.nome = v.nome;
                        n.codice = v.codice;
                      }
                    }
                    setConf((p) => ({ ...p, nodi: [...p.nodi, n] }));
                  }}
                >
                  <FaPlus size={11} />
                  Aggiungi blocco{" "}
                  {conf.movimentazioneModo === "su_pallet"
                    ? "pallet"
                    : "confezione"}
                </button>
              </div>

              <div className="space-y-2">
                {conf.nodi.length === 0 ? (
                  <p className="text-sm text-[var(--muted)]">
                    Nessun blocco. Aggiungi pallet/confezione e scendi ai livelli
                    cartone → sacco → kg.
                  </p>
                ) : (
                  conf.nodi.map((n) => renderNodo(n, 0))
                )}
              </div>

              <div
                className={`rounded-lg border px-3 py-3 text-sm ${
                  Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0
                    ? "border-amber-300 bg-amber-50"
                    : "border-[var(--border)] bg-slate-50"
                }`}
              >
                <p>
                  Ordine: <strong>{quantita.toLocaleString("it-IT")} kg</strong>
                  {" · "}
                  Confezionati:{" "}
                  <strong>{kgConfezionati.toLocaleString("it-IT")} kg</strong>
                  {" · "}
                  Delta:{" "}
                  <strong>
                    {kgDelta > 0 ? "+" : ""}
                    {kgDelta.toLocaleString("it-IT")} kg
                  </strong>
                </p>
                {Math.abs(kgDelta) > 0.001 && conf.nodi.length > 0 ? (
                  <>
                    <p className="mt-2 text-amber-950">
                      {kgDelta > 0
                        ? `${kgDelta} kg restano fuori. Vuoi modificare qualcosa o ignorare?`
                        : `Confezionamento in eccesso di ${Math.abs(kgDelta)} kg.`}
                    </p>
                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={conf.coerenzaIgnorata}
                        onChange={(e) =>
                          setConf((p) => ({
                            ...p,
                            coerenzaIgnorata: e.target.checked,
                          }))
                        }
                      />
                      Ignora e salva comunque
                    </label>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    Coerenza kg OK (o nessun blocco — puoi salvare e completare
                    dopo).
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
            {step < 6 ? (
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
