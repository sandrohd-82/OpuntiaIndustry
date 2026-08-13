"use client";

import { useEffect, useMemo, useState } from "react";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  createCorriereAction,
  createImballaggioVoceAction,
  listCorrieriAction,
  listImballaggiVociAction,
  softDeleteCorriereAction,
  softDeleteImballaggioVoceAction,
} from "@/app/actions/imballaggi-spedizioni";
import {
  formatMisureImballaggio,
  IMBALLAGGIO_STADI,
  type Corriere,
  type ImballaggioStadio,
  type ImballaggioVoce,
} from "@/lib/amministrazione/imballaggi-spedizioni";

type Tab = ImballaggioStadio | "corrieri";

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
  const [saving, setSaving] = useState(false);

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

  const tabs: { id: Tab; label: string }[] = [
    ...IMBALLAGGIO_STADI.map((s) => ({ id: s.id as Tab, label: s.label })),
    { id: "corrieri", label: "Corrieri" },
  ];

  const stadioMeta = IMBALLAGGIO_STADI.find((s) => s.id === tab);

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Catalogo imballaggi per stadio e anagrafica corrieri. Usato nel wizard
        ordini (spedizione e confezionamento). Soft delete ISO 9001.
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
            <label className="block text-sm">
              <span className="mb-1 block text-xs text-[var(--muted)]">Codice</span>
              <input
                value={nuovoCodice}
                onChange={(e) => setNuovoCodice(e.target.value)}
                className="w-44 rounded-lg border border-[var(--border)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--primary)]"
                placeholder="CNF-…"
              />
            </label>
          ) : null}
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Nome</span>
            <input
              value={nuovoNome}
              onChange={(e) => setNuovoNome(e.target.value)}
              className="w-64 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
              placeholder={tab === "corrieri" ? "Nome corriere" : "Descrizione"}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-[var(--muted)]">Note</span>
            <input
              value={nuovoNote}
              onChange={(e) => setNuovoNote(e.target.value)}
              className="w-56 rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
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
                <th className="px-3 py-2" />
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
                filteredCorrieri.map((c) => (
                  <tr key={c.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-medium">{c.nome}</td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {c.note || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        aria-label="Elimina"
                        onClick={async () => {
                          const res = await softDeleteCorriereAction(c.id);
                          if (!res.success) setError(res.error);
                          else
                            setCorrieri((prev) =>
                              prev.filter((x) => x.id !== c.id)
                            );
                        }}
                      >
                        <FaTrash size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2">Codice</th>
                <th className="px-3 py-2">Nome</th>
                <th className="px-3 py-2">Misure</th>
                <th className="px-3 py-2">Note</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filteredVoci.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-[var(--muted)]">
                    Nessuna voce in questo stadio.
                  </td>
                </tr>
              ) : (
                filteredVoci.map((v) => (
                  <tr key={v.id} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 font-mono text-xs">{v.codice}</td>
                    <td className="px-3 py-2 font-medium">{v.nome}</td>
                    <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                      {formatMisureImballaggio(v)}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {v.note || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        aria-label="Elimina"
                        onClick={async () => {
                          const res = await softDeleteImballaggioVoceAction(v.id);
                          if (!res.success) setError(res.error);
                          else setVoci((prev) => prev.filter((x) => x.id !== v.id));
                        }}
                      >
                        <FaTrash size={12} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
