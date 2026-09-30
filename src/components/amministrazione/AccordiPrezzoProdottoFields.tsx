"use client";

import { useEffect, useMemo, useState } from "react";
import { listProdottiPropriAction } from "@/app/actions/prodotti-propri";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { AccordoPrezzoVoceForm } from "@/lib/amministrazione/accordi-prezzo";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

type Props = {
  codici: string[];
  value: AccordoPrezzoVoceForm[];
  onChange: (next: AccordoPrezzoVoceForm[]) => void;
};

function voceDi(codice: string, value: AccordoPrezzoVoceForm[]): AccordoPrezzoVoceForm {
  return (
    value.find((row) => row.prodottoCodice === codice) ?? {
      prodottoCodice: codice,
      modalita: "nessuno",
      scontoPct: "",
      prezzoKg: "",
      giustificazione: "",
    }
  );
}

export function AccordiPrezzoProdottoFields({ codici, value, onChange }: Props) {
  const [catalog, setCatalog] = useState<ProdottoProprio[]>([]);

  useEffect(() => {
    void listProdottiPropriAction().then((res) => {
      if (res.success) setCatalog(res.prodotti);
    });
  }, []);

  const nomi = useMemo(
    () => new Map(catalog.map((p) => [p.codice, p.nome])),
    [catalog]
  );

  if (codici.length === 0) return null;

  function patch(codice: string, next: Partial<AccordoPrezzoVoceForm>) {
    const current = voceDi(codice, value);
    const merged = { ...current, ...next, prodottoCodice: codice };
    const others = value.filter((row) => row.prodottoCodice !== codice);
    onChange([...others, merged]);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-semibold">
        Sconto o prezzo concordato
      </legend>
      <p className="text-xs text-[var(--muted)]">
        Per ogni prodotto puoi fissare uno sconto o un prezzo al kg, solo per
        questa azienda. Non dipende da quantità o confezione. In preventivo e
        ordine il valore arriva già compilato, con il motivo, e si può modificare.
      </p>
      {codici.map((codice) => {
        const voce = voceDi(codice, value);
        return (
          <div
            key={codice}
            className="space-y-2 rounded-lg border border-[var(--border)] bg-white p-3"
          >
            <p className="text-sm">
              <span className="font-mono text-xs font-semibold">{codice}</span>
              {nomi.get(codice) ? (
                <span className="text-slate-700"> · {nomi.get(codice)}</span>
              ) : null}
            </p>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Accordo</span>
              <select
                value={voce.modalita}
                onChange={(e) => {
                  const modalita = e.target.value as AccordoPrezzoVoceForm["modalita"];
                  patch(codice, {
                    modalita,
                    scontoPct: modalita === "sconto_percentuale" ? voce.scontoPct : "",
                    prezzoKg: modalita === "prezzo_fisso" ? voce.prezzoKg : "",
                  });
                }}
                className="w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2 outline-none focus:border-[var(--primary)]"
              >
                <option value="nessuno">Nessun accordo</option>
                <option value="sconto_percentuale">Sconto fisso (%)</option>
                <option value="prezzo_fisso">Prezzo fisso (€/kg)</option>
              </select>
            </label>
            {voce.modalita === "sconto_percentuale" ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Sconto (%)</span>
                <ClearableNumberInput
                  min={0}
                  max={100}
                  value={voce.scontoPct}
                  onValueChange={(scontoPct) => patch(codice, { scontoPct })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            ) : null}
            {voce.modalita === "prezzo_fisso" ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Prezzo (€/kg)</span>
                <ClearableNumberInput
                  min={0}
                  value={voce.prezzoKg}
                  onValueChange={(prezzoKg) => patch(codice, { prezzoKg })}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            ) : null}
            {voce.modalita !== "nessuno" ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">
                  Perché questo valore
                </span>
                <textarea
                  required
                  rows={2}
                  value={voce.giustificazione}
                  onChange={(e) =>
                    patch(codice, { giustificazione: e.target.value })
                  }
                  placeholder="Es. accordo commerciale di marzo, indipendente dal confezionamento"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 outline-none focus:border-[var(--primary)]"
                />
              </label>
            ) : null}
          </div>
        );
      })}
    </fieldset>
  );
}
