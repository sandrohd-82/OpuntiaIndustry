"use client";

import { useEffect, useMemo, useState } from "react";
import { listMateriePrimeAction } from "@/app/actions/materie-prime";
import { MateriaPrimaProductTag } from "@/components/amministrazione/MateriaPrimaProductTag";
import type { MateriaPrima } from "@/lib/amministrazione/materie-prime";

type Props = {
  codes: string[];
  /** Se passato, evita un fetch per ogni lista. */
  materie?: MateriaPrima[];
  bioCertificato?: string;
  bioCodice?: string;
  removable?: boolean;
  onRemove?: (code: string) => void;
  emptyLabel?: string;
};

export function MateriaPrimaTagList({
  codes,
  materie: materieProp,
  bioCertificato = "",
  bioCodice = "",
  removable = false,
  onRemove,
  emptyLabel = "Nessuno",
}: Props) {
  const [materieLocal, setMaterieLocal] = useState<MateriaPrima[]>([]);

  useEffect(() => {
    if (materieProp) return;
    let cancelled = false;
    void (async () => {
      const result = await listMateriePrimeAction();
      if (cancelled || !result.success) return;
      setMaterieLocal(result.materie);
    })();
    return () => {
      cancelled = true;
    };
  }, [materieProp]);

  const materie = materieProp ?? materieLocal;

  const byCode = useMemo(
    () => new Map(materie.map((m) => [m.codice, m])),
    [materie]
  );

  if (codes.length === 0) {
    return <p className="text-sm text-[var(--muted)]">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-wrap items-center gap-2">
      {codes.map((code) => (
        <li key={code} className="inline-flex">
          <MateriaPrimaProductTag
            code={code}
            materia={byCode.get(code) ?? null}
            bioContext={{
              certificato: bioCertificato,
              codice: bioCodice,
            }}
            removable={removable}
            onRemove={onRemove ? () => onRemove(code) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
