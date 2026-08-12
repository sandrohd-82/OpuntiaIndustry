"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createFatturaAction,
  getProdottoPrezzoStoricoHintAction,
  getSpedizioneIvaStoricoHintAction,
  previewNumeroInternoFatturaAction,
} from "@/app/actions/fatture";
import { ApriFatturaFicButton } from "@/components/amministrazione/ApriFatturaFicButton";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { FornitoreSelectField } from "@/components/amministrazione/FornitoreSelectField";
import { ProdottoPrezzoStoricoInfo } from "@/components/amministrazione/ProdottoPrezzoStoricoInfo";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  bilancioDilazioni,
  calcolaTotaliFattura,
  emptyFatturaDilazione,
  emptyFatturaRiga,
  formatDateIt,
  formatEuro,
  importoRiga,
  isDilazioneFutura,
  normalizeDilazioneStato,
  prezzoScontatoUnitario,
  statoPagamentoFromDilazioni,
  todayIsoDate,
  type Fattura,
  type FatturaDilazione,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import {
  fatturaDetailPath,
  prodottoStoricoKey,
  type ProdottoPrezzoStoricoHint,
  type SpedizioneIvaStoricoHint,
} from "@/lib/amministrazione/fatture-storico";
import type { FatturaStatoPagamento } from "@/types/database";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";

type EditableRiga = Omit<
  FatturaRiga,
  "quantita" | "prezzoUnitario" | "scontoPercentuale"
> & {
  quantita: number | "";
  prezzoUnitario: number | "";
  scontoPercentuale: number | "";
};

type EditableDilazione = Omit<FatturaDilazione, "importo"> & {
  importo: number | "";
};

export type FatturaRegistrazionePrefill = {
  anagraficaId?: string;
  anagraficaRagioneSociale?: string;
  anagraficaCodiceTarga?: string;
  dataEmissione?: string;
  numeroDocumentoEsterno?: string;
  ficId?: number | null;
  spedizione?: number;
  spedizioneIvaApplicata?: boolean;
  ivaPercentuale?: number;
  statoPagamento?: FatturaStatoPagamento;
  note?: string;
  fatturaCollegataId?: string | null;
  riferimentoFatturaEsterno?: string;
  righe?: FatturaRiga[];
  lockAnagrafica?: boolean;
};

type Props = {
  kind: FatturaKind;
  onClose: () => void;
  onSaved: (fattura: Fattura) => void;
  /** Durante sync: interrompe la coda senza chiudere come “salta documento”. */
  onPause?: () => void;
  prefill?: FatturaRegistrazionePrefill | null;
  elevated?: boolean;
};

export function FatturaRegistrazioneModal({
  kind,
  onClose,
  onSaved,
  onPause,
  prefill = null,
  elevated = false,
}: Props) {
  const titleId = useId();
  const { prodotti, addProdotto, refresh } = useProdottiPropri();
  const [anagraficaId, setAnagraficaId] = useState(prefill?.anagraficaId ?? "");
  const [anagraficaRagioneSociale, setAnagraficaRagioneSociale] = useState(
    prefill?.anagraficaRagioneSociale ?? ""
  );
  const [anagraficaCodiceTarga, setAnagraficaCodiceTarga] = useState(
    prefill?.anagraficaCodiceTarga ?? ""
  );
  const [dataEmissione, setDataEmissione] = useState(
    prefill?.dataEmissione || new Date().toISOString().slice(0, 10)
  );
  const [numeroDocumentoEsterno, setNumeroDocumentoEsterno] = useState(
    prefill?.numeroDocumentoEsterno ?? ""
  );
  const [spedizione, setSpedizione] = useState<number | "">(
    prefill?.spedizione ?? 0
  );
  const [spedizioneIvaApplicata, setSpedizioneIvaApplicata] = useState(
    prefill?.spedizioneIvaApplicata ?? false
  );
  const [ivaPercentuale, setIvaPercentuale] = useState<number | "">(
    prefill?.ivaPercentuale ?? 22
  );
  const [statoPagamento, setStatoPagamento] = useState<FatturaStatoPagamento>(
    prefill?.statoPagamento ?? "da_pagare"
  );
  const [note, setNote] = useState(prefill?.note ?? "");
  const [righe, setRighe] = useState<EditableRiga[]>(
    prefill?.righe?.length
      ? prefill.righe.map((r) => ({
          ...r,
          scontoPercentuale: r.scontoPercentuale ?? 0,
        }))
      : [emptyFatturaRiga()]
  );
  const [ricevuta, setRicevuta] = useState<File | null>(null);
  const [numeroInterno, setNumeroInterno] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creatingProdotto, setCreatingProdotto] = useState(false);
  const [rigaIndexForNuovo, setRigaIndexForNuovo] = useState<number | null>(
    null
  );
  const [spedizioneIvaHint, setSpedizioneIvaHint] =
    useState<SpedizioneIvaStoricoHint | null>(null);
  const [prezzoHints, setPrezzoHints] = useState<
    Record<string, ProdottoPrezzoStoricoHint>
  >({});
  const [dilazioni, setDilazioni] = useState<EditableDilazione[]>([]);

  const totals = useMemo(
    () =>
      calcolaTotaliFattura({
        righe: righe.map((r) => ({
          quantita: numberOrZero(r.quantita),
          prezzoUnitario: numberOrZero(r.prezzoUnitario),
          scontoPercentuale: numberOrZero(r.scontoPercentuale),
        })),
        spedizione: numberOrZero(spedizione),
        spedizioneIvaApplicata,
        ivaPercentuale: numberOrZero(ivaPercentuale),
      }),
    [righe, spedizione, spedizioneIvaApplicata, ivaPercentuale]
  );

  const dilazioniNormalizzate = useMemo(
    () =>
      dilazioni.map((d) => ({
        dataScadenza: d.dataScadenza || todayIsoDate(),
        importo: numberOrZero(d.importo),
        statoPagamento: normalizeDilazioneStato(
          d.dataScadenza || todayIsoDate(),
          d.statoPagamento
        ),
        note: d.note ?? "",
      })),
    [dilazioni]
  );

  const statoDaDilazioni =
    dilazioniNormalizzate.length > 0
      ? statoPagamentoFromDilazioni(dilazioniNormalizzate)
      : null;

  const dilazioniBilancio = useMemo(
    () =>
      bilancioDilazioni(
        totals.totale,
        dilazioniNormalizzate.map((d) => d.importo)
      ),
    [totals.totale, dilazioniNormalizzate]
  );

  useEffect(() => {
    if (statoDaDilazioni && statoDaDilazioni !== statoPagamento) {
      setStatoPagamento(statoDaDilazioni);
    }
  }, [statoDaDilazioni, statoPagamento]);

  useEffect(() => {
    // Escape / click fuori non chiudono (evita perdita dati): solo Pausa / Annulla / Salva.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    if (!anagraficaId || !anagraficaCodiceTarga || !dataEmissione) {
      setNumeroInterno("");
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await previewNumeroInternoFatturaAction({
        kind,
        anagraficaId,
        codiceTarga: anagraficaCodiceTarga,
        dataEmissione,
      });
      if (cancelled) return;
      if (res.success) setNumeroInterno(res.numeroInterno);
      else setNumeroInterno("");
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, anagraficaId, anagraficaCodiceTarga, dataEmissione]);

  useEffect(() => {
    if (!anagraficaId) {
      setSpedizioneIvaHint(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const res = await getSpedizioneIvaStoricoHintAction({
        kind,
        anagraficaId,
      });
      if (cancelled) return;
      if (res.success) setSpedizioneIvaHint(res.hint);
      else setSpedizioneIvaHint(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, anagraficaId]);

  const prodottoKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of righe) {
      const k = prodottoStoricoKey({
        prodottoId: r.prodottoId,
        codice: r.codice,
      });
      if (k) keys.add(k);
    }
    return [...keys].sort().join("|");
  }, [righe]);

  useEffect(() => {
    if (!anagraficaId || !prodottoKeys) {
      setPrezzoHints({});
      return;
    }
    let cancelled = false;
    const rows = righe
      .map((r) => ({
        key: prodottoStoricoKey({
          prodottoId: r.prodottoId,
          codice: r.codice,
        }),
        prodottoId: r.prodottoId,
        codice: r.codice,
      }))
      .filter((r): r is typeof r & { key: string } => Boolean(r.key));

    const unique = new Map<string, { prodottoId: string | null; codice: string }>();
    for (const r of rows) {
      if (!unique.has(r.key)) {
        unique.set(r.key, {
          prodottoId: r.prodottoId,
          codice: r.codice,
        });
      }
    }

    void (async () => {
      const next: Record<string, ProdottoPrezzoStoricoHint> = {};
      await Promise.all(
        [...unique.entries()].map(async ([key, ref]) => {
          const res = await getProdottoPrezzoStoricoHintAction({
            kind,
            anagraficaId,
            prodottoId: ref.prodottoId,
            codice: ref.codice,
          });
          if (res.success) next[key] = res.hint;
        })
      );
      if (!cancelled) setPrezzoHints(next);
    })();

    return () => {
      cancelled = true;
    };
    // prodottoKeys riassume le chiavi prodotto delle righe
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intenzionale: evita refetch a ogni keystroke numerico
  }, [kind, anagraficaId, prodottoKeys]);

  function patchRiga(index: number, patch: Partial<EditableRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        next.importo = importoRiga(
          numberOrZero(next.quantita),
          numberOrZero(next.prezzoUnitario),
          numberOrZero(next.scontoPercentuale)
        );
        return next;
      })
    );
  }

  function applyProdotto(index: number, prodottoId: string) {
    const p = prodotti.find((x) => x.id === prodottoId);
    if (!p) {
      patchRiga(index, { prodottoId: null });
      return;
    }
    patchRiga(index, {
      prodottoId: p.id,
      codice: p.codice,
      descrizione: p.nome,
    });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!anagraficaId) {
      setFormError(
        kind === "ricevuta"
          ? "Seleziona un fornitore (intestazione)."
          : "Seleziona un cliente (intestazione)."
      );
      return;
    }
    if (dilazioniNormalizzate.length > 0 && !dilazioniBilancio.equilibrato) {
      if (dilazioniBilancio.mancante > 0) {
        setFormError(
          `Dilazioni incomplete: manca ${formatEuro(dilazioniBilancio.mancante)} rispetto al totale fattura (${formatEuro(dilazioniBilancio.totaleFattura)}).`
        );
      } else {
        setFormError(
          `Dilazioni in esubero di ${formatEuro(dilazioniBilancio.esubero)} rispetto al totale fattura (${formatEuro(dilazioniBilancio.totaleFattura)}).`
        );
      }
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const fd = new FormData();
      const righePayload: FatturaRiga[] = righe.map((r) => {
        const scontoPercentuale = numberOrZero(r.scontoPercentuale);
        return {
          ...r,
          quantita: numberOrZero(r.quantita),
          prezzoUnitario: numberOrZero(r.prezzoUnitario),
          scontoPercentuale,
          importo: importoRiga(
            numberOrZero(r.quantita),
            numberOrZero(r.prezzoUnitario),
            scontoPercentuale
          ),
        };
      });
      fd.set(
        "payload",
        JSON.stringify({
          anagraficaId,
          anagraficaRagioneSociale,
          anagraficaCodiceTarga,
          dataEmissione,
          numeroDocumentoEsterno,
          ficId: prefill?.ficId ?? null,
          spedizione: numberOrZero(spedizione),
          spedizioneIvaApplicata,
          ivaPercentuale: numberOrZero(ivaPercentuale),
          statoPagamento:
            dilazioniNormalizzate.length > 0
              ? statoPagamentoFromDilazioni(dilazioniNormalizzate)
              : statoPagamento,
          note,
          fatturaCollegataId: prefill?.fatturaCollegataId ?? null,
          riferimentoFatturaEsterno: prefill?.riferimentoFatturaEsterno ?? "",
          righe: righePayload,
          dilazioni: dilazioniNormalizzate,
        })
      );
      if (ricevuta) fd.set("ricevuta", ricevuta);
      const result = await createFatturaAction(kind, fd);
      if (!result.success) {
        setFormError(result.error);
        return;
      }
      onSaved(result.fattura);
    } finally {
      setSaving(false);
    }
  }

  const title =
    kind === "nota_credito"
      ? "Registrazione nota di credito"
      : kind === "emessa"
        ? "Registrazione fattura emessa"
        : "Registrazione fattura ricevuta";

  const dialog = (
    <div
      data-nested-modal={elevated ? "fattura" : undefined}
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 sm:py-12 ${
        elevated ? "z-[80]" : "z-[60]"
      }`}
      role="presentation"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-5xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {kind === "nota_credito"
                ? "Registrazione nota di credito nello storico (storno/annullamento). Apri il PDF FiC per verifica."
                : "Registrazione nello storico. Non è una fattura da inviare."}
            </p>
            {prefill?.riferimentoFatturaEsterno ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                Riferimento fattura:{" "}
                <strong>{prefill.riferimentoFatturaEsterno}</strong>
              </p>
            ) : null}
          </div>
          {prefill?.ficId ? (
            <ApriFatturaFicButton
              kind={kind}
              ficId={prefill.ficId}
              variant="button"
              label={
                kind === "nota_credito" ? "Apri nota di credito" : "Apri fattura"
              }
            />
          ) : null}
        </div>

        <form onSubmit={submit} className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Intestazione
              </label>
              {kind === "emessa" || kind === "nota_credito" ? (
                <ClienteSelectField
                  value={anagraficaId}
                  onChange={(c) => {
                    if (prefill?.lockAnagrafica && anagraficaId) return;
                    setAnagraficaId(c?.id ?? "");
                    setAnagraficaRagioneSociale(c?.ragioneSociale ?? "");
                    setAnagraficaCodiceTarga(c?.codiceTarga ?? "");
                  }}
                />
              ) : (
                <FornitoreSelectField
                  value={anagraficaId}
                  onChange={(f) => {
                    if (prefill?.lockAnagrafica && anagraficaId) return;
                    setAnagraficaId(f?.id ?? "");
                    setAnagraficaRagioneSociale(f?.ragioneSociale ?? "");
                    setAnagraficaCodiceTarga(f?.codiceTarga ?? "");
                  }}
                />
              )}
              {prefill?.lockAnagrafica ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Intestazione presa dall&apos;anagrafica OpuntiaIndustry.
                </p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Data emissione
              </label>
              <input
                type="date"
                required
                value={dataEmissione}
                onChange={(e) => setDataEmissione(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                N. documento interno
              </label>
              <input
                type="text"
                readOnly
                value={numeroInterno || "Seleziona intestazione…"}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-mono text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                N. documento esterno (FiC / fornitore)
              </label>
              <input
                type="text"
                value={numeroDocumentoEsterno}
                onChange={(e) => setNumeroDocumentoEsterno(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </div>
          </div>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">
                {kind === "ricevuta" ? "Prodotti" : "Prodotti venduti"}
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRigaIndexForNuovo(null);
                    setCreatingProdotto(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  <FaPlus size={11} />
                  Crea nuovo prodotto
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRighe((prev) => [...prev, emptyFatturaRiga()])
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  <FaPlus size={11} />
                  Aggiungi riga
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-2 py-2">Prodotto</th>
                    <th className="px-2 py-2">Codice</th>
                    <th className="px-2 py-2">Descrizione</th>
                    <th className="px-2 py-2">Qtà</th>
                    <th className="px-2 py-2">Prezzo u.</th>
                    <th className="px-2 py-2">Sconto %</th>
                    <th className="px-2 py-2">Importo</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga, index) => {
                    const listino = numberOrZero(riga.prezzoUnitario);
                    const sconto = numberOrZero(riga.scontoPercentuale);
                    const scontato = prezzoScontatoUnitario(listino, sconto);
                    const hasSconto = sconto > 0;
                    const storicoKey = prodottoStoricoKey({
                      prodottoId: riga.prodottoId,
                      codice: riga.codice,
                    });
                    const prezzoHint = storicoKey
                      ? prezzoHints[storicoKey]
                      : undefined;
                    const showInfo =
                      prezzoHint?.hasParticolari &&
                      (prezzoHint.condizioni.length ?? 0) > 0;
                    return (
                      <tr
                        key={index}
                        className="border-t border-[var(--border)]"
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-start gap-1.5">
                            <select
                              value={riga.prodottoId ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "__new__") {
                                  setRigaIndexForNuovo(index);
                                  setCreatingProdotto(true);
                                  return;
                                }
                                applyProdotto(index, v);
                              }}
                              className="w-full min-w-[140px] rounded border border-[var(--border)] px-2 py-1.5 text-xs"
                            >
                              <option value="">Seleziona…</option>
                              {prodotti.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.codice} — {p.nome}
                                </option>
                              ))}
                              <option value="__new__">
                                + Crea nuovo prodotto
                              </option>
                            </select>
                            {showInfo && prezzoHint ? (
                              <ProdottoPrezzoStoricoInfo
                                kind={kind}
                                condizioni={prezzoHint.condizioni}
                              />
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={riga.codice}
                            onChange={(e) =>
                              patchRiga(index, { codice: e.target.value })
                            }
                            className="w-24 rounded border border-[var(--border)] px-2 py-1.5 font-mono text-xs"
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            value={riga.descrizione}
                            onChange={(e) =>
                              patchRiga(index, { descrizione: e.target.value })
                            }
                            className="w-full min-w-[140px] rounded border border-[var(--border)] px-2 py-1.5"
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            min={0}
                            value={riga.quantita}
                            onValueChange={(v) =>
                              patchRiga(index, { quantita: v })
                            }
                            className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                            required
                          />
                        </td>
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            min={0}
                            value={riga.prezzoUnitario}
                            onValueChange={(v) =>
                              patchRiga(index, { prezzoUnitario: v })
                            }
                            className="w-24 rounded border border-[var(--border)] px-2 py-1.5"
                            required
                          />
                          {hasSconto ? (
                            <div className="mt-1 space-y-0.5 text-xs leading-tight">
                              <p className="text-[var(--muted)] line-through tabular-nums">
                                {formatEuro(listino)}
                              </p>
                              <p className="font-medium tabular-nums text-emerald-800">
                                {formatEuro(scontato)}
                              </p>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <ClearableNumberInput
                            min={0}
                            max={100}
                            value={riga.scontoPercentuale}
                            onValueChange={(v) =>
                              patchRiga(index, { scontoPercentuale: v })
                            }
                            className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                          />
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatEuro(riga.importo)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            disabled={righe.length <= 1}
                            onClick={() =>
                              setRighe((prev) =>
                                prev.filter((_, i) => i !== index)
                              )
                            }
                            className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                            aria-label="Rimuovi riga"
                          >
                            <FaTrash size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Spedizione
              </label>
              <ClearableNumberInput
                min={0}
                value={spedizione}
                onValueChange={setSpedizione}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
              <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-[var(--muted)]">
                <input
                  type="checkbox"
                  checked={spedizioneIvaApplicata}
                  onChange={(e) => setSpedizioneIvaApplicata(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Applica IVA anche sulla spedizione
                  <span className="mt-0.5 block text-[11px] opacity-80">
                    Di default l&apos;IVA non è applicata al trasporto.
                  </span>
                </span>
              </label>
              {spedizioneIvaHint?.applicataInPassato ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
                  <p className="font-medium">
                    Nota: a questa anagrafica è già stata applicata l&apos;IVA
                    sulla spedizione
                    {spedizioneIvaHint.ultima
                      ? ` (es. ${spedizioneIvaHint.ultima.numeroInterno} del ${formatDateIt(spedizioneIvaHint.ultima.dataEmissione)})`
                      : ""}
                    .
                  </p>
                  <ul className="mt-1.5 space-y-0.5">
                    {spedizioneIvaHint.fatture.slice(0, 5).map((f) => (
                      <li key={f.id}>
                        <a
                          href={fatturaDetailPath(kind, f.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-amber-900 underline hover:no-underline"
                        >
                          {f.numeroInterno}
                        </a>
                        <span className="text-amber-800/80">
                          {" "}
                          · {formatDateIt(f.dataEmissione)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Imponibile totale
              </label>
              <input
                readOnly
                value={formatEuro(totals.imponibile)}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                % IVA
              </label>
              <ClearableNumberInput
                min={0}
                max={100}
                value={ivaPercentuale}
                onValueChange={setIvaPercentuale}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Base IVA: {formatEuro(totals.baseIva)} · Imposta:{" "}
                {formatEuro(totals.imposta)}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Totale
              </label>
              <input
                readOnly
                value={formatEuro(totals.totale)}
                className="w-full rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 font-semibold"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Stato
              </label>
              <select
                value={statoPagamento}
                onChange={(e) =>
                  setStatoPagamento(e.target.value as FatturaStatoPagamento)
                }
                disabled={dilazioni.length > 0}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2 disabled:bg-slate-50"
              >
                <option value="da_pagare">Da pagare</option>
                <option value="pagato">Pagato</option>
              </select>
              {dilazioni.length > 0 ? (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Stato allineato alle dilazioni
                  {statoDaDilazioni === "pagato"
                    ? " (tutte pagate)."
                    : " (almeno una non saldata)."}
                </p>
              ) : null}
            </div>
            {statoPagamento === "pagato" ? (
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                  Copia ricevuta (opzionale)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setRicevuta(e.target.files?.[0] ?? null)}
                  className="w-full text-sm"
                />
              </div>
            ) : null}
          </div>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Dilazioni</h3>
                <p className="text-xs text-[var(--muted)]">
                  Una riga per scadenza con data e stato. Le date future risultano
                  non saldate.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDilazioni((prev) => {
                    const sommaAttuale = prev.reduce(
                      (s, d) => s + numberOrZero(d.importo),
                      0
                    );
                    const residuo = Math.max(
                      0,
                      Math.round((totals.totale - sommaAttuale) * 100) / 100
                    );
                    return [
                      ...prev,
                      emptyFatturaDilazione(
                        prev.length === 0 ? totals.totale : residuo
                      ),
                    ];
                  })
                }
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
              >
                <FaPlus size={11} />
                Aggiungi dilazione
              </button>
            </div>

            {dilazioni.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[var(--border)] px-3 py-3 text-xs text-[var(--muted)]">
                Nessuna dilazione. Usa «Aggiungi dilazione» per scadenze multiple.
              </p>
            ) : (
              <>
              <div
                className={`rounded-lg border px-3 py-2 text-xs ${
                  dilazioniBilancio.equilibrato
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : dilazioniBilancio.esubero > 0
                      ? "border-rose-200 bg-rose-50 text-rose-900"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                }`}
                role="status"
              >
                <p className="font-medium">
                  Controllo dilazioni · Somma rate{" "}
                  {formatEuro(dilazioniBilancio.sommaDilazioni)} su totale{" "}
                  {formatEuro(dilazioniBilancio.totaleFattura)}
                </p>
                {dilazioniBilancio.equilibrato ? (
                  <p className="mt-0.5">
                    Importi allineati al totale fattura.
                  </p>
                ) : dilazioniBilancio.mancante > 0 ? (
                  <p className="mt-0.5">
                    Mancano {formatEuro(dilazioniBilancio.mancante)} da
                    assegnare alle dilazioni.
                  </p>
                ) : (
                  <p className="mt-0.5">
                    Esubero di {formatEuro(dilazioniBilancio.esubero)} rispetto
                    al totale fattura.
                  </p>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th className="px-2 py-2">Data scadenza</th>
                      <th className="px-2 py-2">Importo</th>
                      <th className="px-2 py-2">Stato pagamento</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {dilazioni.map((d, index) => {
                      const futura = isDilazioneFutura(
                        d.dataScadenza || todayIsoDate()
                      );
                      const statoEffettivo = normalizeDilazioneStato(
                        d.dataScadenza || todayIsoDate(),
                        d.statoPagamento
                      );
                      return (
                        <tr
                          key={index}
                          className="border-t border-[var(--border)]"
                        >
                          <td className="px-2 py-2">
                            <input
                              type="date"
                              required
                              value={d.dataScadenza}
                              onChange={(e) => {
                                const dataScadenza = e.target.value;
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          dataScadenza,
                                          statoPagamento: normalizeDilazioneStato(
                                            dataScadenza,
                                            row.statoPagamento
                                          ),
                                        }
                                      : row
                                  )
                                );
                              }}
                              className="rounded border border-[var(--border)] px-2 py-1.5"
                            />
                            {futura ? (
                              <p className="mt-0.5 text-[11px] text-amber-800">
                                Futura → non saldata
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            <ClearableNumberInput
                              min={0}
                              value={d.importo}
                              onValueChange={(v) =>
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index ? { ...row, importo: v } : row
                                  )
                                )
                              }
                              className="w-28 rounded border border-[var(--border)] px-2 py-1.5"
                            />
                          </td>
                          <td className="px-2 py-2">
                            <select
                              value={statoEffettivo}
                              disabled={futura}
                              onChange={(e) =>
                                setDilazioni((prev) =>
                                  prev.map((row, i) =>
                                    i === index
                                      ? {
                                          ...row,
                                          statoPagamento: e.target
                                            .value as FatturaStatoPagamento,
                                        }
                                      : row
                                  )
                                )
                              }
                              className="rounded border border-[var(--border)] px-2 py-1.5 disabled:bg-slate-50"
                            >
                              <option value="da_pagare">Da pagare</option>
                              <option value="pagato">Pagato</option>
                            </select>
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setDilazioni((prev) =>
                                  prev.filter((_, i) => i !== index)
                                )
                              }
                              className="rounded p-1.5 text-red-600 hover:bg-red-50"
                              aria-label="Rimuovi dilazione"
                            >
                              <FaTrash size={12} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </section>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
            />
          </div>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {formError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--border)] pt-4">
            {onPause ? (
              <button
                type="button"
                onClick={onPause}
                disabled={saving}
                className="mr-auto rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
              >
                Pausa
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              {onPause ? "Salta documento" : "Annulla"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving
                ? "Salvataggio…"
                : kind === "nota_credito"
                  ? "Registra nota di credito"
                  : "Registra fattura"}
            </button>
          </div>
        </form>
      </div>

      {creatingProdotto && (
        <ProdottoProprioFormModal
          mode="create"
          elevated
          catalog={prodotti}
          onClose={() => {
            setCreatingProdotto(false);
            setRigaIndexForNuovo(null);
          }}
          onSave={async (values) => {
            const result = await addProdotto(values);
            if (!result.success) {
              throw new Error(result.error);
            }
            await refresh();
            const idx =
              rigaIndexForNuovo ?? (righe.length > 0 ? righe.length - 1 : 0);
            if (rigaIndexForNuovo == null && !righe[0]?.codice) {
              applyProdottoToLocal(
                0,
                result.prodotto.id,
                result.prodotto.codice,
                result.prodotto.nome
              );
            } else if (rigaIndexForNuovo != null) {
              applyProdottoToLocal(
                idx,
                result.prodotto.id,
                result.prodotto.codice,
                result.prodotto.nome
              );
            } else {
              setRighe((prev) => [
                ...prev,
                {
                  prodottoId: result.prodotto.id,
                  codice: result.prodotto.codice,
                  descrizione: result.prodotto.nome,
                  quantita: 1,
                  prezzoUnitario: 0,
                  scontoPercentuale: 0,
                  importo: 0,
                },
              ]);
            }
            setCreatingProdotto(false);
            setRigaIndexForNuovo(null);
          }}
        />
      )}
    </div>
  );

  function applyProdottoToLocal(
    index: number,
    id: string,
    codice: string,
    nome: string
  ) {
    setRighe((prev) =>
      prev.map((r, i) =>
        i === index
          ? {
              ...r,
              prodottoId: id,
              codice,
              descrizione: nome,
              importo: importoRiga(
                numberOrZero(r.quantita),
                numberOrZero(r.prezzoUnitario),
                numberOrZero(r.scontoPercentuale)
              ),
            }
          : r
      )
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
