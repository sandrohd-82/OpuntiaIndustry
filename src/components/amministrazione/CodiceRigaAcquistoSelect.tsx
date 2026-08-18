"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  suggestCodiciRigaDropdownAction,
  type CollegaCatalogoHit,
} from "@/app/actions/catalogo-collega";
import { DROPDOWN_MATCH_THRESHOLD_PCT } from "@/lib/amministrazione/catalogo-collega";

type Props = {
  descrizione: string;
  codice: string;
  fornitoreId: string | null;
  sameInvoiceCodici: string[];
  onSelectCodice: (codice: string) => void;
  onCerca: () => void;
};

const KIND_GROUP: Record<CollegaCatalogoHit["catalogoKind"], string> = {
  servizio: "Servizi (≥70%)",
  prodotto: "Prodotti (≥70%)",
  materia: "Materie prime (≥70%)",
};

/**
 * Menu a tendina snello: solo codici salvati con match descrizione ≥ 70%.
 * «Cerca» apre la modale (circuito contestuale; intero sistema solo se vuoto).
 */
export function CodiceRigaAcquistoSelect({
  descrizione,
  codice,
  fornitoreId,
  sameInvoiceCodici,
  onSelectCodice,
  onCerca,
}: Props) {
  const [hits, setHits] = useState<CollegaCatalogoHit[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sameKey = useMemo(
    () => sameInvoiceCodici.join("|"),
    [sameInvoiceCodici]
  );

  useEffect(() => {
    setLoaded(false);
    const codes = sameKey.split("|").filter(Boolean);
    const handle = window.setTimeout(() => {
      startTransition(async () => {
        const res = await suggestCodiciRigaDropdownAction({
          descrizione,
          fornitoreId,
          sameInvoiceCodici: codes,
          codiceCorrente: codice,
        });
        if (!res.success) {
          setError(res.error);
          setHits([]);
          setLoaded(true);
          return;
        }
        setError(null);
        setHits(res.hits);
        setLoaded(true);
      });
    }, 280);
    return () => window.clearTimeout(handle);
  }, [descrizione, codice, fornitoreId, sameKey]);

  function refreshNow() {
    const codes = sameKey.split("|").filter(Boolean);
    startTransition(async () => {
      const res = await suggestCodiciRigaDropdownAction({
        descrizione,
        fornitoreId,
        sameInvoiceCodici: codes,
        codiceCorrente: codice,
      });
      if (!res.success) {
        setError(res.error);
        setHits([]);
        setLoaded(true);
        return;
      }
      setError(null);
      setHits(res.hits);
      setLoaded(true);
    });
  }

  const orphan =
    codice &&
    codice !== "—" &&
    !hits.some((h) => h.codice === codice);

  const grouped = useMemo(() => {
    const g: Record<CollegaCatalogoHit["catalogoKind"], CollegaCatalogoHit[]> = {
      servizio: [],
      prodotto: [],
      materia: [],
    };
    for (const h of hits) g[h.catalogoKind].push(h);
    return g;
  }, [hits]);

  const selectValue =
    codice && codice !== "—"
      ? orphan
        ? `__orphan__:${codice}`
        : codice
      : "";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <div className="flex items-start gap-1.5">
        <select
          value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (!v || v.startsWith("__orphan__:")) return;
            onSelectCodice(v);
          }}
          onFocus={() => {
            if (!loaded && !pending) refreshNow();
          }}
          className="w-full min-w-[140px] rounded border border-[var(--border)] px-2 py-1.5 font-mono text-xs"
          required
          title={`Solo codici già salvati con corrispondenza ≥ ${DROPDOWN_MATCH_THRESHOLD_PCT}%`}
        >
          <option value="">
            {pending
              ? "Carico match…"
              : hits.length === 0
                ? "Nessun match ≥70%…"
                : "Seleziona codice…"}
          </option>
          {orphan ? (
            <option value={`__orphan__:${codice}`}>
              {codice} — (non in catalogo / sotto soglia)
            </option>
          ) : null}
          {(["servizio", "prodotto", "materia"] as const).map((kind) =>
            grouped[kind].length === 0 ? null : (
              <optgroup key={kind} label={KIND_GROUP[kind]}>
                {grouped[kind].map((h) => (
                  <option key={h.catalogoId} value={h.codice}>
                    {h.codice} — {h.nome}
                    {h.score > 0 ? ` (${Math.round(h.score)}%)` : ""}
                  </option>
                ))}
              </optgroup>
            )
          )}
        </select>
        <button
          type="button"
          onClick={onCerca}
          className="shrink-0 rounded border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-[11px] font-medium text-sky-950 hover:bg-sky-100"
          title="Apre la ricerca codice (filtri, crea nuovo)"
        >
          Cerca
        </button>
      </div>
      {error ? (
        <p className="text-[10px] text-red-700">{error}</p>
      ) : !pending && loaded && hits.length === 0 && !orphan ? (
        <p className="text-[10px] text-[var(--muted)]">
          Nessun codice ≥{DROPDOWN_MATCH_THRESHOLD_PCT}%. Usa «Cerca».
        </p>
      ) : null}
    </div>
  );
}
