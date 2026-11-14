"use client";

import type { FoglioIngressoRiga } from "@/app/actions/foglio-ingresso";
import type { StatoFoglioIngresso, VistaFoglio } from "@/lib/produzione/foglio-ingresso";

const STATO: Record<StatoFoglioIngresso, string> = {
  aperto: "Aperto",
  in_compilazione: "In compilazione",
  in_attesa: "In attesa",
  partito: "Partito",
  arrivato: "Arrivato",
  chiuso: "Chiuso",
};

function hrefFoglio(vista: VistaFoglio, id: string): string {
  const base =
    vista === "produzione"
      ? "/app/produzione/controlli-haccp/controllo-processi/materiale-in-ingresso"
      : "/app/area-fornitori/materiale-in-ingresso";
  return `${base}?foglio=${id}`;
}

function dataIt(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function FogliIngressoElenco({
  vista,
  fogli,
}: {
  vista: VistaFoglio;
  fogli: FoglioIngressoRiga[];
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Carichi assegnati
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {vista === "produzione"
            ? "I fogli si inviano dalla scheda fornitore in Amministrazione. Qui restano visibili tutti i carichi, compresi quelli già aperti."
            : "Qui ci sono i carichi della tua anagrafica. Un nuovo carico arriva da Agrinsicilia: da qui non si crea una richiesta."}
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Foglio</th>
              {vista === "produzione" ? <th className="px-4 py-3">Fornitore</th> : null}
              <th className="px-4 py-3">Stato</th>
              <th className="px-4 py-3">Aperto</th>
              <th className="px-4 py-3">Incomplete</th>
            </tr>
          </thead>
          <tbody>
            {fogli.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-slate-500" colSpan={vista === "produzione" ? 5 : 4}>
                  Nessun foglio assegnato.
                </td>
              </tr>
            ) : (
              fogli.map((foglio) => (
                <tr key={foglio.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <a href={hrefFoglio(vista, foglio.id)} className="font-medium text-sky-800 hover:underline">
                      {foglio.codice}
                    </a>
                  </td>
                  {vista === "produzione" ? (
                    <td className="px-4 py-3">{foglio.ragioneSociale}</td>
                  ) : null}
                  <td className="px-4 py-3">{STATO[foglio.stato]}</td>
                  <td className="px-4 py-3">{dataIt(foglio.openedAt)}</td>
                  <td className="px-4 py-3">{foglio.incomplete}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
