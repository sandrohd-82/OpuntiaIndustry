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
import { PiantaPostoOccupazione } from "@/components/magazzino/PiantaPostoOccupazione";

export function PiantaLuogoBoard({ luogo }: { luogo: PiantaLuogoPagina }) {
  const [mappe, setMappe] = useState(luogo.mappe);
  const [selezionata, setSelezionata] = useState<string | null>(null);
  const [pannello, setPannello] = useState<"settaggio" | "occupazione" | null>(
    null
  );

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

  function setStato(
    ubicazioneId: string,
    occupazione: "libero" | "occupato"
  ) {
    setMappe((prev) =>
      prev.map((m) => ({
        ...m,
        aree: (m.aree ?? []).map((a) =>
          a.ubicazioneId === ubicazioneId ? { ...a, occupazione } : a
        ),
      }))
    );
  }

  function selezionaSolo(id: string | null) {
    setSelezionata(id);
    setPannello(null);
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
              onSeleziona={selezionaSolo}
            />
          </div>
        ))}
      </div>

      {posto && pannello === "settaggio" ? (
        <PiantaPostoPannello
          key={`set-${posto.ubicazioneId}`}
          posto={posto}
          viste={vistePosto}
          onSalvato={applica}
          onChiudi={() => setPannello(null)}
        />
      ) : posto && pannello === "occupazione" ? (
        <PiantaPostoOccupazione
          key={`occ-${posto.ubicazioneId}`}
          posto={posto}
          onCambioStato={(st) => setStato(posto.ubicazioneId, st)}
          onChiudi={() => setPannello(null)}
        />
      ) : (
        <p className="text-xs text-[var(--muted)]">
          Clicca un posto per accenderlo sulle viste collegate. Il settaggio e
          l&apos;occupazione si aprono solo dai pulsanti in tabella: sono due
          cose diverse.
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
                <th className="px-3 py-1.5 font-medium">Settaggio</th>
                <th className="px-3 py-1.5 font-medium">Occupazione</th>
              </tr>
            </thead>
            <tbody>
              {aree.map((a) => {
                const accesa = accese.has(a.id);
                const occupato = a.occupazione === "occupato";
                return (
                  <tr
                    key={a.id}
                    className={`border-t border-[var(--border)] ${
                      accesa
                        ? occupato
                          ? "bg-green-800/20"
                          : "bg-teal-100"
                        : occupato
                          ? "bg-green-900/10"
                          : ""
                    }`}
                  >
                    <td
                      className="cursor-pointer px-3 py-1.5 font-semibold"
                      onClick={() =>
                        selezionaSolo(a.id === selezionata ? null : a.id)
                      }
                    >
                      {a.codice}
                    </td>
                    <td
                      className="cursor-pointer px-3 py-1.5"
                      onClick={() =>
                        selezionaSolo(a.id === selezionata ? null : a.id)
                      }
                    >
                      {a.nome}
                    </td>
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
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-400 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-100"
                        onClick={() => {
                          setSelezionata(a.id);
                          setPannello("settaggio");
                        }}
                      >
                        Settaggio
                      </button>
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="rounded-lg border border-green-800 bg-white px-2 py-1 text-xs font-medium text-green-950 hover:bg-green-50"
                        onClick={() => {
                          setSelezionata(a.id);
                          setPannello("occupazione");
                        }}
                      >
                        {occupato ? "Pallet / libera" : "Occupare"}
                      </button>
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
