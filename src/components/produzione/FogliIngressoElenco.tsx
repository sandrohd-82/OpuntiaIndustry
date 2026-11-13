"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apriFoglioIngressoAction, type FoglioIngressoRiga } from "@/app/actions/foglio-ingresso";
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
  fornitori,
}: {
  vista: VistaFoglio;
  fogli: FoglioIngressoRiga[];
  fornitori: { id: string; ragioneSociale: string }[];
}) {
  const router = useRouter();
  const [fornitoreId, setFornitoreId] = useState(fornitori[0]?.id ?? "");
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function apri() {
    setOccupato(true);
    setErrore(null);
    const res = await apriFoglioIngressoAction({
      vista,
      fornitoreId: vista === "produzione" ? fornitoreId : null,
    });
    setOccupato(false);
    if (!res.success) {
      setErrore(res.error);
      return;
    }
    router.push(hrefFoglio(vista, res.id));
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
          Nuovo carico
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Ogni apertura è un foglio di un solo carico. Produzione e il fornitore
          compilano lo stesso registro.
        </p>
        {vista === "produzione" ? (
          <label className="mt-3 block text-sm font-medium text-slate-700">
            Fornitore
            <select
              value={fornitoreId}
              onChange={(event) => setFornitoreId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              {fornitori.map((fornitore) => (
                <option key={fornitore.id} value={fornitore.id}>
                  {fornitore.ragioneSociale}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Il foglio resta associato alla tua anagrafica.
          </p>
        )}
        <button
          type="button"
          disabled={occupato || (vista === "produzione" && !fornitoreId)}
          onClick={() => void apri()}
          className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          Apri foglio
        </button>
        {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
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
                  Nessun foglio aperto.
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
