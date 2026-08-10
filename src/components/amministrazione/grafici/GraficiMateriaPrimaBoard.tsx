"use client";

import { useEffect, useState } from "react";
import { listMateriePrimeAction } from "@/app/actions/materie-prime";
import { GraficiPeriodoFilters } from "@/components/amministrazione/grafici/GraficiPeriodoFilters";
import { MiniBarChart } from "@/components/amministrazione/grafici/MiniBarChart";
import {
  currentAnno,
  emptySerieAnno,
} from "@/lib/amministrazione/grafici";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";

export function GraficiMateriaPrimaBoard() {
  const [anno, setAnno] = useState(currentAnno);
  const [mese, setMese] = useState<number | null>(null);
  const [materiaId, setMateriaId] = useState<string | null>(null);
  const [materie, setMaterie] = useState<MateriaPrima[]>([]);

  useEffect(() => {
    void listMateriePrimeAction().then((r) => {
      if (r.success) setMaterie(r.materie);
    });
  }, []);

  const serie = emptySerieAnno(anno).serie;

  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted)]">
        Qui comparirà la quantità di <strong>materia prima in ingresso</strong>,
        filtrabile per materia. I dati arriveranno quando gli ingressi saranno
        registrati su database (ISO 9001: solo quantità tracciate).
      </p>

      <GraficiPeriodoFilters
        anno={anno}
        mese={mese}
        onAnnoChange={setAnno}
        onMeseChange={setMese}
      >
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Materia prima</span>
          <select
            value={materiaId ?? ""}
            onChange={(e) => setMateriaId(e.target.value || null)}
            className="min-w-[220px] rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
          >
            <option value="">Tutte le materie</option>
            {materie.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codice} — {m.nome}
              </option>
            ))}
          </select>
        </label>
      </GraficiPeriodoFilters>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Totale ingresso
        </p>
        <p className="text-2xl font-semibold tabular-nums text-[var(--muted)]">
          —
        </p>
        <div className="mt-4">
          <MiniBarChart
            serie={serie}
            height={220}
            emptyLabel="Nessun ingresso materia prima registrato"
          />
        </div>
      </div>
    </div>
  );
}
