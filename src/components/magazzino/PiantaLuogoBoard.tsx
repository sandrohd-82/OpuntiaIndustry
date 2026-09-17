import { classiGrigliaViste, type PiantaLuogoPagina } from "@/lib/magazzino/mappa";
import {
  areeElencoConsultazione,
  unisciAreePiante,
} from "@/lib/magazzino/ubicazioni";
import { PiantaVistaRitaglio } from "@/components/magazzino/PiantaVistaRitaglio";

export function PiantaLuogoBoard({ luogo }: { luogo: PiantaLuogoPagina }) {
  const n = luogo.mappe.length;
  const griglia = classiGrigliaViste(n);
  const aree = areeElencoConsultazione(
    unisciAreePiante(luogo.mappe.map((m) => m.aree ?? []))
  );
  const haLivelli = (luogo.mappe.flatMap((m) => m.aree ?? [])).some(
    (a) => a.parentId
  );

  return (
    <div className="space-y-4">
      <div
        className={griglia.contenitore}
        style={n >= 3 ? { minHeight: n === 4 ? "36rem" : "20rem" } : undefined}
      >
        {luogo.mappe.map((m) => (
          <div key={m.id} className={griglia.cella}>
            <PiantaVistaRitaglio mappa={m} />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-3 py-2">
          <p className="text-sm font-semibold">Aree</p>
          <p className="text-xs text-[var(--muted)]">
            {haLivelli
              ? "Colonne e livelli: codice misto (es. A1, B3)."
              : "Solo colonne: codice lettera (es. A, B)."}
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
              </tr>
            </thead>
            <tbody>
              {aree.map((a) => (
                <tr key={a.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-1.5 font-semibold">{a.codice}</td>
                  <td className="px-3 py-1.5">{a.nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
