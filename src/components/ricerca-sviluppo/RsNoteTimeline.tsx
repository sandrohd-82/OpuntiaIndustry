"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { getRicercaAction } from "@/app/actions/ricerca-sviluppo";
import {
  aggiungiVoceNotaAction,
  attribuisciEsitoNotaAction,
  completaModificaEsitoAction,
  creaNotaRicercaAction,
  listNoteRicercaAction,
  segnaVoceNotaAction,
} from "@/app/actions/ricerca-sviluppo-note";
import {
  etichettaSequenzaNota,
  type RsBersaglio,
  type RsColore,
  type RsRicerca,
  type RsTimelineNota,
} from "@/lib/ricerca-sviluppo/types";

const COLORE_CLASSE: Record<RsColore, string> = {
  verde: "bg-emerald-500",
  giallo: "bg-amber-400",
  rosso: "bg-red-500",
};

const COLORE_LABEL: Record<RsColore, string> = {
  verde: "Verde — utile e riuscita",
  giallo: "Giallo — utile, da correggere",
  rosso: "Rosso — dannosa",
};

function adessoLocale(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatQuando(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type BozzaEsito = {
  notaId: string;
  bersaglio: RsBersaglio;
  voceId: string | null;
  estratto: string;
};

export function RsNoteTimeline({ ricercaId }: { ricercaId: string }) {
  const [ricerca, setRicerca] = useState<RsRicerca | null>(null);
  const [note, setNote] = useState<RsTimelineNota[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [quando, setQuando] = useState(adessoLocale);
  const [testo, setTesto] = useState("");
  const [dopoNumero, setDopoNumero] = useState("");
  const [bozzaVoce, setBozzaVoce] = useState<Record<string, string>>({});
  const [esito, setEsito] = useState<BozzaEsito | null>(null);
  const [colore, setColore] = useState<RsColore>("verde");
  const [problema, setProblema] = useState("");
  const [modifica, setModifica] = useState("");
  const [modificaAperta, setModificaAperta] = useState<string | null>(null);
  const [modificaTesto, setModificaTesto] = useState("");

  const reload = useCallback(() => {
    startTransition(async () => {
      const [ric, lista] = await Promise.all([
        getRicercaAction(ricercaId),
        listNoteRicercaAction(ricercaId),
      ]);
      if (!ric.success) {
        setError(ric.error);
        return;
      }
      if (!lista.success) {
        setError(lista.error);
        return;
      }
      setRicerca(ric.item);
      setNote(lista.items);
      setError(null);
    });
  }, [ricercaId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const numeriBase = useMemo(
    () => note.filter((nota) => !nota.suffisso).map((nota) => nota.numero),
    [note]
  );

  const sectionHref =
    ricerca?.tipo === "materia_prima"
      ? "/app/ricerca-sviluppo/ricerche-materie-prime/elenco"
      : "/app/ricerca-sviluppo/ricerche-processi/elenco";

  const soggetto =
    ricerca?.soggettoModo === "catalogo"
      ? (ricerca.prodottoEtichetta ?? "Prodotto da catalogo")
      : ricerca?.soggettoLibero || "";

  function salvaNota() {
    const istante = new Date(quando);
    if (Number.isNaN(istante.getTime())) {
      setError("Data e ora non valide.");
      return;
    }
    startTransition(async () => {
      const res = await creaNotaRicercaAction({
        ricercaId,
        bodyText: testo,
        occurredAt: istante.toISOString(),
        dopoNumero: dopoNumero ? Number(dopoNumero) : null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setTesto("");
      setDopoNumero("");
      setQuando(adessoLocale());
      reload();
    });
  }

  function aggiungiVoce(notaId: string, tipo: "elenco" | "checklist") {
    const chiave = `${notaId}:${tipo}`;
    const valore = (bozzaVoce[chiave] ?? "").trim();
    if (!valore) return;
    startTransition(async () => {
      const res = await aggiungiVoceNotaAction({ notaId, tipo, testo: valore });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozzaVoce((prev) => ({ ...prev, [chiave]: "" }));
      reload();
    });
  }

  function apriEsito(bozza: BozzaEsito) {
    setEsito(bozza);
    setColore("verde");
    setProblema("");
    setModifica("");
    setError(null);
  }

  function esitoSuTesto(notaId: string, root: HTMLElement | null) {
    const selezione = window.getSelection();
    const estratto = selezione?.toString().trim() ?? "";
    if (!estratto || !root || !selezione?.anchorNode || !root.contains(selezione.anchorNode)) {
      setError("Seleziona un brano dentro il testo della nota.");
      return;
    }
    apriEsito({ notaId, bersaglio: "testo", voceId: null, estratto });
  }

  function salvaEsito() {
    if (!esito) return;
    startTransition(async () => {
      const res = await attribuisciEsitoNotaAction({
        notaId: esito.notaId,
        bersaglio: esito.bersaglio,
        voceId: esito.voceId,
        estrattoTesto: esito.estratto,
        colore,
        problema,
        modificaPrevista: modifica,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setEsito(null);
      reload();
    });
  }

  function salvaModifica(esitoId: string) {
    startTransition(async () => {
      const res = await completaModificaEsitoAction({
        esitoId,
        modificaPrevista: modificaTesto,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setModificaAperta(null);
      setModificaTesto("");
      reload();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={sectionHref} className="text-sm text-[var(--muted)] hover:underline">
          ← Elenco
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">{ricerca?.titolo ?? "…"}</h1>
          <p className="text-xs text-[var(--muted)]">
            {ricerca
              ? [
                  ricerca.tipoVoceNome,
                  soggetto,
                  ricerca.stato,
                  `v${ricerca.versione}`,
                  ricerca.dataInizioPresunta
                    ? `inizio ${new Date(ricerca.dataInizioPresunta + "T12:00:00").toLocaleDateString("it-IT")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Caricamento…"}
          </p>
          {ricerca?.descrizione ? (
            <p className="mt-1 text-sm text-slate-700">{ricerca.descrizione}</p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="text-sm font-semibold">Nuova nota</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          In coda prende il numero successivo. Per infilarla dopo un numero già
          dato, scegli quel numero: diventa 7-a, 7-b, e gli altri numeri restano.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <label className="text-xs font-medium">
            Data e ora
            <input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-xs font-medium">
            Inserimento
            <select
              value={dopoNumero}
              onChange={(e) => setDopoNumero(e.target.value)}
              className="mt-1 block rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">In coda</option>
              {numeriBase.map((numero) => (
                <option key={numero} value={numero}>
                  Dopo il {numero}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={testo}
          onChange={(e) => setTesto(e.target.value.slice(0, 8000))}
          rows={4}
          placeholder="Azione fatta"
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={pending || !testo.trim()}
          onClick={salvaNota}
          className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Salvataggio…" : "Aggiungi nota"}
        </button>
      </section>

      <p className="text-xs text-[var(--muted)]">
        Semaforo: <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" /> utile e
        riuscita, <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400" /> da
        correggere, <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" /> dannosa.
        Il problema è obbligatorio. La prossima modifica si può scrivere dopo.
      </p>

      <ol className="space-y-4">
        {note.length === 0 ? (
          <li className="text-sm text-[var(--muted)]">Nessuna nota ancora.</li>
        ) : (
          note.map((nota) => (
            <NotaCard
              key={nota.id}
              nota={nota}
              pending={pending}
              bozzaVoce={bozzaVoce}
              esito={esito?.notaId === nota.id ? esito : null}
              colore={colore}
              problema={problema}
              modifica={modifica}
              modificaAperta={modificaAperta}
              modificaTesto={modificaTesto}
              onBozzaVoce={(chiave, valore) =>
                setBozzaVoce((prev) => ({ ...prev, [chiave]: valore }))
              }
              onAggiungiVoce={aggiungiVoce}
              onToggle={(voceId, fatto) => {
                startTransition(async () => {
                  const res = await segnaVoceNotaAction({ voceId, fatto });
                  if (!res.success) setError(res.error);
                  else reload();
                });
              }}
              onEsitoNota={() =>
                apriEsito({
                  notaId: nota.id,
                  bersaglio: "nota",
                  voceId: null,
                  estratto: "",
                })
              }
              onEsitoTesto={(root) => esitoSuTesto(nota.id, root)}
              onEsitoVoce={(voceId, etichetta) =>
                apriEsito({
                  notaId: nota.id,
                  bersaglio: "voce",
                  voceId,
                  estratto: etichetta,
                })
              }
              onColore={setColore}
              onProblema={setProblema}
              onModifica={setModifica}
              onSalvaEsito={salvaEsito}
              onChiudiEsito={() => setEsito(null)}
              onApriModifica={(id) => {
                setModificaAperta(id);
                setModificaTesto("");
              }}
              onModificaTesto={setModificaTesto}
              onSalvaModifica={salvaModifica}
            />
          ))
        )}
      </ol>
    </div>
  );
}

function NotaCard({
  nota,
  pending,
  bozzaVoce,
  esito,
  colore,
  problema,
  modifica,
  modificaAperta,
  modificaTesto,
  onBozzaVoce,
  onAggiungiVoce,
  onToggle,
  onEsitoNota,
  onEsitoTesto,
  onEsitoVoce,
  onColore,
  onProblema,
  onModifica,
  onSalvaEsito,
  onChiudiEsito,
  onApriModifica,
  onModificaTesto,
  onSalvaModifica,
}: {
  nota: RsTimelineNota;
  pending: boolean;
  bozzaVoce: Record<string, string>;
  esito: BozzaEsito | null;
  colore: RsColore;
  problema: string;
  modifica: string;
  modificaAperta: string | null;
  modificaTesto: string;
  onBozzaVoce: (chiave: string, valore: string) => void;
  onAggiungiVoce: (notaId: string, tipo: "elenco" | "checklist") => void;
  onToggle: (voceId: string, fatto: boolean) => void;
  onEsitoNota: () => void;
  onEsitoTesto: (root: HTMLElement | null) => void;
  onEsitoVoce: (voceId: string, etichetta: string) => void;
  onColore: (colore: RsColore) => void;
  onProblema: (valore: string) => void;
  onModifica: (valore: string) => void;
  onSalvaEsito: () => void;
  onChiudiEsito: () => void;
  onApriModifica: (id: string) => void;
  onModificaTesto: (valore: string) => void;
  onSalvaModifica: (id: string) => void;
}) {
  const [testoNodo, setTestoNodo] = useState<HTMLElement | null>(null);
  const elenco = nota.voci.filter((voce) => voce.tipo === "elenco");
  const checklist = nota.voci.filter((voce) => voce.tipo === "checklist");

  return (
    <li className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-semibold text-white">
          {etichettaSequenzaNota(nota.numero, nota.suffisso)}
        </span>
        <span className="text-xs text-[var(--muted)]">{formatQuando(nota.occurredAt)}</span>
      </div>
      <p ref={setTestoNodo} className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
        {nota.bodyText}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEsitoNota}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
        >
          Risultato sulla nota
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onEsitoTesto(testoNodo)}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
        >
          Risultato sul testo selezionato
        </button>
      </div>

      <BloccoVoci
        titolo="Elenco"
        tipo="elenco"
        notaId={nota.id}
        voci={elenco}
        pending={pending}
        bozza={bozzaVoce[`${nota.id}:elenco`] ?? ""}
        onBozza={(valore) => onBozzaVoce(`${nota.id}:elenco`, valore)}
        onAggiungi={() => onAggiungiVoce(nota.id, "elenco")}
        onToggle={onToggle}
        onEsito={onEsitoVoce}
      />
      <BloccoVoci
        titolo="Checklist"
        tipo="checklist"
        notaId={nota.id}
        voci={checklist}
        pending={pending}
        bozza={bozzaVoce[`${nota.id}:checklist`] ?? ""}
        onBozza={(valore) => onBozzaVoce(`${nota.id}:checklist`, valore)}
        onAggiungi={() => onAggiungiVoce(nota.id, "checklist")}
        onToggle={onToggle}
        onEsito={onEsitoVoce}
      />

      {nota.esiti.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {nota.esiti.map((riga) => (
            <li key={riga.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
              <p className="flex items-center gap-2 font-medium text-slate-800">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${COLORE_CLASSE[riga.colore]}`} />
                {COLORE_LABEL[riga.colore]}
                {riga.bersaglio === "testo" ? ` — «${riga.estrattoTesto}»` : null}
                {riga.bersaglio === "voce"
                  ? ` — ${nota.voci.find((voce) => voce.id === riga.voceId)?.testo ?? "voce"}`
                  : null}
              </p>
              <p className="mt-1 text-slate-700">Problema: {riga.problema}</p>
              {riga.modificaPrevista ? (
                <p className="mt-1 text-slate-700">Prossima modifica: {riga.modificaPrevista}</p>
              ) : modificaAperta === riga.id ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={modificaTesto}
                    onChange={(e) => onModificaTesto(e.target.value.slice(0, 2000))}
                    rows={2}
                    placeholder="Prossima modifica"
                    className="w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    disabled={pending || !modificaTesto.trim()}
                    onClick={() => onSalvaModifica(riga.id)}
                    className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-50"
                  >
                    Salva modifica
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onApriModifica(riga.id)}
                  className="mt-1 text-xs underline"
                >
                  Compila la prossima modifica
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {esito ? (
        <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
          <p className="text-xs font-semibold">
            Risultato
            {esito.bersaglio === "testo" ? ` sul brano «${esito.estratto}»` : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            {(Object.keys(COLORE_LABEL) as RsColore[]).map((tono) => (
              <label key={tono} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`colore-${nota.id}`}
                  checked={colore === tono}
                  onChange={() => onColore(tono)}
                />
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${COLORE_CLASSE[tono]}`} />
                {COLORE_LABEL[tono]}
              </label>
            ))}
          </div>
          <label className="mt-2 block text-xs font-medium">
            Problema riscontrato
            <textarea
              value={problema}
              onChange={(e) => onProblema(e.target.value.slice(0, 2000))}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="mt-2 block text-xs font-medium">
            Prossima modifica (si può lasciare vuota)
            <textarea
              value={modifica}
              onChange={(e) => onModifica(e.target.value.slice(0, 2000))}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending || !problema.trim()}
              onClick={onSalvaEsito}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Salva risultato
            </button>
            <button
              type="button"
              onClick={onChiudiEsito}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              Chiudi
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

function BloccoVoci({
  titolo,
  tipo,
  notaId,
  voci,
  pending,
  bozza,
  onBozza,
  onAggiungi,
  onToggle,
  onEsito,
}: {
  titolo: string;
  tipo: "elenco" | "checklist";
  notaId: string;
  voci: RsTimelineNota["voci"];
  pending: boolean;
  bozza: string;
  onBozza: (valore: string) => void;
  onAggiungi: () => void;
  onToggle: (voceId: string, fatto: boolean) => void;
  onEsito: (voceId: string, etichetta: string) => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold">{titolo}</p>
      <ul className="mt-1 space-y-1">
        {voci.map((voce) => (
          <li key={voce.id} className="flex flex-wrap items-center gap-2 text-sm">
            {tipo === "checklist" ? (
              <input
                type="checkbox"
                checked={voce.fatto}
                onChange={(e) => onToggle(voce.id, e.target.checked)}
              />
            ) : (
              <span className="text-slate-400">•</span>
            )}
            <span className={voce.fatto ? "text-slate-500 line-through" : ""}>{voce.testo}</span>
            <button
              type="button"
              onClick={() => onEsito(voce.id, voce.testo)}
              className="text-xs underline"
            >
              Risultato
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex gap-2">
        <input
          value={bozza}
          onChange={(e) => onBozza(e.target.value.slice(0, 500))}
          placeholder={tipo === "checklist" ? "Voce da spuntare" : "Voce di elenco"}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
          aria-label={`${titolo} ${notaId}`}
        />
        <button
          type="button"
          disabled={pending || !bozza.trim()}
          onClick={onAggiungi}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
        >
          Aggiungi
        </button>
      </div>
    </div>
  );
}
