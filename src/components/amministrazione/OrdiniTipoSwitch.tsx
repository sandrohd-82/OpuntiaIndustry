"use client";

import Link from "next/link";
import type { OrdineTipoDocumento } from "@/types/database";

type Area = "da-processare" | "elenco-ordini";

export function OrdiniTipoSwitch({
  area,
  tipo,
}: {
  area: Area;
  tipo: OrdineTipoDocumento;
}) {
  const merce = `/app/amministrazione/${area}/merce`;
  const camp = `/app/amministrazione/${area}/campionature`;
  const tabClass = (active: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium ${
      active
        ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,white)] text-[var(--primary)]"
        : "border-[var(--border)] bg-white text-slate-700 hover:bg-slate-50"
    }`;

  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tipo ordine">
      <Link href={merce} className={tabClass(tipo === "vendita")} role="tab">
        Ordini merce
      </Link>
      <Link
        href={camp}
        className={tabClass(tipo === "campionatura")}
        role="tab"
      >
        Ordini Campionature
      </Link>
    </div>
  );
}
