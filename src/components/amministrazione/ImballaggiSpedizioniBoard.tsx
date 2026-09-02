"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FaCheck, FaPen, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import {
  createCorriereAction,
  createImballaggioVoceAction,
  listCorrieriAction,
  listImballaggiVociAction,
  softDeleteCorrieriBulkAction,
  softDeleteImballaggiVociBulkAction,
  updateCorriereAction,
  updateImballaggioVoceAction,
} from "@/app/actions/imballaggi-spedizioni";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";
import { ImballaggioVoceProdottiModal } from "@/components/amministrazione/ImballaggioVoceProdottiModal";
import { SoftDeleteConfirmModal } from "@/components/amministrazione/SoftDeleteConfirmModal";
import { InfoHint, LabelWithInfo } from "@/components/ui/InfoHint";
import {
  formatMisureImballaggio,
  IMBALLAGGIO_STADI,
  labelNomeCommercialeStadio,
  normalizeCiCodice,
  otherDualStadio,
  voceCollegaProdotti,
  type Corriere,
  type ImballaggioStadio,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";

type Tab = ImballaggioStadio | "corrieri";

type EditVoce = {
  id: string;
  codice: string;
  nome: string;
  nomeCommerciale: string;
  note: string;
  largoMm: number | "";
  profonditaMm: number | "";
  altezzaMm: number | "";
  capacitaLt: number | "";
  sortOrder: number | "";
  doppioRuolo: boolean;
};

type EditCorriere = {
  id: string;
  nome: string;
  note: string;
};

const INFO = {
  cerca: "Filtra l’elenco per nome, nome commerciale, codice o note della voce visibile in questo stadio.",
  codice:
    "Identificativo univoco nello stadio. Con doppio ruolo il codice diventa C&I-… (Confezione e isolamento) e la voce è duplicata nell’altro stadio.",
  nome: "Nome visibile in elenco e nel wizard ordini quando scegli l’imballaggio.",
  nomeCommerciale:
    "Nome da usare su documenti ed export (listini PDF/Excel). Se vuoto, in export si usa codice e nome interno.",
  largo: "Larghezza esterna in millimetri.",
  prof: "Profondità esterna in millimetri.",
  alt: "Altezza esterna in millimetri (lascia vuoto se non serve).",
  capLt: "Capacità in litri (bidoni, taniche). Lascia vuoto se usi solo le misure mm.",
  note: "Annotazioni interne per l’operatore. Non finiscono sul documento cliente.",
  doppio:
    "Se attivo, la voce è duplicata nell’altro stadio con lo stesso codice C&I- (Confezione e isolamento). Nome, nome commerciale, misure e prodotti restano allineati. Nel wizard una sola selezione.",
  prodotti:
    "Quanti prodotti Agrinsicilia sono collegati a questa voce, ciascuno con quantità max e unità (kg, lt, g, ml, pz).",
  ordine:
    "Posizione in elenco (sort). Il numero più basso sta più in alto. Non è un ordine cliente.",
  azioni: "Modifica, collega ai prodotti ed elimina. L’eliminazione chiede sempre conferma.",
  seleziona: "Spunta una o più righe per eliminarle insieme (sempre con conferma).",
  misure: "Dimensioni esterne largo × profondità × altezza in millimetri.",
  corriereNome: "Nome del corriere selezionabile nello step spedizione dell’ordine.",
  corriereNote: "Note operative sul corriere (tempi, vincoli, recapiti).",
} as const;

function numOrNull(v: number | ""): number | null {
  if (v === "" || !Number.isFinite(v) || v <= 0) return null;
  return v;
}

export function ImballaggiSpedizioniBoard() {
  const [tab, setTab] = useState<Tab>("movimentazione");
  const [voci, setVoci] = useState<ImballaggioVoce[]>([]);
  const [corrieri, setCorrieri] = useState<Corriere[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [nuovoNome, setNuovoNome] = useState("");
  const [nuovoNomeCommerciale, setNuovoNomeCommerciale] = useState("");
  const [nuovoCodice, setNuovoCodice] = useState("");
  const [nuovoNote, setNuovoNote] = useState("");
  const [nuovoLargo, setNuovoLargo] = useState<number | "">("");
  const [nuovoProf, setNuovoProf] = useState<number | "">("");
  const [nuovoAlt, setNuovoAlt] = useState<number | "">("");
  const [nuovoLt, setNuovoLt] = useState<number | "">("");
  const [nuovoDoppioRuolo, setNuovoDoppioRuolo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkVoce, setLinkVoce] = useState<ImballaggioVoce | null>(null);

  const [editVoce, setEditVoce] = useState<EditVoce | null>(null);
  const editVoceRef = useRef<EditVoce | null>(null);
  editVoceRef.current = editVoce;

  function patchEditVoce(patch: Partial<EditVoce>) {
    setEditVoce((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      editVoceRef.current = next;
      return next;
    });
  }
  const [editCorriere, setEditCorriere] = useState<EditCorriere | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "voce" | "corriere";
    ids: string[];
    confirmCode: string;
    entityLabel: string;
  } | null>(null);

  async function refresh() {
    setError(null);
    if (tab === "corrieri") {
      const res = await listCorrieriAction();
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setCorrieri(res.items);
    } else {
      const res = await listImballaggiVociAction(tab);
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setVoci(res.items);
    }
    setReady(true);
  }

  useEffect(() => {
    setReady(false);
    setQuery("");
    setNuovoNome("");
    setNuovoNomeCommerciale("");
    setNuovoCodice("");
    setNuovoNote("");
    setNuovoLargo("");
    setNuovoProf("");
    setNuovoAlt("");
    setNuovoLt("");
    setNuovoDoppioRuolo(false);
    setLinkVoce(null);
    setSelectedIds(new Set());
    setPendingDelete(null);
    setEditVoce(null);
    setEditCorriere(null);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const filteredVoci = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return voci;
    return voci.filter(
      (v) =>
        v.nome.toLowerCase().includes(q) ||
        v.nomeCommerciale.toLowerCase().includes(q) ||
        v.codice.toLowerCase().includes(q) ||
        v.note.toLowerCase().includes(q)
    );
  }, [voci, query]);

  const filteredCorrieri = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return corrieri;
    return corrieri.filter(
      (c) =>
        c.nome.toLowerCase().includes(q) || c.note.toLowerCase().includes(q)
    );
  }, [corrieri, query]);

  const visibleIds =
    tab === "corrieri"
      ? filteredCorrieri.map((c) => c.id)
      : filteredVoci.map((v) => v.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  function askDeleteVoci(ids: string[]) {
    if (!ids.length) return;
    if (ids.length === 1) {
      const v = voci.find((x) => x.id === ids[0]);
      setPendingDelete({
        kind: "voce",
        ids,
        confirmCode: v?.codice ?? "1 voce",
        entityLabel: "voce imballaggio",
      });
      return;
    }
    setPendingDelete({
      kind: "voce",
      ids,
      confirmCode: `${ids.length} voci`,
      entityLabel: "voci selezionate",
    });
  }

  function askDeleteCorrieri(ids: string[]) {
    if (!ids.length) return;
    if (ids.length === 1) {
      const c = corrieri.find((x) => x.id === ids[0]);
      setPendingDelete({
        kind: "corriere",
        ids,
        confirmCode: c?.nome ?? "1 corriere",
        entityLabel: "corriere",
      });
      return;
    }
    setPendingDelete({
      kind: "corriere",
      ids,
      confirmCode: `${ids.length} corrieri`,
      entityLabel: "corrieri selezionati",
    });
  }

  function startEditVoce(v: ImballaggioVoce) {
    setEditCorriere(null);
    const draft: EditVoce = {
      id: v.id,
      codice: v.codice,
      nome: v.nome,
      nomeCommerciale: v.nomeCommerciale,
      note: v.note,
      largoMm: v.largoMm ?? "",
      profonditaMm: v.profonditaMm ?? "",
      altezzaMm: v.altezzaMm ?? "",
      capacitaLt: v.capacitaLt ?? "",
      sortOrder: v.sortOrder,
      doppioRuolo: v.doppioRuolo,
    };
    editVoceRef.current = draft;
    setEditVoce(draft);
  }

  function startEditCorriere(c: Corriere) {
    setEditVoce(null);
    setEditCorriere({ id: c.id, nome: c.nome, note: c.note });
  }

  async function addVoce() {
    if (tab === "corrieri") return;
    if (!nuovoNome.trim() || !nuovoCodice.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createImballaggioVoceAction({
      stadio: tab,
      codice: nuovoCodice.trim(),
      nome: nuovoNome.trim(),
      nomeCommerciale: nuovoNomeCommerciale.trim(),
      note: nuovoNote.trim(),
      largoMm: numOrNull(nuovoLargo),
      profonditaMm: numOrNull(nuovoProf),
      altezzaMm: numOrNull(nuovoAlt),
      capacitaLt: numOrNull(nuovoLt),
      sortOrder: (voci[voci.length - 1]?.sortOrder ?? 0) + 10,
      doppioRuolo: tab !== "movimentazione" && nuovoDoppioRuolo,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setVoci((prev) => [...prev, res.item]);
    setNuovoNome("");
    setNuovoNomeCommerciale("");
    setNuovoCodice("");
    setNuovoNote("");
    setNuovoLargo("");
    setNuovoProf("");
    setNuovoAlt("");
    setNuovoLt("");
    setNuovoDoppioRuolo(false);
  }

  async function saveEditVoce() {
    const draft = editVoceRef.current;
    if (!draft || tab === "corrieri" || saving) return;
    if (!draft.nome.trim() || !draft.codice.trim()) {
      setError("Codice e nome sono obbligatori.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateImballaggioVoceAction(draft.id, {
      stadio: tab,
      codice: draft.codice.trim(),
      nome: draft.nome.trim(),
      nomeCommerciale: draft.nomeCommerciale.trim(),
      note: draft.note.trim(),
      largoMm: numOrNull(draft.largoMm),
      profonditaMm: numOrNull(draft.profonditaMm),
      altezzaMm: numOrNull(draft.altezzaMm),
      capacitaLt: numOrNull(draft.capacitaLt),
      sortOrder: numberOrZero(draft.sortOrder),
      doppioRuolo: tab !== "movimentazione" && draft.doppioRuolo,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setVoci((prev) =>
      prev.map((x) => (x.id === res.item.id ? res.item : x))
    );
    setEditVoce(null);
  }

  async function addCorriere() {
    if (!nuovoNome.trim() || saving) return;
    setSaving(true);
    setError(null);
    const res = await createCorriereAction({
      nome: nuovoNome.trim(),
      note: nuovoNote.trim(),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setCorrieri((prev) =>
      [...prev, res.item].sort((a, b) =>
        a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
      )
    );
    setNuovoNome("");
    setNuovoNote("");
  }

  async function saveEditCorriere() {
    if (!editCorriere || saving) return;
    if (!editCorriere.nome.trim()) {
      setError("Nome corriere obbligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateCorriereAction(editCorriere.id, {
      nome: editCorriere.nome.trim(),
      note: editCorriere.note.trim(),
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setCorrieri((prev) =>
      prev
        .map((x) => (x.id === res.item.id ? res.item : x))
        .sort((a, b) =>
          a.nome.localeCompare(b.nome, "it", { sensitivity: "base" })
        )
    );
    setEditCorriere(null);
  }

  const tabs: { id: Tab; label: string }[] = [
    ...IMBALLAGGIO_STADI.map((s) => ({ id: s.id as Tab, label: s.label })),
    { id: "corrieri", label: "Corrieri" },
  ];

  const stadioMeta = IMBALLAGGIO_STADI.find((s) => s.id === tab);
  const inputCls =
    "w-full rounded border border-[var(--border)] px-2 py-1.5 text-sm outline-none focus:border-[var(--primary)]";

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Catalogo imballaggi per stadio e anagrafica corrieri: creazione,
        modifica e soft delete (ISO 9001). Isolamento (e confezione a doppio
        ruolo) si collegano ai prodotti con max kg. Usato nel wizard ordini.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const meta = IMBALLAGGIO_STADI.find((s) => s.id === t.id);
          const tabInfo =
            t.id === "corrieri"
              ? "Anagrafica corrieri usata nello step spedizione dell’ordine. Puoi compilare il corriere dopo."
              : meta?.descrizione ?? "";
          return (
            <span key={t.id} className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  tab === t.id
                    ? "bg-[var(--primary)] text-white"
                    : "border border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
              <InfoHint title={t.label}>{tabInfo}</InfoHint>
            </span>
          );
        })}
      </div>

      {stadioMeta ? (
        <p className="text-sm text-slate-700">{stadioMeta.descrizione}</p>
      ) : (
        <p className="text-sm text-slate-700">
          Corrieri selezionabili in spedizione ordine (o «compilerò dopo»).
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            <LabelWithInfo label="Cerca" info={INFO.cerca} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            placeholder="Nome o codice…"
          />
        </label>
        {selectedIds.size > 0 ? (
          <button
            type="button"
            onClick={() =>
              tab === "corrieri"
                ? askDeleteCorrieri([...selectedIds])
                : askDeleteVoci([...selectedIds])
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <FaTrash size={12} />
            Elimina selezionati ({selectedIds.size})
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-3 text-sm font-medium">Aggiungi</p>
        <div className="flex flex-wrap items-end gap-2">
          {tab !== "corrieri" ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  <LabelWithInfo label="Codice" info={INFO.codice} />
                </span>
                <input
                  value={nuovoCodice}
                  onChange={(e) => setNuovoCodice(e.target.value)}
                  className="w-40 rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
                  placeholder={
                    nuovoDoppioRuolo
                      ? "C&I-…"
                      : tab === "isolamento"
                        ? "ISO-…"
                        : "CNF-…"
                  }
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  <LabelWithInfo label="Largo mm" info={INFO.largo} />
                </span>
                <ClearableNumberInput
                  min={0}
                  value={nuovoLargo}
                  onValueChange={setNuovoLargo}
                  className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  <LabelWithInfo label="Prof. mm" info={INFO.prof} />
                </span>
                <ClearableNumberInput
                  min={0}
                  value={nuovoProf}
                  onValueChange={setNuovoProf}
                  className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  <LabelWithInfo label="Alt. mm" info={INFO.alt} />
                </span>
                <ClearableNumberInput
                  min={0}
                  value={nuovoAlt}
                  onValueChange={setNuovoAlt}
                  className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  <LabelWithInfo label="Cap. lt" info={INFO.capLt} />
                </span>
                <ClearableNumberInput
                  min={0}
                  value={nuovoLt}
                  onValueChange={setNuovoLt}
                  className="w-24 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
            </>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">
              <LabelWithInfo
                label="Nome"
                info={tab === "corrieri" ? INFO.corriereNome : INFO.nome}
              />
            </span>
            <input
              value={nuovoNome}
              onChange={(e) => setNuovoNome(e.target.value)}
              className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              placeholder={tab === "corrieri" ? "Nome corriere" : "Descrizione"}
            />
          </label>
          {tab !== "corrieri" ? (
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted)]">
                <LabelWithInfo
                  label={labelNomeCommercialeStadio(tab)}
                  info={INFO.nomeCommerciale}
                />
              </span>
              <input
                value={nuovoNomeCommerciale}
                onChange={(e) => setNuovoNomeCommerciale(e.target.value)}
                className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
                placeholder="Per documenti ed export"
                maxLength={200}
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">
              <LabelWithInfo
                label="Note"
                info={tab === "corrieri" ? INFO.corriereNote : INFO.note}
              />
            </span>
            <input
              value={nuovoNote}
              onChange={(e) => setNuovoNote(e.target.value)}
              className="w-48 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
          {tab === "isolamento" || tab === "confezione" ? (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={nuovoDoppioRuolo}
                onChange={(e) => {
                  const on = e.target.checked;
                  setNuovoDoppioRuolo(on);
                  if (on && nuovoCodice.trim()) {
                    setNuovoCodice(normalizeCiCodice(nuovoCodice));
                  }
                }}
              />
              {tab === "isolamento"
                ? "Fa anche da confezionamento"
                : "Fa anche da isolamento"}
              <InfoHint title="Doppio ruolo">{INFO.doppio}</InfoHint>
            </label>
          ) : null}
          <button
            type="button"
            disabled={saving || !nuovoNome.trim()}
            onClick={() =>
              void (tab === "corrieri" ? addCorriere() : addVoce())
            }
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-50"
          >
            <FaPlus size={12} />
            Salva
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento…</p>
      ) : tab === "corrieri" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Seleziona tutti i corrieri visibili"
                    />
                    <InfoHint title="Selezione">{INFO.seleziona}</InfoHint>
                  </span>
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Nome" info={INFO.corriereNome} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Note" info={INFO.corriereNote} />
                </th>
                <th className="px-3 py-2 text-right">
                  <LabelWithInfo label="Azioni" info={INFO.azioni} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCorrieri.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-[var(--muted)]">
                    Nessun corriere. Aggiungine uno qui sopra.
                  </td>
                </tr>
              ) : (
                filteredCorrieri.map((c) => {
                  const editing = editCorriere?.id === c.id;
                  return (
                    <tr key={c.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelected(c.id)}
                          aria-label={`Seleziona ${c.nome}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editCorriere.nome}
                            onChange={(e) =>
                              setEditCorriere({
                                ...editCorriere,
                                nome: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        ) : (
                          <span className="font-medium">{c.nome}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editCorriere.note}
                            onChange={(e) =>
                              setEditCorriere({
                                ...editCorriere,
                                note: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        ) : (
                          <span className="text-[var(--muted)]">
                            {c.note || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                                aria-label="Conferma modifica"
                                onClick={() => void saveEditCorriere()}
                              >
                                <FaCheck size={12} />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                                aria-label="Annulla"
                                onClick={() => setEditCorriere(null)}
                              >
                                <FaXmark size={12} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-700 hover:bg-slate-100"
                              aria-label="Modifica"
                              onClick={() => startEditCorriere(c)}
                            >
                              <FaPen size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            aria-label="Elimina"
                            onClick={() => askDeleteCorrieri([c.id])}
                          >
                            <FaTrash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <span className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Seleziona tutte le voci visibili"
                    />
                    <InfoHint title="Selezione">{INFO.seleziona}</InfoHint>
                  </span>
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Codice" info={INFO.codice} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Nome" info={INFO.nome} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo
                    label={labelNomeCommercialeStadio(tab)}
                    info={INFO.nomeCommerciale}
                  />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="L×P×H mm" info={INFO.misure} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="lt" info={INFO.capLt} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Note" info={INFO.note} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Doppio" info={INFO.doppio} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo label="Prodotti" info={INFO.prodotti} />
                </th>
                <th className="px-3 py-2">
                  <LabelWithInfo
                    label="Ordine"
                    title="Ordine in elenco"
                    info={INFO.ordine}
                  />
                </th>
                <th className="px-3 py-2 text-right">
                  <LabelWithInfo label="Azioni" info={INFO.azioni} />
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredVoci.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-[var(--muted)]">
                    Nessuna voce in questo stadio.
                  </td>
                </tr>
              ) : (
                filteredVoci.map((v) => {
                  const editing = editVoce?.id === v.id;
                  return (
                    <tr key={v.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(v.id)}
                          onChange={() => toggleSelected(v.id)}
                          aria-label={`Seleziona ${v.codice}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.codice}
                            onChange={(e) =>
                              patchEditVoce({ codice: e.target.value })
                            }
                            className={`${inputCls} font-mono text-xs`}
                          />
                        ) : (
                          <span className="font-mono text-xs">
                            {v.codice}
                            {v.doppioRuolo ? (
                              <span className="ml-1 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-sans font-semibold text-emerald-800">
                                C&I
                              </span>
                            ) : null}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.nome}
                            onChange={(e) =>
                              patchEditVoce({ nome: e.target.value })
                            }
                            className={inputCls}
                          />
                        ) : (
                          <span className="font-medium">{v.nome}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.nomeCommerciale}
                            onChange={(e) =>
                              patchEditVoce({
                                nomeCommerciale: e.target.value,
                              })
                            }
                            className={inputCls}
                            maxLength={200}
                            placeholder={labelNomeCommercialeStadio(tab)}
                          />
                        ) : (
                          <span className="text-[var(--muted)]">
                            {v.nomeCommerciale || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <div className="flex gap-1">
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.largoMm}
                              onValueChange={(n) =>
                                patchEditVoce({ largoMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Largo mm"
                            />
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.profonditaMm}
                              onValueChange={(n) =>
                                patchEditVoce({ profonditaMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Profondità mm"
                            />
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.altezzaMm}
                              onValueChange={(n) =>
                                patchEditVoce({ altezzaMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Altezza mm"
                            />
                          </div>
                        ) : (
                          <span className="tabular-nums text-[var(--muted)]">
                            {formatMisureImballaggio(v)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <ClearableNumberInput
                            min={0}
                            value={editVoce.capacitaLt}
                            onValueChange={(n) =>
                              patchEditVoce({ capacitaLt: n })
                            }
                            className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                          />
                        ) : (
                          <span className="tabular-nums text-[var(--muted)]">
                            {v.capacitaLt != null ? `${v.capacitaLt}` : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.note}
                            onChange={(e) =>
                              patchEditVoce({ note: e.target.value })
                            }
                            className={inputCls}
                          />
                        ) : (
                          <span className="text-[var(--muted)]">
                            {v.note || "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {tab === "movimentazione" ? (
                          <span className="text-[var(--muted)]">—</span>
                        ) : editing ? (
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={editVoce.doppioRuolo}
                              onChange={(e) =>
                                patchEditVoce({
                                  doppioRuolo: e.target.checked,
                                  ...(e.target.checked
                                    ? {
                                        codice: normalizeCiCodice(
                                          editVoce.codice
                                        ),
                                      }
                                    : {}),
                                })
                              }
                            />
                            {tab === "isolamento"
                              ? "Anche confezione"
                              : "Anche isolamento"}
                            <InfoHint title="Doppio ruolo">{INFO.doppio}</InfoHint>
                          </label>
                        ) : v.doppioRuolo ? (
                          <span className="text-xs font-medium text-emerald-800">
                            C&I
                            {otherDualStadio(v.stadio)
                              ? ` · anche in ${
                                  otherDualStadio(v.stadio) === "isolamento"
                                    ? "isolamento"
                                    : "confezione"
                                }`
                              : ""}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">No</span>
                        )}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                        {voceCollegaProdotti(v) ? v.prodotti.length : "—"}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <ClearableNumberInput
                            min={0}
                            value={editVoce.sortOrder}
                            onValueChange={(n) =>
                              patchEditVoce({ sortOrder: n })
                            }
                            className="w-14 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                          />
                        ) : (
                          <span className="tabular-nums text-[var(--muted)]">
                            {v.sortOrder}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                                aria-label="Conferma modifica"
                                onClick={() => void saveEditVoce()}
                              >
                                <FaCheck size={12} />
                              </button>
                              <button
                                type="button"
                                className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
                                aria-label="Annulla"
                                onClick={() => setEditVoce(null)}
                              >
                                <FaXmark size={12} />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="rounded p-1.5 text-slate-700 hover:bg-slate-100"
                              aria-label="Modifica"
                              onClick={() => startEditVoce(v)}
                            >
                              <FaPen size={12} />
                            </button>
                          )}
                          {voceCollegaProdotti(v) ? (
                            <button
                              type="button"
                              className="rounded px-1.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                              onClick={() => setLinkVoce(v)}
                            >
                              Collega a prodotti
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            aria-label="Elimina"
                            onClick={() => askDeleteVoci([v.id])}
                          >
                            <FaTrash size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {linkVoce ? (
        <ImballaggioVoceProdottiModal
          voce={linkVoce}
          onClose={() => setLinkVoce(null)}
          onSaved={(item) => {
            setVoci((prev) =>
              prev.map((x) => (x.id === item.id ? item : x))
            );
            setLinkVoce(null);
          }}
        />
      ) : null}

      {pendingDelete ? (
        <SoftDeleteConfirmModal
          entityLabel={pendingDelete.entityLabel}
          confirmCode={pendingDelete.confirmCode}
          onClose={() => setPendingDelete(null)}
          onConfirm={async (confermaTestuale) => {
            const res =
              pendingDelete.kind === "corriere"
                ? await softDeleteCorrieriBulkAction({
                    ids: pendingDelete.ids,
                    confermaTestuale,
                    confirmCode: pendingDelete.confirmCode,
                  })
                : await softDeleteImballaggiVociBulkAction({
                    ids: pendingDelete.ids,
                    confermaTestuale,
                    confirmCode: pendingDelete.confirmCode,
                  });
            if (!res.success) throw new Error(res.error);
            const gone = new Set(pendingDelete.ids);
            if (pendingDelete.kind === "corriere") {
              setCorrieri((prev) => prev.filter((x) => !gone.has(x.id)));
              if (editCorriere && gone.has(editCorriere.id)) {
                setEditCorriere(null);
              }
            } else {
              setVoci((prev) => prev.filter((x) => !gone.has(x.id)));
              if (editVoce && gone.has(editVoce.id)) setEditVoce(null);
            }
            setSelectedIds((prev) => {
              const next = new Set(prev);
              for (const id of gone) next.delete(id);
              return next;
            });
            setPendingDelete(null);
          }}
        />
      ) : null}
    </div>
  );
}
