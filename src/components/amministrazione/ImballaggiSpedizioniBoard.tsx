"use client";

import { useEffect, useMemo, useState } from "react";
import { FaCheck, FaPen, FaPlus, FaTrash, FaXmark } from "react-icons/fa6";
import {
  createCorriereAction,
  createImballaggioVoceAction,
  listCorrieriAction,
  listImballaggiVociAction,
  softDeleteCorriereAction,
  softDeleteImballaggioVoceAction,
  updateCorriereAction,
  updateImballaggioVoceAction,
} from "@/app/actions/imballaggi-spedizioni";
import {
  ClearableNumberInput,
  numberOrZero,
} from "@/components/ui/ClearableNumberInput";
import {
  formatMisureImballaggio,
  IMBALLAGGIO_STADI,
  type Corriere,
  type ImballaggioStadio,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";

type Tab = ImballaggioStadio | "corrieri";

type EditVoce = {
  id: string;
  codice: string;
  nome: string;
  note: string;
  largoMm: number | "";
  profonditaMm: number | "";
  altezzaMm: number | "";
  capacitaLt: number | "";
  sortOrder: number | "";
};

type EditCorriere = {
  id: string;
  nome: string;
  note: string;
};

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
  const [nuovoCodice, setNuovoCodice] = useState("");
  const [nuovoNote, setNuovoNote] = useState("");
  const [nuovoLargo, setNuovoLargo] = useState<number | "">("");
  const [nuovoProf, setNuovoProf] = useState<number | "">("");
  const [nuovoAlt, setNuovoAlt] = useState<number | "">("");
  const [nuovoLt, setNuovoLt] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const [editVoce, setEditVoce] = useState<EditVoce | null>(null);
  const [editCorriere, setEditCorriere] = useState<EditCorriere | null>(null);

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
    setNuovoCodice("");
    setNuovoNote("");
    setNuovoLargo("");
    setNuovoProf("");
    setNuovoAlt("");
    setNuovoLt("");
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

  function startEditVoce(v: ImballaggioVoce) {
    setEditCorriere(null);
    setEditVoce({
      id: v.id,
      codice: v.codice,
      nome: v.nome,
      note: v.note,
      largoMm: v.largoMm ?? "",
      profonditaMm: v.profonditaMm ?? "",
      altezzaMm: v.altezzaMm ?? "",
      capacitaLt: v.capacitaLt ?? "",
      sortOrder: v.sortOrder,
    });
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
      note: nuovoNote.trim(),
      largoMm: numOrNull(nuovoLargo),
      profonditaMm: numOrNull(nuovoProf),
      altezzaMm: numOrNull(nuovoAlt),
      capacitaLt: numOrNull(nuovoLt),
      sortOrder: (voci[voci.length - 1]?.sortOrder ?? 0) + 10,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setVoci((prev) => [...prev, res.item]);
    setNuovoNome("");
    setNuovoCodice("");
    setNuovoNote("");
    setNuovoLargo("");
    setNuovoProf("");
    setNuovoAlt("");
    setNuovoLt("");
  }

  async function saveEditVoce() {
    if (!editVoce || tab === "corrieri" || saving) return;
    if (!editVoce.nome.trim() || !editVoce.codice.trim()) {
      setError("Codice e nome sono obbligatori.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await updateImballaggioVoceAction(editVoce.id, {
      stadio: tab,
      codice: editVoce.codice.trim(),
      nome: editVoce.nome.trim(),
      note: editVoce.note.trim(),
      largoMm: numOrNull(editVoce.largoMm),
      profonditaMm: numOrNull(editVoce.profonditaMm),
      altezzaMm: numOrNull(editVoce.altezzaMm),
      capacitaLt: numOrNull(editVoce.capacitaLt),
      sortOrder: numberOrZero(editVoce.sortOrder),
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
        modifica e soft delete (ISO 9001). Usato nel wizard ordini.
      </p>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
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
        ))}
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
            Cerca
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            placeholder="Nome o codice…"
          />
        </label>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="mb-3 text-sm font-medium">Aggiungi</p>
        <div className="flex flex-wrap items-end gap-2">
          {tab !== "corrieri" ? (
            <>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  Codice
                </span>
                <input
                  value={nuovoCodice}
                  onChange={(e) => setNuovoCodice(e.target.value)}
                  className="w-40 rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
                  placeholder="CNF-…"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs text-[var(--muted)]">
                  Largo mm
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
                  Prof. mm
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
                  Alt. mm
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
                  Cap. lt
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
            <span className="mb-1 block text-xs text-[var(--muted)]">Nome</span>
            <input
              value={nuovoNome}
              onChange={(e) => setNuovoNome(e.target.value)}
              className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              placeholder={tab === "corrieri" ? "Nome corriere" : "Descrizione"}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Note</span>
            <input
              value={nuovoNote}
              onChange={(e) => setNuovoNote(e.target.value)}
              className="w-48 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
            />
          </label>
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
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredCorrieri.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-[var(--muted)]">
                    Nessun corriere. Aggiungine uno qui sopra.
                  </td>
                </tr>
              ) : (
                filteredCorrieri.map((c) => {
                  const editing = editCorriere?.id === c.id;
                  return (
                    <tr key={c.id} className="border-t border-[var(--border)]">
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
                            onClick={async () => {
                              const res = await softDeleteCorriereAction(c.id);
                              if (!res.success) setError(res.error);
                              else {
                                setCorrieri((prev) =>
                                  prev.filter((x) => x.id !== c.id)
                                );
                                if (editCorriere?.id === c.id)
                                  setEditCorriere(null);
                              }
                            }}
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
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Codice</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">L×P×H mm</th>
                <th className="px-3 py-2">lt</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2">Ord.</th>
                <th className="px-3 py-2 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredVoci.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-[var(--muted)]">
                    Nessuna voce in questo stadio.
                  </td>
                </tr>
              ) : (
                filteredVoci.map((v) => {
                  const editing = editVoce?.id === v.id;
                  return (
                    <tr key={v.id} className="border-t border-[var(--border)]">
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.codice}
                            onChange={(e) =>
                              setEditVoce({
                                ...editVoce,
                                codice: e.target.value,
                              })
                            }
                            className={`${inputCls} font-mono text-xs`}
                          />
                        ) : (
                          <span className="font-mono text-xs">{v.codice}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <input
                            value={editVoce.nome}
                            onChange={(e) =>
                              setEditVoce({
                                ...editVoce,
                                nome: e.target.value,
                              })
                            }
                            className={inputCls}
                          />
                        ) : (
                          <span className="font-medium">{v.nome}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <div className="flex gap-1">
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.largoMm}
                              onValueChange={(n) =>
                                setEditVoce({ ...editVoce, largoMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Largo mm"
                            />
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.profonditaMm}
                              onValueChange={(n) =>
                                setEditVoce({ ...editVoce, profonditaMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Profondità mm"
                            />
                            <ClearableNumberInput
                              min={0}
                              value={editVoce.altezzaMm}
                              onValueChange={(n) =>
                                setEditVoce({ ...editVoce, altezzaMm: n })
                              }
                              className="w-16 rounded border border-[var(--border)] px-1.5 py-1 text-xs"
                              title="Altezza mm"
                            />
                          </div>
                        ) : (
                          <span className="tabular-nums text-[var(--muted)]">
                            {formatMisureImballaggio(v).includes("lt")
                              ? "—"
                              : formatMisureImballaggio(v)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {editing ? (
                          <ClearableNumberInput
                            min={0}
                            value={editVoce.capacitaLt}
                            onValueChange={(n) =>
                              setEditVoce({ ...editVoce, capacitaLt: n })
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
                              setEditVoce({
                                ...editVoce,
                                note: e.target.value,
                              })
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
                        {editing ? (
                          <ClearableNumberInput
                            min={0}
                            value={editVoce.sortOrder}
                            onValueChange={(n) =>
                              setEditVoce({ ...editVoce, sortOrder: n })
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
                          <button
                            type="button"
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            aria-label="Elimina"
                            onClick={async () => {
                              const res = await softDeleteImballaggioVoceAction(
                                v.id
                              );
                              if (!res.success) setError(res.error);
                              else {
                                setVoci((prev) =>
                                  prev.filter((x) => x.id !== v.id)
                                );
                                if (editVoce?.id === v.id) setEditVoce(null);
                              }
                            }}
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
    </div>
  );
}
