"use client";

import { useEffect, useMemo, useState } from "react";
import { classiGrigliaViste, type PiantaLuogoPagina } from "@/lib/magazzino/mappa";
import {
  applicaCapienza,
  areeElencoConsultazione,
  idsUbicazioniCollegate,
  unisciAreePiante,
  type UbicazioneCapienza,
} from "@/lib/magazzino/ubicazioni";
import { PiantaVistaRitaglio } from "@/components/magazzino/PiantaVistaRitaglio";
import { PiantaPostoPannello } from "@/components/magazzino/PiantaPostoPannello";

export function PiantaLuogoBoard({ luogo }: { luogo: PiantaLuogoPagina }) {
  const [mappe, setMappe] = useState(luogo.mappe);
  const [selezionata, setSelezionata] = useState<string | null>(null);

  useEffect(() => {
    setMappe(luogo.mappe);
  }, [luogo]);

  const tutteAree = useMemo(
    () => mappe.flatMap((m) => m.aree ?? []),
    [mappe]
  );
  const accese = useMemo(
    () => idsUbicazioniCollegate(tutteAree, selezionata),
    [tutteAree, selezionata]
  );
  const n = mappe.length;
  const griglia = classiGrigliaViste(n);
  const aree = areeElencoConsultazione(unisciAreePiante(mappe.map((m) => m.aree ?? [])));
  const haLivelli = tutteAree.some((a) => a.parentId);
  const posto = tutteAree.find((a) => a.ubicazioneId === selezionata) ?? null;
  const vistePosto = posto
    ? mappe
        .filter((m) =>
          (m.aree ?? []).some((a) => a.ubicazioneId === posto.ubicazioneId)
        )
        .map((m) => m.vistaEtichetta || "Vista")
    : [];

  function applica(ubicazioneId: string, capienza: UbicazioneCapienza) {
    setMappe((prev) =>
      prev.map((m) => ({
        ...m,
        aree: (m.aree ?? []).map((a) =>
          a.ubicazioneId === ubicazioneId ? applicaCapienza(a, capienza) : a
        ),
      }))
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={griglia.contenitore}
        style={n >= 3 ? { minHeight: n === 4 ? "36rem" : "20rem" } : undefined}
      >
        {mappe.map((m) => (
          <div key={m.id} className={griglia.cella}>
            <PiantaVistaRitaglio
              mappa={m}
              accese={accese}
              primariaId={selezionata}
              onSeleziona={setSelezionata}
            />
          </div>
        ))}
      </div>

      {posto ? (
        <PiantaPostoPannello
          key={posto.ubicazioneId}
          posto={posto}
          viste={vistePosto}
          onSalvato={applica}
          onChiudi={() => setSelezionata(null)}
        />
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Clicca un&apos;area o un posto sulla pianta: si accende insieme alle
          corrispettive viste collegate (stesso posto, colonna padre e livelli
          figli).
        </p>
      )}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <p className="text-sm font-semibold">Aree</p>
          <p className="text-xs text-[var(--muted)]">
            {haLivelli
              ? "Colonne e livelli: codice misto (es. A1, B3)."
              : "Solo colonne: codice lettera (es. A, B)."}{" "}
            Verde chiaro = libero, verde scuro = occupato.
          </p>
        </div>
        {aree.length === 0 ? (
          <p className="px-3 py-4 text-sm text-[var(--muted)]">
            Nessuna area disegnata su queste viste.
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-1.5 font-medium">Codice</th>
                <th className="px-3 py-1.5 font-medium">Nome</th>
                <th className="px-3 py-1.5 font-medium">Stato</th>
              </tr>
            </thead>
            <tbody>
              {aree.map((a) => {
                const accesa = accese.has(a.id);
                const occupato = a.occupazione === "occupato";
                return (
                  <tr
                    key={a.id}
                    className={`cursor-pointer border-t border-[var(--border)] ${
                      accesa
                        ? occupato
                          ? "bg-green-800/20"
                          : "bg-teal-100"
                        : occupato
                          ? "bg-green-900/10"
                          : ""
                    }`}
                    onClick={() =>
                      setSelezionata(a.id === selezionata ? null : a.id)
                    }
                  >
                    <td className="px-3 py-1.5 font-semibold">{a.codice}</td>
                    <td className="px-3 py-1.5">{a.nome}</td>
                    <td className="px-3 py-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
                          occupato ? "text-green-900" : "text-teal-800"
                        }`}
                      >
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-sm ${
                            occupato ? "bg-green-800" : "bg-teal-300"
                          }`}
                        />
                        {occupato ? "Occupato" : "Libero"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
