"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { listSchedeOrdiniAction } from "@/app/actions/schede-ordini";
import { SchedaOrdineModal } from "@/components/produzione/SchedaOrdineModal";
import {
  SCHEDA_COMPLETE_GIORNI,
  SCHEDA_STATO_LABEL,
  giorniDaCompletamento,
  type SchedaOrdine,
} from "@/lib/produzione/schede-ordini";

type Vista = "aperte" | "complete" | "archivio";

export function SchedeOrdiniBoard({
  archivio = false,
}: {
  archivio?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [vista, setVista] = useState<Vista>(archivio ? "archivio" : "aperte");
  const [schede, setSchede] = useState<SchedaOrdine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apertoId, setApertoId] = useState<string | null>(
    search.get("id")
  );

  useEffect(() => {
    if (archivio) setVista("archivio");
  }, [archivio]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listSchedeOrdiniAction(vista).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setError(res.error);
        setSchede([]);
      } else {
        setError("");
        setSchede(res.schede);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vista]);

  function apri(id: string) {
    setApertoId(id);
    const path = archivio
      ? `/app/archivio/produzione/ordini/schede?id=${id}`
      : `/app/produzione/ordini/schede?id=${id}`;
    router.replace(path, { scroll: false });
  }

  function chiudi() {
    setApertoId(null);
    router.replace(
      archivio
        ? "/app/archivio/produzione/ordini/schede"
        : "/app/produzione/ordini/schede",
      { scroll: false }
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        {archivio
          ? "Schede complete da più di un mese, trasferite in archivio. La timeline resta consultabile."
          : `Schede aperte e complete. Le complete restano qui ${SCHEDA_COMPLETE_GIORNI} giorni, poi passano in Archivio → Produzione → Ordini → Schede Ordini.`}
      </p>

      {archivio ? null : (
        <div className="inline-flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          {(
            [
              ["aperte", "Aperte"],
              ["complete", "Complete"],
            ] as const
          ).map(([k, lab]) => (
            <button
              key={k}
              type="button"
              onClick={() => setVista(k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                vista === k
                  ? "bg-[var(--primary)] text-white"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              {lab}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Caricamento schede…</p>
      ) : schede.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-slate-500">
          {vista === "aperte"
            ? "Nessuna scheda aperta. Si crea passando un ordine o una campionatura in scaletta."
            : vista === "complete"
              ? "Nessuna scheda completa negli ultimi 30 giorni."
              : "Nessuna scheda in archivio."}
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
                <th className="px-3 py-2">Stato</th>
                <th className="px-3 py-2">Ultimo evento</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schede.map((s) => {
                const giorni = giorniDaCompletamento(s.completataAt);
                return (
                  <tr key={s.id}>
                    <td className="px-3 py-2 font-mono font-medium">
                      {s.numeroScheda}
                    </td>
                    <td className="px-3 py-2">{s.cliente || "—"}</td>
                    <td className="px-3 py-2">{s.prodotto || "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {s.entityTipo === "campionatura"
                        ? "Campionatura"
                        : "Ordine"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium">
                        {SCHEDA_STATO_LABEL[s.schedaStato]}
                      </span>
                      {s.schedaStato === "completa" && giorni != null ? (
                        <span className="ml-1 text-[11px] text-slate-500">
                          {giorni}g
                        </span>
                      ) : null}
                    </td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-xs text-slate-600">
                      {s.ultimoTitolo || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => apri(s.id)}
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        Apri
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {apertoId ? (
        <SchedaOrdineModal schedaId={apertoId} onClose={chiudi} />
      ) : null}
    </div>
  );
}
