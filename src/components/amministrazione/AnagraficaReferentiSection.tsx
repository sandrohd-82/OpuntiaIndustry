"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { FaBook, FaPlus, FaTrash, FaUser, FaUserPlus } from "react-icons/fa6";
import {
  linkEntityReferenteAction,
  listEntityReferentiAction,
  listRubricaContattiAction,
  unlinkEntityReferenteAction,
  type EntityReferentiTipo,
} from "@/app/actions/rubrica";
import { CanaleReadonlyActions } from "@/components/amministrazione/CanaleAttenzioneControls";
import { AnagraficaSchedaSection } from "@/components/amministrazione/AnagraficaSchedaSection";
import { RubricaContattoFormModal } from "@/components/amministrazione/RubricaContattoFormModal";
import {
  displayContattoName,
  type RubricaAziendaTipo,
  type RubricaContatto,
} from "@/lib/rubrica/types";

export function AnagraficaReferentiSection({
  tipo,
  entityId,
  entityLabel,
  canEdit,
}: {
  tipo: EntityReferentiTipo;
  entityId: string;
  entityLabel: string;
  canEdit: boolean;
}) {
  const [items, setItems] = useState<RubricaContatto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [catalog, setCatalog] = useState<RubricaContatto[]>([]);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const aziendaTipo: RubricaAziendaTipo = tipo;

  const reload = useCallback(() => {
    setLoading(true);
    void listEntityReferentiAction({ tipo, entityId }).then((res) => {
      setLoading(false);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }, [tipo, entityId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!showPick) return;
    startTransition(async () => {
      const res = await listRubricaContattiAction({
        query,
        preferAziendaTipo: tipo,
        preferAziendaId: entityId,
      });
      if (res.success) setCatalog(res.items);
    });
  }, [showPick, query, tipo, entityId]);

  function collega(contatto: RubricaContatto) {
    setError(null);
    startTransition(async () => {
      const res = await linkEntityReferenteAction({
        tipo,
        entityId,
        entityLabel,
        contattoId: contatto.id,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setShowPick(false);
      setShowCreate(false);
      setQuery("");
      reload();
    });
  }

  function scollega(contattoId: string) {
    setError(null);
    startTransition(async () => {
      const res = await unlinkEntityReferenteAction({
        tipo,
        entityId,
        contattoId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      reload();
    });
  }

  const linkedIds = new Set(items.map((r) => r.id));
  const available = catalog.filter((c) => !linkedIds.has(c.id));

  return (
    <AnagraficaSchedaSection
      title="Referenti"
      tone="referenti"
      actions={
        canEdit ? (
          <>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-cyan-950 shadow-sm ring-1 ring-cyan-300/80 hover:bg-white"
              title="Aggiungi o collega referente"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
            >
              <FaPlus size={10} />
              <FaUser size={13} />
            </button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-20 cursor-default"
                  aria-label="Chiudi menu referenti"
                  onClick={() => setMenuOpen(false)}
                />
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-cyan-200 bg-white py-1 text-left shadow-lg"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowPick(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-cyan-50"
                >
                  <FaBook size={12} className="text-cyan-800" />
                  Collega da rubrica
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowCreate(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-800 hover:bg-cyan-50"
                >
                  <FaUserPlus size={12} className="text-cyan-800" />
                  Crea nuovo referente
                </button>
              </div>
              </>
            ) : null}
          </>
        ) : null
      }
    >
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {loading ? (
        <p className="text-sm text-[var(--muted)]">Caricamento referenti…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          {canEdit
            ? "Nessun referente. Usa + omino per crearne uno o collegarlo dalla rubrica."
            : "Nessun referente"}
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cyan-100 bg-white px-3 py-2 text-sm"
            >
              <span>
                {displayContattoName(r)}
                {r.mansione ? ` · ${r.mansione}` : ""}
                {r.telefono ? ` · ${r.telefono}` : ""}
                {r.email ? ` · ${r.email}` : ""}
              </span>
              <span className="inline-flex items-center gap-2">
                <CanaleReadonlyActions email={r.email} telefono={r.telefono} />
                {canEdit ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => scollega(r.id)}
                    className="text-[var(--muted)] hover:text-red-600 disabled:opacity-50"
                    aria-label={`Scollega ${displayContattoName(r)}`}
                    title="Scollega da questa anagrafica"
                  >
                    <FaTrash size={12} />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {showPick ? (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 py-10">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl"
          >
            <h3 className="font-semibold">Collega referente dalla rubrica</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Cerca un contatto già creato e collegalo a {entityLabel}.
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cerca nome, telefono, mail…"
              className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              autoFocus
            />
            <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
              {available.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => collega(c)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    <span className="font-medium">
                      {displayContattoName(c)}
                      {c.consigliato ? (
                        <span className="ml-1.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                          Consigliato
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-xs text-[var(--muted)]">
                      {[c.telefono, c.email, c.aziendaLabel, c.mansione]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </button>
                </li>
              ))}
              {available.length === 0 && !pending ? (
                <li className="py-4 text-center text-sm text-[var(--muted)]">
                  Nessun contatto disponibile. Creane uno nuovo.
                </li>
              ) : null}
            </ul>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPick(false);
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 px-3 py-1.5 text-sm font-medium text-cyan-900 hover:bg-cyan-50"
              >
                <FaUserPlus size={12} />
                Crea nuovo
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPick(false);
                  setQuery("");
                }}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <RubricaContattoFormModal
          elevated
          lockToThisAzienda
          defaultAziendaTipo={aziendaTipo}
          defaultAziendaLabel={entityLabel}
          defaultAziendaId={entityId}
          onClose={() => setShowCreate(false)}
          onCreated={(item) => collega(item)}
        />
      ) : null}
    </AnagraficaSchedaSection>
  );
}
