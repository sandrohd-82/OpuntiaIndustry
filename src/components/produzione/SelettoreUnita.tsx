"use client";

import { UNITA_APPROVVIGIONAMENTO, unitaStandard } from "@/lib/produzione/unita-approvvigionamento";

export function SelettoreUnita(props: {
  sigla: string;
  nome: string;
  personalizzata: boolean;
  onChange: (valore: { sigla: string; nome: string; personalizzata: boolean }) => void;
}) {
  const valore = props.personalizzata || (props.sigla && !unitaStandard(props.sigla))
    ? "personalizzata"
    : props.sigla;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        Unità
        <select
          aria-label="Unità di misura"
          value={valore}
          onChange={(event) => {
            const scelta = event.target.value;
            if (scelta === "personalizzata") {
              props.onChange({ sigla: "", nome: "", personalizzata: true });
              return;
            }
            props.onChange({ sigla: scelta, nome: "", personalizzata: false });
          }}
          className="mt-1 block rounded-lg border border-slate-300 px-2 py-2 text-sm"
        >
          <option value="">Seleziona</option>
          {UNITA_APPROVVIGIONAMENTO.map((voce) => (
            <option key={voce.sigla} value={voce.sigla}>
              {voce.etichetta}
            </option>
          ))}
          <option value="personalizzata">Personalizzata…</option>
        </select>
      </label>
      {valore === "personalizzata" ? (
        <>
          <label className="text-sm">
            Nome
            <input
              value={props.nome}
              onChange={(event) =>
                props.onChange({
                  sigla: props.sigla,
                  nome: event.target.value,
                  personalizzata: true,
                })
              }
              maxLength={40}
              className="mt-1 block w-36 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            Sigla
            <input
              value={props.sigla}
              onChange={(event) =>
                props.onChange({
                  sigla: event.target.value,
                  nome: props.nome,
                  personalizzata: true,
                })
              }
              maxLength={16}
              className="mt-1 block w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm"
            />
          </label>
        </>
      ) : null}
    </div>
  );
}
