"use client";

import { useState } from "react";
import type { BozzaConsegna, ConsegnaUfficiale, PropostaRevisione } from "@/lib/produzione/revisione-piano";
import { etichettaDifferenza } from "@/lib/produzione/revisione-piano";
import { propostaProntaPerRevisione } from "@/lib/produzione/revisione-da-proposta";
import { SelettoreUnita } from "@/components/produzione/SelettoreUnita";
import { unitaStandard } from "@/lib/produzione/unita-approvvigionamento";

export function RevisionePianoPannello(props: {
  consegne: ConsegnaUfficiale[];
  pending: boolean;
  onProponi: (input: { motivazione: string; bozza: BozzaConsegna[] }) => void;
}) {
  const [righe, setRighe] = useState<(BozzaConsegna & { personalizzata: boolean; nomeUnita: string })[]>(
    props.consegne.map((consegna) => ({
      consegnaId: consegna.id,
      materiaId: consegna.materiaId,
      materia: consegna.materia,
      codice: consegna.codice,
      unita: consegna.unita,
      unitaCatalogo: consegna.unitaCatalogo,
      tipoQuantita: consegna.tipoQuantita,
      data: consegna.data,
      quantita: consegna.quantita,
      elimina: false,
      personalizzata: !unitaStandard(consegna.unita),
      nomeUnita: "",
    }))
  );
  const [motivazione, setMotivazione] = useState("");

  function aggiorna(
    indice: number,
    patch: Partial<BozzaConsegna & { personalizzata: boolean; nomeUnita: string }>
  ) {
    setRighe((correnti) => correnti.map((riga, i) => (i === indice ? { ...riga, ...patch } : riga)));
  }

  return (
    <form
      className="mt-3 space-y-2 border-t border-slate-200 pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        props.onProponi({
          motivazione,
          bozza: righe.map(({ personalizzata: _personalizzata, nomeUnita: _nome, ...riga }) => riga),
        });
      }}
    >
      <h3 className="text-sm font-semibold text-slate-800">Proponi una revisione della pianificazione</h3>
      <p className="text-xs text-slate-500">
        La proposta non modifica gli ordini ufficiali. Produzione accetta o respinge ogni differenza.
      </p>
      {righe.map((riga, indice) => (
        <div key={`${riga.consegnaId ?? "nuova"}-${indice}`} className="grid gap-2 rounded border border-slate-200 p-2 md:grid-cols-4">
          <input
            type="date"
            value={riga.data}
            disabled={riga.elimina}
            onChange={(event) => aggiorna(indice, { data: event.target.value })}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            value={String(riga.quantita)}
            disabled={riga.elimina}
            onChange={(event) => aggiorna(indice, { quantita: Number(event.target.value.replace(",", ".")) })}
            aria-label="Quantità"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <SelettoreUnita
            sigla={riga.unita}
            nome={riga.nomeUnita}
            personalizzata={riga.personalizzata}
            onChange={(valore) =>
              aggiorna(indice, {
                unita: valore.sigla,
                nomeUnita: valore.nome,
                personalizzata: valore.personalizzata,
              })
            }
          />
          <span className="self-center text-sm text-slate-600">
            {riga.codice} · {riga.tipoQuantita}
          </span>
          {riga.consegnaId ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={riga.elimina}
                onChange={(event) => aggiorna(indice, { elimina: event.target.checked })}
              />
              Proponi eliminazione
            </label>
          ) : (
            <select
              value={riga.materiaId}
              onChange={(event) => {
                const scelta = props.consegne.find((consegna) => consegna.materiaId === event.target.value);
                if (!scelta) return;
                aggiorna(indice, {
                  materiaId: scelta.materiaId,
                  materia: scelta.materia,
                  unita: scelta.unita,
                  unitaCatalogo: scelta.unitaCatalogo,
                  tipoQuantita: scelta.tipoQuantita,
                });
              }}
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              {Array.from(new Map(props.consegne.map((consegna) => [consegna.materiaId, consegna])).values()).map(
                (consegna) => (
                  <option key={consegna.materiaId} value={consegna.materiaId}>
                    Nuova · {consegna.materia}
                  </option>
                )
              )}
            </select>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          const base = props.consegne[0];
          if (!base) return;
          setRighe((correnti) => [
            ...correnti,
            {
              consegnaId: null,
              materiaId: base.materiaId,
              materia: base.materia,
              codice: "Nuova",
              unita: base.unita,
              unitaCatalogo: base.unitaCatalogo,
              tipoQuantita: base.tipoQuantita,
              data: base.data,
              quantita: base.quantita,
              elimina: false,
              personalizzata: !unitaStandard(base.unita),
              nomeUnita: "",
            },
          ]);
        }}
        className="text-sm text-sky-800"
      >
        Aggiungi consegna proposta
      </button>
      <textarea
        value={motivazione}
        onChange={(event) => setMotivazione(event.target.value)}
        required
        minLength={3}
        maxLength={500}
        rows={3}
        placeholder="Motivazione"
        className="w-full rounded border border-slate-300 px-2 py-2 text-sm"
      />
      <button
        type="submit"
        disabled={props.pending}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
      >
        Invia revisione
      </button>
    </form>
  );
}

export function ValutazioneRevisione(props: {
  proposte: PropostaRevisione[];
  pending: boolean;
  onDecidi: (propostaId: string, voceId: string, esito: "accettata" | "respinta", nota: string) => void;
  onPrepara?: (proposta: PropostaRevisione) => void;
}) {
  const [note, setNote] = useState<Record<string, string>>({});
  if (!props.proposte.length) return null;
  return (
    <div className="mt-3 border-t border-slate-200 pt-3">
      <h3 className="text-sm font-semibold text-slate-800">Differenze proposte dal fornitore</h3>
      <p className="text-xs text-slate-500">
        Accettare o respingere non cambia date e quantità degli ordini ufficiali.
      </p>
      {props.proposte.map((proposta) => (
        <div key={proposta.id} className="mt-2 space-y-2">
          <p className="text-sm text-slate-700">{proposta.motivazione}</p>
          {proposta.voci.map((voce) => (
            <div key={voce.id} className="rounded border border-slate-200 p-2 text-sm">
              <p>{etichettaDifferenza(voce)}</p>
              <p className="text-xs text-slate-500">Stato {voce.stato.replaceAll("_", " ")}</p>
              {voce.stato === "in_esame" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    value={note[voce.id] ?? ""}
                    onChange={(event) => setNote((corrente) => ({ ...corrente, [voce.id]: event.target.value }))}
                    placeholder="Motivazione della decisione"
                    className="min-w-48 flex-1 rounded border border-slate-300 px-2 py-1"
                  />
                  <button
                    type="button"
                    disabled={props.pending}
                    onClick={() => props.onDecidi(proposta.id, voce.id, "accettata", note[voce.id] ?? "")}
                    className="rounded bg-slate-900 px-2 py-1 text-white disabled:opacity-60"
                  >
                    Accetta
                  </button>
                  <button
                    type="button"
                    disabled={props.pending}
                    onClick={() => props.onDecidi(proposta.id, voce.id, "respinta", note[voce.id] ?? "")}
                    className="rounded border border-slate-300 px-2 py-1 disabled:opacity-60"
                  >
                    Respingi
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-600">{voce.nota}</p>
              )}
            </div>
          ))}
          {props.onPrepara && propostaProntaPerRevisione(proposta.voci) ? (
            <button
              type="button"
              disabled={props.pending}
              onClick={() => props.onPrepara?.(proposta)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
            >
              Prepara revisione ordine
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
