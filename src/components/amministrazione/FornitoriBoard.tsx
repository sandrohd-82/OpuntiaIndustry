"use client";

import { useState } from "react";
import { FaChevronDown, FaChevronUp, FaPlus } from "react-icons/fa6";
import { NuovoFornitoreModal } from "@/components/amministrazione/NuovoFornitoreModal";
import { useFornitori } from "@/hooks/useFornitori";
import {
  formatSedeBreve,
  type Fornitore,
  type SedeFornitore,
} from "@/lib/amministrazione/fornitori";

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

function FornitoreRow({ fornitore }: { fornitore: Fornitore }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3 font-semibold">{fornitore.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">{fornitore.partitaIva}</td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(fornitore.sedeMagazzino)}
        </td>
        <td className="px-4 py-3 tabular-nums">
          {fornitore.prodottiAcquistati.length}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--primary)] hover:bg-slate-50"
            aria-expanded={open}
          >
            {open ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
            Dettaglio
          </button>
        </td>
      </tr>
      {open && (
        <tr className="border-t border-[var(--border)] bg-slate-50/70">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={fornitore.sedeAmministrativa}
              />
              <SedeDetail
                title="Sede Magazzino"
                sede={fornitore.sedeMagazzino}
              />
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Prodotti Acquistati
                </p>
                {fornitore.prodottiAcquistati.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuno</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {fornitore.prodottiAcquistati.map((p) => (
                      <li
                        key={p}
                        className="rounded-md bg-white px-2.5 py-1 text-sm ring-1 ring-[var(--border)]"
                      >
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function FornitoriBoard() {
  const { fornitori, ready, addFornitore } = useFornitori();
  const [creating, setCreating] = useState(false);

  if (!ready) {
    return (
      <p className="text-sm text-[var(--muted)]">Caricamento fornitori…</p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco fornitori registrati. Puoi inserirne altri in qualsiasi momento.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo fornitore
        </button>
      </div>

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
                <th className="px-4 py-3 font-medium">R. Sociale</th>
                <th className="px-4 py-3 font-medium">P. IVA</th>
                <th className="px-4 py-3 font-medium">Sede Amm.</th>
                <th className="px-4 py-3 font-medium">Sede Mag.</th>
                <th className="px-4 py-3 font-medium">Prodotti</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {fornitori.map((fornitore) => (
                <FornitoreRow key={fornitore.id} fornitore={fornitore} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <NuovoFornitoreModal
          onClose={() => setCreating(false)}
          onCreate={(values) => {
            addFornitore(values);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
