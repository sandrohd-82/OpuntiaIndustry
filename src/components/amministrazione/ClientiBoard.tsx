"use client";

import { useEffect, useState } from "react";
import { FaChevronDown, FaChevronUp, FaPen, FaPlus } from "react-icons/fa6";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClienteFormModal } from "@/components/amministrazione/ClienteFormModal";
import { CodiceTargaBadge } from "@/components/amministrazione/CodiceTargaBadge";
import { ProdottoProprioProductTag } from "@/components/amministrazione/ProdottoProprioProductTag";
import { useClienti } from "@/hooks/useClienti";
import {
  formatSedeBreve,
  type Cliente,
  type SedeCliente,
} from "@/lib/amministrazione/clienti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function SedeDetail({ title, sede }: { title: string; sede: SedeCliente }) {
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

function ClienteRow({
  cliente,
  onEdit,
  prodottiByCode,
}: {
  cliente: Cliente;
  onEdit: (cliente: Cliente) => void;
  prodottiByCode: Map<string, ProdottoProprio>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="border-t border-[var(--border)]">
        <td className="px-4 py-3">
          <CodiceTargaBadge code={cliente.codiceTarga} />
        </td>
        <td className="px-4 py-3 font-semibold">{cliente.ragioneSociale}</td>
        <td className="px-4 py-3 tabular-nums">{cliente.partitaIva}</td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeAmministrativa)}
        </td>
        <td className="px-4 py-3 text-[var(--muted)]">
          {formatSedeBreve(cliente.sedeMagazzino)}
        </td>
        <td className="max-w-[240px] px-4 py-3">
          {cliente.prodottiAcquistati.length === 0 ? (
            <span className="text-[var(--muted)]">—</span>
          ) : (
            <ul className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {cliente.prodottiAcquistati.map((code) => (
                <li key={code}>
                  <ProdottoProprioProductTag
                    code={code}
                    prodotto={prodottiByCode.get(code) ?? null}
                  />
                </li>
              ))}
            </ul>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => onEdit(cliente)}
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
                onClick={() => onEdit(cliente)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
              >
                <FaPen size={11} />
                Modifica scheda
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SedeDetail
                title="Sede Amministrativa"
                sede={cliente.sedeAmministrativa}
              />
              <SedeDetail
                title="Sede Magazzino"
                sede={cliente.sedeMagazzino}
              />
              <div className="sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Prodotti Acquistati
                </p>
                {cliente.prodottiAcquistati.length === 0 ? (
                  <p className="mt-1 text-sm text-[var(--muted)]">Nessuno</p>
                ) : (
                  <ul className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    {cliente.prodottiAcquistati.map((code) => (
                      <li key={code}>
                        <ProdottoProprioProductTag
                          code={code}
                          prodotto={prodottiByCode.get(code) ?? null}
                        />
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

export function ClientiBoard() {
  const { clienti, ready, error, addCliente, updateCliente } = useClienti();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [prodottiByCode, setProdottiByCode] = useState<
    Map<string, ProdottoProprio>
  >(() => new Map());

  useEffect(() => {
    void (async () => {
      const result = await listProdottiPropriAction();
      if (!result.success) return;
      setProdottiByCode(new Map(result.prodotti.map((p) => [p.codice, p])));
    })();
  }, [clienti]);

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento clienti…</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Elenco clienti registrati. Ogni scheda è modificabile in ogni sua
          parte dopo il salvataggio (la targa resta fissa).
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
          Nuovo cliente
        </button>
      </div>

      {(error || saveError) && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {saveError || error}
        </p>
      )}

      {clienti.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun cliente registrato</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Inserisci il primo cliente per iniziare.
          </p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Nuovo cliente
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
                <th className="px-4 py-3 font-medium">Sede Mag.</th>
                <th className="px-4 py-3 font-medium">Prodotti</th>
                <th className="px-4 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {clienti.map((cliente) => (
                <ClienteRow
                  key={cliente.id}
                  cliente={cliente}
                  prodottiByCode={prodottiByCode}
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
        <ClienteFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSave={async (values) => {
            const created = await addCliente(values);
            if (created) {
              setSaveError(null);
              setCreating(false);
              return true;
            }
            setSaveError("Salvataggio non riuscito. Riprova.");
            return false;
          }}
        />
      )}

      {editing && (
        <ClienteFormModal
          mode="edit"
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (values) => {
            const updated = await updateCliente(editing.id, values);
            if (updated) {
              setSaveError(null);
              setEditing(null);
              return true;
            }
            setSaveError(
              "Aggiornamento non riuscito. Controlla i dati e riprova."
            );
            return false;
          }}
        />
      )}
    </div>
  );
}
