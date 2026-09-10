"use client";

import { useState, useTransition } from "react";
import { assignCommercialeAnagraficaAction } from "@/app/actions/commerciale-anagrafica";
import {
  COMMERCIALE_GRADI,
  COMMERCIALE_GRADO_LABELS,
  commercialeGradoLabel,
  type CommercialeAssegnabile,
  type CommercialeGrado,
} from "@/lib/auth/commerciale";

type Props = {
  aziendaTipo: "cliente" | "cliente_possibile";
  aziendaId: string;
  commercialeId: string | null;
  commercialeNome: string;
  commercialeGrado: CommercialeGrado | null;
  canAssign: boolean;
  commerciali: CommercialeAssegnabile[];
  onAssigned: (next: {
    commercialeId: string | null;
    commercialeNome: string;
    commercialeGrado: CommercialeGrado | null;
  }) => void;
  onError: (msg: string) => void;
};

export function CollegaCommercialeControl({
  aziendaTipo,
  aziendaId,
  commercialeId,
  commercialeNome,
  commercialeGrado,
  canAssign,
  commerciali,
  onAssigned,
  onError,
}: Props) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(commercialeId ?? "");
  const [pending, startTransition] = useTransition();

  const label = commercialeId
    ? `${commercialeNome || "Commerciale"}${
        commercialeGrado ? ` · ${commercialeGradoLabel(commercialeGrado)}` : ""
      }`
    : "Non collegato";

  return (
    <div className="text-sm">
      <p className="text-[var(--muted)]">{label}</p>
      {canAssign ? (
        <button
          type="button"
          className="mt-0.5 text-xs font-medium text-[var(--primary)] hover:underline"
          onClick={() => {
            setPicked(commercialeId ?? "");
            setOpen(true);
          }}
        >
          Collega commerciale
        </button>
      ) : null}
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
            <h3 className="text-sm font-semibold">Collega commerciale</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Un solo commerciale per azienda. I subordinati (Professional /
              Executive) e i superiori nella linea vedono la scheda come propria.
            </p>
            <select
              className="mt-3 w-full rounded-md border border-[var(--border)] px-2.5 py-2 text-sm"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
            >
              <option value="">Nessun collegamento</option>
              {COMMERCIALE_GRADI.map((g) => {
                const group = commerciali.filter((c) => c.grado === g);
                if (!group.length) return null;
                return (
                  <optgroup key={g} label={COMMERCIALE_GRADO_LABELS[g]}>
                    {group.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.email ? ` · ${c.email}` : ""}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
              {commerciali.some((c) => !c.grado) ? (
                <optgroup label="Senza grado">
                  {commerciali
                    .filter((c) => !c.grado)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                        {c.email ? ` · ${c.email}` : ""}
                      </option>
                    ))}
                </optgroup>
              ) : null}
            </select>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => setOpen(false)}
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending}
                className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
                onClick={() =>
                  startTransition(async () => {
                    const res = await assignCommercialeAnagraficaAction({
                      aziendaTipo,
                      aziendaId,
                      commercialeId: picked || null,
                    });
                    if (!res.success) {
                      onError(res.error);
                      return;
                    }
                    onAssigned({
                      commercialeId: res.commercialeId,
                      commercialeNome: res.commercialeNome,
                      commercialeGrado: res.commercialeGrado,
                    });
                    setOpen(false);
                  })
                }
              >
                {pending ? "Salvataggio…" : "Salva"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
