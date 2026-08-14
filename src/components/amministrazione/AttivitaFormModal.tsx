"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { listProdottiByAttivitaAction } from "@/app/actions/attivita";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import {
  ClearableNumberInput,
} from "@/components/ui/ClearableNumberInput";
import {
  CODICE_ATTIVITA_PREFIX,
  composeCodiceAttivita,
  sanitizeCodiceAttivitaBody,
  stripCodiceAttivitaPrefix,
  type Attivita,
  type AttivitaInput,
  type AttivitaProdottoLinkInput,
} from "@/lib/amministrazione/attivita";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

type Props = {
  mode: "create" | "edit";
  initial?: Attivita | null;
  catalog?: Attivita[];
  onClose: () => void;
  onSave: (values: AttivitaInput) => void | Promise<void>;
};

export function AttivitaFormModal({
  mode,
  initial,
  catalog = [],
  onClose,
  onSave,
}: Props) {
  const titleId = useId();
  const isEdit = mode === "edit";

  const [codiceBody, setCodiceBody] = useState(
    initial ? stripCodiceAttivitaPrefix(initial.codice) : "-"
  );
  const [titolo, setTitolo] = useState(initial?.titolo ?? "");
  const [spiegazione, setSpiegazione] = useState(initial?.spiegazione ?? "");
  const [kgPerOra, setKgPerOra] = useState<number | "">(
    initial?.kgPerOra ?? 90
  );
  const [oreGiorno, setOreGiorno] = useState<number | "">(
    initial?.oreGiorno ?? 8
  );
  const [incastrabile, setIncastrabile] = useState(
    initial?.incastrabileDuranteLavorazione ?? false
  );
  const [prodottiCatalog, setProdottiCatalog] = useState<ProdottoProprio[]>(
    []
  );
  const [prodottiLinks, setProdottiLinks] = useState<
    AttivitaProdottoLinkInput[]
  >([]);
  const [prodottiQuery, setProdottiQuery] = useState("");
  const [prodottiLoading, setProdottiLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setProdottiLoading(true);
      const all = await listProdottiPropriAction();
      if (cancelled) return;
      if (all.success) setProdottiCatalog(all.prodotti);

      if (initial?.id) {
        const linked = await listProdottiByAttivitaAction(initial.id);
        if (!cancelled && linked.success) {
          setProdottiLinks(
            linked.prodotti.map((p) => ({
              prodottoId: p.prodottoId,
              obbligatoria: p.obbligatoria,
            }))
          );
        }
      }
      if (!cancelled) setProdottiLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial?.id]);

  const codiceCompleto = useMemo(() => {
    const body = sanitizeCodiceAttivitaBody(codiceBody);
    return body ? composeCodiceAttivita(body) : "";
  }, [codiceBody]);

  const codiceDuplicato = useMemo(() => {
    if (!codiceCompleto) return null;
    return (
      catalog.find(
        (a) =>
          a.codice.toLowerCase() === codiceCompleto.toLowerCase() &&
          a.id !== initial?.id
      ) ?? null
    );
  }, [catalog, codiceCompleto, initial?.id]);

  const selectedIds = useMemo(
    () => new Set(prodottiLinks.map((l) => l.prodottoId)),
    [prodottiLinks]
  );

  const prodottiFiltrati = useMemo(() => {
    const q = prodottiQuery.trim().toLowerCase();
    const list = !q
      ? prodottiCatalog
      : prodottiCatalog.filter(
          (p) =>
            p.codice.toLowerCase().includes(q) ||
            p.nome.toLowerCase().includes(q)
        );
    return [...list].sort((a, b) => {
      const aSel = selectedIds.has(a.id) ? 0 : 1;
      const bSel = selectedIds.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.codice.localeCompare(b.codice);
    });
  }, [prodottiCatalog, prodottiQuery, selectedIds]);

  function toggleProdotto(prodottoId: string) {
    setProdottiLinks((prev) => {
      const existing = prev.find((l) => l.prodottoId === prodottoId);
      if (existing) {
        return prev.filter((l) => l.prodottoId !== prodottoId);
      }
      return [...prev, { prodottoId, obbligatoria: true }];
    });
  }

  function setObbligatoria(prodottoId: string, obbligatoria: boolean) {
    setProdottiLinks((prev) =>
      prev.map((l) =>
        l.prodottoId === prodottoId ? { ...l, obbligatoria } : l
      )
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!codiceCompleto || !titolo.trim()) {
      setFormError("Targa e titolo sono obbligatori.");
      return;
    }
    if (codiceDuplicato) {
      setFormError(`Targa già usata: ${codiceDuplicato.codice}`);
      return;
    }
    if (kgPerOra === "" || Number(kgPerOra) <= 0) {
      setFormError("Indica i kg medi per ora (> 0).");
      return;
    }
    if (oreGiorno === "" || Number(oreGiorno) <= 0) {
      setFormError("Indica le ore/giorno (> 0).");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        codice: codiceCompleto,
        titolo: titolo.trim(),
        spiegazione,
        kgPerOra: Number(kgPerOra),
        oreGiorno: Number(oreGiorno),
        incastrabileDuranteLavorazione: incastrabile,
        documentoStato: "approvato",
        prodottiLinks,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Salvataggio fallito.");
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  const content = (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-6"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {isEdit ? "Modifica attività" : "Nuova attività"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Targa con prefisso fisso <strong>{CODICE_ATTIVITA_PREFIX}</strong>{" "}
              (Attività).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Chiudi
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">
              Targa (corpo dopo {CODICE_ATTIVITA_PREFIX})
            </span>
            <div className="flex overflow-hidden rounded-lg border border-[var(--border)]">
              <span className="inline-flex items-center bg-slate-100 px-3 font-mono text-sm font-semibold">
                {CODICE_ATTIVITA_PREFIX}
              </span>
              <input
                value={codiceBody}
                onChange={(e) => {
                  setCodiceBody(sanitizeCodiceAttivitaBody(e.target.value));
                  setFormError(null);
                }}
                required
                spellCheck={false}
                placeholder="-TRi/DRa"
                className="min-w-0 flex-1 px-3 py-2 font-mono outline-none focus:bg-slate-50"
              />
            </div>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Completa:{" "}
              <span className="font-mono font-semibold">
                {codiceCompleto || "—"}
              </span>
              {codiceDuplicato ? (
                <span className="ml-2 text-red-600">già in uso</span>
              ) : null}
            </p>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Titolo</span>
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              required
              placeholder="Es. Triturazione interna Taglio Tisana"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium">Spiegazione</span>
            <textarea
              value={spiegazione}
              onChange={(e) => setSpiegazione(e.target.value)}
              rows={3}
              placeholder="Descrizione operativa dell’attività…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">
                Tempo/quantità media (kg/ora)
              </span>
              <ClearableNumberInput
                value={kgPerOra}
                onValueChange={setKgPerOra}
                min={0.001}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Ore/giorno (calcolo)</span>
              <ClearableNumberInput
                value={oreGiorno}
                onValueChange={setOreGiorno}
                min={0.1}
                max={24}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
          </div>

          <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <legend className="px-1 text-sm font-medium">
              Incastrabili durante lavorazione di più giorni
            </legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="incastrabile"
                checked={!incastrabile}
                onChange={() => setIncastrabile(false)}
              />
              No — giorni attività tutti dopo la lavorazione
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="incastrabile"
                checked={incastrabile}
                onChange={() => setIncastrabile(true)}
              />
              Sì — in parallelo alla lavorazione; in calendario resta il giorno
              (o i giorni) extra per l’ultimo quantitativo
            </label>
          </fieldset>

          <fieldset className="space-y-2 rounded-lg border border-[var(--border)] p-3">
            <legend className="px-1 text-sm font-medium">
              Prodotti Agrinsicilia collegati
            </legend>
            <p className="text-xs text-[var(--muted)]">
              Seleziona uno o più prodotti.{" "}
              <strong>Obbligatoria</strong> = già attiva nel calendario ordine;{" "}
              <strong>Facoltativa</strong> = presente ma spenta di default.
            </p>
            <input
              type="search"
              value={prodottiQuery}
              onChange={(e) => setProdottiQuery(e.target.value)}
              placeholder="Cerca per targa o nome…"
              className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
            {prodottiLoading ? (
              <p className="text-xs text-[var(--muted)]">Caricamento prodotti…</p>
            ) : prodottiCatalog.length === 0 ? (
              <p className="text-xs text-amber-800">
                Nessun prodotto in catalogo. Creane in Schede → Prodotti.
              </p>
            ) : (
              <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                {prodottiFiltrati.map((p) => {
                  const selected = selectedIds.has(p.id);
                  const link = prodottiLinks.find(
                    (l) => l.prodottoId === p.id
                  );
                  return (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-xs"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleProdotto(p.id)}
                        />
                        <span className="font-mono font-semibold">
                          {p.codice}
                        </span>
                        <span className="truncate text-slate-700">{p.nome}</span>
                        {p.isBio ? (
                          <span className="shrink-0 text-emerald-700">BIO</span>
                        ) : null}
                      </label>
                      {selected ? (
                        <label className="inline-flex items-center gap-1.5 text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={link?.obbligatoria ?? true}
                            onChange={(e) =>
                              setObbligatoria(p.id, e.target.checked)
                            }
                          />
                          Obbligatoria
                        </label>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="text-xs text-[var(--muted)]">
              Selezionati: <strong>{prodottiLinks.length}</strong>
            </p>
          </fieldset>

          {formError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-slate-50"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving || Boolean(codiceDuplicato)}
              className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
            >
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}
