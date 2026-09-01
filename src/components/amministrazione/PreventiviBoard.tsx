"use client";

import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import {
  listPreventiviAction,
  setPreventivoStatoAction,
} from "@/app/actions/preventivi";
import { PreventivoFormModal } from "@/components/amministrazione/PreventivoFormModal";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_STATO_LABEL,
  type Preventivo,
  type PreventivoStato,
} from "@/lib/amministrazione/preventivi";
import { labelTipoPagamento } from "@/lib/amministrazione/ordini";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

function statoClass(stato: PreventivoStato) {
  if (stato === "accettato") return "bg-emerald-50 text-emerald-800";
  if (stato === "inviato") return "bg-sky-50 text-sky-800";
  if (stato === "respinto") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export function PreventiviBoard() {
  const [items, setItems] = useState<Preventivo[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function reload() {
    const res = await listPreventiviAction();
    if (res.success) {
      setItems(res.items);
      setError(null);
    } else {
      setError(res.error);
    }
  }

  useEffect(() => {
    void reload().finally(() => setReady(true));
  }, []);

  async function changeStato(id: string, stato: PreventivoStato) {
    const res = await setPreventivoStatoAction({ id, stato });
    if (!res.success) {
      setError(res.error);
      return;
    }
    setItems((prev) => prev.map((p) => (p.id === id ? res.item : p)));
  }

  if (!ready) {
    return <p className="text-sm text-[var(--muted)]">Caricamento preventivi…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Preventivi inviati e in bozza. Solo quelli accettati si collegano a un
          ordine.
        </p>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Crea nuovo
        </button>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun preventivo</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            <FaPlus size={14} />
            Crea nuovo
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">N.</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Cliente
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Data
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Prodotti
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Consegna
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Pagamento
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Stato
                </th>
                <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono font-semibold">
                    {item.numeroInterno}
                  </td>
                  <td className="px-4 py-3">{item.cliente}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatDate(item.dataPreventivo)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {item.righe
                      .map((r) => `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura}`)
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {PREVENTIVO_CONSEGNA_LABEL[item.consegnaMetodo]}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {labelTipoPagamento(item.tipoPagamento)}
                    {item.tempiPagamentoGiorni != null
                      ? ` · ${item.tempiPagamentoGiorni} gg`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statoClass(item.stato)}`}
                    >
                      {PREVENTIVO_STATO_LABEL[item.stato]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {item.stato === "creato" ? (
                        <button
                          type="button"
                          onClick={() => void changeStato(item.id, "inviato")}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                        >
                          Segna inviato
                        </button>
                      ) : null}
                      {item.stato === "inviato" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void changeStato(item.id, "accettato")}
                            className="rounded-lg bg-emerald-700 px-2 py-1 text-xs text-white"
                          >
                            Accettato
                          </button>
                          <button
                            type="button"
                            onClick={() => void changeStato(item.id, "respinto")}
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700"
                          >
                            Respinto
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <PreventivoFormModal
          onClose={() => setCreating(false)}
          onSaved={(item) => {
            setItems((prev) => [item, ...prev]);
            setCreating(false);
          }}
        />
      ) : null}
    </div>
  );
}
