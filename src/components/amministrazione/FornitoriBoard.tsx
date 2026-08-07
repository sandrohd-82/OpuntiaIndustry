"use client";

import { useEffect, useState } from "react";
import { FaChevronDown, FaChevronUp, FaPen, FaPlus } from "react-icons/fa6";
import { listMateriePrimeAction } from "@/app/actions/materie-prime";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { FornitoreFormModal } from "@/components/amministrazione/FornitoreFormModal";
import { MateriaPrimaTagList } from "@/components/amministrazione/MateriaPrimaTagList";
import { useFornitori } from "@/hooks/useFornitori";
import {
  formatSedeBreve,
  type Fornitore,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";

function SedeDetail({ title, sede }: { title: string; sede: SedeFornitore }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {title}
      </p>
      <p className="mt-1 text-sm">
        {sede.indirizzo || "—"}
        <br />
        {[sede.cap, sede.citta, sede.provincia].filter(Boolean).join(" ")}
        {sede.nazione ? ` — ${sede.nazione}` : ""}
      </p>
    </div>
  );
}

function FornitoreRow({
  fornitore,
  onEdit,
  materie,
}: {
  fornitore: Fornitore;
  onEdit: (fornitore: Fornitore) => void;
  materie: MateriaPrima[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3">
          <CodiceTargaBadge code={fornitore.codiceTarga} />
        </td>
        <td className="px-4 py-3 font-semibold">{fornitore.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">{fornitore.partitaIva}</td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeMagazzino)}
        </td>
        <td className="max-w-[240px] px-4 py-3">
          <MateriaPrimaTagList
            codes={fornitore.prodottiAcquistati}
            materie={materie}
            bioCertificato={fornitore.bioCertificato}
            bioCodice={fornitore.bioCodice}
            emptyLabel="—"
          />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(fornitore)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
            >
              <FaPen size={11} />
              Modifica
            </button>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--muted)] hover:bg-slate-50"
              aria-expanded={open}
            >
              {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
              Dettaglio
            </button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={7} className="px-4 py-4">
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() => onEdit(fornitore)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPen size={11} />
                Modifica scheda
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={fornitore.sedeAmministrativa}
              />
              <SedeDetail
                title="Sede ritiro"
                sede={fornitore.sedeMagazzino}
              />
              <div className="sm:col-span-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Fornitore di
                </p>
                <MateriaPrimaTagList
                  codes={fornitore.prodottiAcquistati}
                  materie={materie}
                  bioCertificato={fornitore.bioCertificato}
                  bioCodice={fornitore.bioCodice}
                  emptyLabel="Nessuno"
                />
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function FornitoriBoard() {
  const { fornitori, ready, error, addFornitore, updateFornitore } =
    useFornitori();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Fornitore | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [materie, setMaterie] = useState<MateriaPrima[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await listMateriePrimeAction();
      if (cancelled || !result.success) return;
      setMaterie(result.materie);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento fornitori…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco fornitori registrati. Ogni scheda è modificabile in ogni sua
          parte dopo il salvataggio.
        </p>
        <button
          type="button"
          onClick={() => {
            setSaveError(null);
            setCreating(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo fornitore
        </button>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {fornitori.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun fornitore registrato</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo fornitore per iniziare.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo fornitore
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Targa</th>
                <th className="px-4 py-3 font-medium">R. Sociale</th>
                <th className="px-4 py-3 font-medium">P. IVA</th>
                <th className="px-4 py-3 font-medium">Sede Amm.</th>
                <th className="px-4 py-3 font-medium">Sede ritiro</th>
                <th className="px-4 py-3 font-medium">Fornitore di</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {fornitori.map((fornitore) => (
                <FornitoreRow
                  key={fornitore.id}
                  fornitore={fornitore}
                  materie={materie}
                  onEdit={(item) => {
                    setSaveError(null);
                    setEditing(item);
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <FornitoreFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addFornitore(values);
            if (created) {
              setSaveError(null);
              setCreating(false);
            } else {
              setSaveError("Salvataggio non riuscito. Riprova.");
            }
          }}
        />
      )}

      {editing && (
        <FornitoreFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const updated = await updateFornitore(editing.id, values);
            if (updated) {
              setSaveError(null);
              setEditing(null);
            } else {
              setSaveError("Aggiornamento non riuscito. Controlla i dati e riprova.");
            }
          }}
        />
      )}
    </div>
  );
}
