"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createFatturaAction,
  previewNumeroInternoFatturaAction,
} from "@/app/actions/fatture";
import { ClienteSelectField } from "@/components/amministrazione/ClienteSelectField";
import { FornitoreSelectField } from "@/components/amministrazione/FornitoreSelectField";
import { ProdottoProprioFormModal } from "@/components/amministrazione/ProdottoProprioFormModal";
import { useProdottiPropri } from "@/hooks/useProdottiPropri";
import {
  calcolaTotaliFattura,
  emptyFatturaRiga,
  formatEuro,
  importoRiga,
  type Fattura,
  type FatturaKind,
  type FatturaRiga,
} from "@/lib/amministrazione/fatture";
import type { FatturaStatoPagamento } from "@/types/database";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";

export type FatturaRegistrazionePrefill = {
  anagraficaId?: string;
  anagraficaRagioneSociale?: string;
  anagraficaCodiceTarga?: string;
  dataEmissione?: string;
  numeroDocumentoEsterno?: string;
  ficId?: number | null;
  spedizione?: number;
  ivaPercentuale?: number;
  statoPagamento?: FatturaStatoPagamento;
  note?: string;
  righe?: FatturaRiga[];
  lockAnagrafica?: boolean;
};

type Props = {
  kind: FatturaKind;
  onClose: () => void;
  onSaved: (fattura: Fattura) => void;
  prefill?: FatturaRegistrazionePrefill | null;
  elevated?: boolean;
};

export function FatturaRegistrazioneModal({
  kind,
  onClose,
  onSaved,
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
  const [spedizione, setSpedizione] = useState(prefill?.spedizione ?? 0);
  const [ivaPercentuale, setIvaPercentuale] = useState(
    prefill?.ivaPercentuale ?? 22
  );
  const [statoPagamento, setStatoPagamento] = useState<FatturaStatoPagamento>(
    prefill?.statoPagamento ?? "da_pagare"
  );
  const [note, setNote] = useState(prefill?.note ?? "");
  const [righe, setRighe] = useState<FatturaRiga[]>(
    prefill?.righe?.length ? prefill.righe : [emptyFatturaRiga()]
  );
  const [ricevuta, setRicevuta] = useState<File | null>(null);
  const [numeroInterno, setNumeroInterno] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creatingProdotto, setCreatingProdotto] = useState(false);
  const [rigaIndexForNuovo, setRigaIndexForNuovo] = useState<number | null>(
    null
  );

  const totals = useMemo(
    () =>
      calcolaTotaliFattura({
        righe,
        spedizione,
        ivaPercentuale,
      }),
    [righe, spedizione, ivaPercentuale]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (hasNestedModalOpen()) return;
      onClose();
    }
    document.addEventListener("keydown", onKey, elevated);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, elevated);
      document.body.style.overflow = prev;
    };
  }, [onClose, elevated]);

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

  function patchRiga(index: number, patch: Partial<FatturaRiga>) {
    setRighe((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const next = { ...r, ...patch };
        next.importo = importoRiga(next.quantita, next.prezzoUnitario);
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
        kind === "emessa"
          ? "Seleziona un cliente (intestazione)."
          : "Seleziona un fornitore (intestazione)."
      );
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const fd = new FormData();
      fd.set(
        "payload",
        JSON.stringify({
          anagraficaId,
          anagraficaRagioneSociale,
          anagraficaCodiceTarga,
          dataEmissione,
          numeroDocumentoEsterno,
          ficId: prefill?.ficId ?? null,
          spedizione,
          ivaPercentuale,
          statoPagamento,
          note,
          righe,
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
    kind === "emessa"
      ? "Registrazione fattura emessa"
      : "Registrazione fattura ricevuta";

  const dialog = (
    <div
      data-nested-modal={elevated ? "fattura" : undefined}
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-8 sm:py-12 ${
        elevated ? "z-[80]" : "z-[60]"
      }`}
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        if (hasNestedModalOpen()) return;
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Registrazione nello storico. Non è una fattura da inviare.
        </p>

        <form onSubmit={submit} className="mt-4 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Intestazione
              </label>
              {kind === "emessa" ? (
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
                {kind === "emessa" ? "Prodotti venduti" : "Prodotti"}
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
                  onClick={() => setRighe((prev) => [...prev, emptyFatturaRiga()])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                >
                  <FaPlus size={11} />
                  Aggiungi riga
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-2 py-2">Prodotto</th>
                    <th className="px-2 py-2">Codice</th>
                    <th className="px-2 py-2">Descrizione</th>
                    <th className="px-2 py-2">Qtà</th>
                    <th className="px-2 py-2">Prezzo u.</th>
                    <th className="px-2 py-2">Importo</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {righe.map((riga, index) => (
                    <tr key={index} className="border-t border-[var(--border)]">
                      <td className="px-2 py-2">
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
                          <option value="__new__">+ Crea nuovo prodotto</option>
                        </select>
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
                          className="w-full min-w-[160px] rounded border border-[var(--border)] px-2 py-1.5"
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0.0001}
                          step="any"
                          value={riga.quantita}
                          onChange={(e) =>
                            patchRiga(index, {
                              quantita: Number(e.target.value) || 0,
                            })
                          }
                          className="w-20 rounded border border-[var(--border)] px-2 py-1.5"
                          required
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={riga.prezzoUnitario}
                          onChange={(e) =>
                            patchRiga(index, {
                              prezzoUnitario: Number(e.target.value) || 0,
                            })
                          }
                          className="w-24 rounded border border-[var(--border)] px-2 py-1.5"
                          required
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
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                Spedizione
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={spedizione}
                onChange={(e) => setSpedizione(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
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
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={ivaPercentuale}
                onChange={(e) => setIvaPercentuale(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
              <p className="mt-1 text-xs text-[var(--muted)]">
                Imposta: {formatEuro(totals.imposta)}
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
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <option value="da_pagare">Da pagare</option>
                <option value="pagato">Pagato</option>
              </select>
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

          <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              {saving ? "Salvataggio…" : "Registra fattura"}
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
              rigaIndexForNuovo ??
              (righe.length > 0 ? righe.length - 1 : 0);
            if (rigaIndexForNuovo == null && !righe[0]?.codice) {
              applyProdottoToLocal(0, result.prodotto.id, result.prodotto.codice, result.prodotto.nome);
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
              importo: importoRiga(r.quantita, r.prezzoUnitario),
            }
          : r
      )
    );
  }

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
