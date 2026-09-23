"use client";

import { useEffect, useState } from "react";
import { listInAttesaRitiroAction } from "@/app/actions/ritiro-ordini";
import { SchedaOrdineModal } from "@/components/produzione/SchedaOrdineModal";
import type { InAttesaRitiroRiga } from "@/lib/produzione/corrieri";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function InAttesaRitiroBoard() {
  const [righe, setRighe] = useState<InAttesaRitiroRiga[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apertoId, setApertoId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const res = await listInAttesaRitiroAction();
    if (!res.success) {
      setError(res.error);
      setRighe([]);
    } else {
      setError("");
      setRighe(res.righe);
    }
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Ordini e campionature pronti per il ritiro. All’apertura della scheda
        registra ora di ritiro e corriere: l’ordine diventa Concluso. Si chiude
        quando la spedizione risulta consegnata.
      </p>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Caricamento…</p>
      ) : righe.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-slate-500">
          Nessun ordine in attesa di ritiro.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Numero</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Prodotto</th>
                <th className="px-3 py-2">Tipo</th>
                <th className="px-3 py-2">Pronto dal</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {righe.map((r) => (
                <tr key={r.schedaId}>
                  <td className="px-3 py-2 font-mono font-medium">{r.numero}</td>
                  <td className="px-3 py-2">{r.cliente || "—"}</td>
                  <td className="px-3 py-2">{r.prodotto || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.entityTipo === "campionatura" ? "Campionatura" : "Ordine"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatWhen(r.prontoAt)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setApertoId(r.schedaId)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Apri
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {apertoId ? (
        <SchedaOrdineModal
          schedaId={apertoId}
          focusRitiro
          onClose={() => {
            setApertoId(null);
            void reload();
          }}
          onChanged={() => void reload()}
        />
      ) : null}
    </div>
  );
}
