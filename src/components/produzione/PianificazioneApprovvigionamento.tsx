"use client";

import type { ConsegnaAnteprima, TipoQuantitaApprovvigionamento } from "@/lib/produzione/approvvigionamento";
import type { MateriaCalendario } from "@/app/actions/approvvigionamento";
import { SelettoreUnita } from "@/components/produzione/SelettoreUnita";
import { etichettaUnita, normalizzaUnitaApprovvigionamento } from "@/lib/produzione/unita-approvvigionamento";

export function PianificazioneApprovvigionamento(props: {
  operazione: "" | "singolo" | "pianificazione";
  giorno: string;
  inizio: string;
  fine: string;
  cadenza: "regolare" | "personalizzata";
  ogniGiorni: string;
  copiaQuantita: boolean;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  quantita: string;
  unitaSigla: string;
  unitaNome: string;
  unitaPersonalizzata: boolean;
  materiaId: string;
  fornitoreId: string;
  note: string;
  valoriQuantita: Record<string, string>;
  dateScelte: string[];
  materie: MateriaCalendario[];
  fornitori: { id: string; nome: string; targa: string }[];
  anteprima: { ok: true; consegne: ConsegnaAnteprima[] } | { ok: false; motivo: string } | null;
  pending: boolean;
  onOperazione: (valore: "" | "singolo" | "pianificazione") => void;
  onGiorno: (valore: string) => void;
  onInizio: (valore: string) => void;
  onFine: (valore: string) => void;
  onCadenza: (valore: "regolare" | "personalizzata") => void;
  onOgni: (valore: string) => void;
  onCopia: (valore: boolean) => void;
  onTipo: (valore: TipoQuantitaApprovvigionamento) => void;
  onQuantita: (valore: string) => void;
  onUnita: (valore: { sigla: string; nome: string; personalizzata: boolean }) => void;
  onMateria: (valore: string) => void;
  onFornitore: (valore: string) => void;
  onNote: (valore: string) => void;
  onTogliData: (valore: string) => void;
  onQuantitaData: (data: string, valore: string) => void;
  onSalva: () => void;
}) {
  const unitaValida = normalizzaUnitaApprovvigionamento(props.unitaSigla).ok;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <h2 className="text-sm font-semibold text-slate-800">Nuova operazione</h2>
      <p className="mt-1 text-xs text-slate-500">
        L&apos;anteprima non crea ordini e non invia nulla al fornitore.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => props.onOperazione("singolo")}
          className={`rounded-lg border px-2 py-2 text-sm ${props.operazione === "singolo" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
        >
          Ordine singolo
        </button>
        <button
          type="button"
          onClick={() => props.onOperazione("pianificazione")}
          className={`rounded-lg border px-2 py-2 text-sm ${props.operazione === "pianificazione" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300"}`}
        >
          Pianificazione ordini
        </button>
      </div>
      {props.operazione === "" ? (
        <p className="mt-3 text-sm text-slate-600">Scegli se creare un ordine singolo o una pianificazione.</p>
      ) : null}
      {props.operazione === "singolo" ? (
        <label className="mt-3 block text-sm">
          Data di consegna
          <input
            type="date"
            value={props.giorno}
            onChange={(event) => props.onGiorno(event.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      ) : null}
      {props.operazione === "pianificazione" ? (
        <div className="mt-3 space-y-2">
          <label className="block text-sm">
            Data inizio
            <input
              type="date"
              value={props.inizio}
              onChange={(event) => props.onInizio(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Data fine
            <input
              type="date"
              value={props.fine}
              onChange={(event) => props.onFine(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => props.onCadenza("regolare")}
              className={`rounded-lg border px-2 py-2 text-sm ${props.cadenza === "regolare" ? "border-slate-900" : "border-slate-300"}`}
            >
              Ogni N giorni
            </button>
            <button
              type="button"
              onClick={() => props.onCadenza("personalizzata")}
              className={`rounded-lg border px-2 py-2 text-sm ${props.cadenza === "personalizzata" ? "border-slate-900" : "border-slate-300"}`}
            >
              Date sul calendario
            </button>
          </div>
          {props.cadenza === "regolare" ? (
            <label className="block text-sm">
              Ripeti ogni
              <input
                value={props.ogniGiorni}
                onChange={(event) => props.onOgni(event.target.value)}
                inputMode="numeric"
                className="mt-1 w-24 rounded-lg border border-slate-300 px-2 py-2"
              />
              <span className="ml-2">giorni</span>
            </label>
          ) : (
            <div>
              <p className="text-sm text-slate-600">
                Clicca un giorno del calendario dentro il periodo per aggiungerlo o toglierlo.
              </p>
              <ul className="mt-2 max-h-24 space-y-1 overflow-y-auto text-sm">
                {props.dateScelte.length === 0 ? <li className="text-slate-500">Nessuna data scelta.</li> : null}
                {props.dateScelte.map((data) => (
                  <li key={data} className="flex items-center justify-between">
                    <span>{data}</span>
                    <button type="button" onClick={() => props.onTogliData(data)} className="text-sky-800">
                      Rimuovi
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
      {props.operazione !== "" ? (
        <>
          <label className="mt-3 block text-sm">
            Materia prima
            <select
              value={props.materiaId}
              onChange={(event) => props.onMateria(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2"
            >
              <option value="">Seleziona</option>
              {props.materie.map((voce) => (
                <option key={voce.id} value={voce.id}>
                  {voce.codice} · {voce.nome}
                  {voce.unitaMisura ? ` · ${voce.unitaMisura}` : " · unità da impostare"}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Quantità per ordine
              <input
                value={props.quantita}
                onChange={(event) => props.onQuantita(event.target.value)}
                inputMode="decimal"
                className="mt-1 w-28 rounded-lg border border-slate-300 px-2 py-2"
              />
            </label>
            <SelettoreUnita
              sigla={props.unitaSigla}
              nome={props.unitaNome}
              personalizzata={props.unitaPersonalizzata}
              onChange={props.onUnita}
            />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => props.onTipo("precisa")}
              className={`rounded-lg border px-2 py-2 text-sm ${props.tipoQuantita === "precisa" ? "border-slate-900" : "border-slate-300"}`}
            >
              Precisa
            </button>
            <button
              type="button"
              onClick={() => props.onTipo("stimata")}
              className={`rounded-lg border px-2 py-2 text-sm ${props.tipoQuantita === "stimata" ? "border-slate-900" : "border-slate-300"}`}
            >
              Stimata
            </button>
          </div>
          {props.operazione === "pianificazione" ? (
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={props.copiaQuantita}
                onChange={(event) => props.onCopia(event.target.checked)}
              />
              Copia la quantità su tutte le consegne
            </label>
          ) : null}
          <label className="mt-3 block text-sm">
            Fornitore abilitato
            <select
              value={props.fornitoreId}
              onChange={(event) => props.onFornitore(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              <option value="">Seleziona</option>
              {props.fornitori.map((fornitore) => (
                <option key={fornitore.id} value={fornitore.id}>
                  {fornitore.targa} · {fornitore.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Note
            <textarea
              value={props.note}
              onChange={(event) => props.onNote(event.target.value)}
              className="mt-1 min-h-16 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="mt-3 rounded-lg border border-slate-200 p-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anteprima</p>
            {props.anteprima == null ? null : props.anteprima.ok ? (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
                {props.anteprima.consegne.map((consegna) => (
                  <li key={consegna.data} className="flex items-center justify-between gap-2">
                    <span>
                      {consegna.data} · {consegna.tipoQuantita}
                    </span>
                    {props.operazione === "pianificazione" ? (
                      <span className="flex items-center gap-2">
                        <input
                          value={props.valoriQuantita[consegna.data] ?? (props.copiaQuantita ? props.quantita : "")}
                          onChange={(event) => props.onQuantitaData(consegna.data, event.target.value)}
                          inputMode="decimal"
                          aria-label={`Quantità ${consegna.data}`}
                          className="w-20 rounded border border-slate-300 px-2 py-1"
                        />
                        <SelettoreUnita
                          sigla={props.unitaSigla}
                          nome={props.unitaNome}
                          personalizzata={props.unitaPersonalizzata}
                          onChange={props.onUnita}
                        />
                      </span>
                    ) : (
                      <span>
                        {consegna.quantita} {etichettaUnita(consegna.unitaMisura)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-amber-900">{props.anteprima.motivo}</p>
            )}
          </div>
          <button
            type="button"
            disabled={props.pending || !props.fornitoreId || !props.materiaId || !unitaValida}
            onClick={props.onSalva}
            className="mt-3 w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            Salva bozza
          </button>
        </>
      ) : null}
    </div>
  );
}
