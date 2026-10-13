"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
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
  const [notaInModifica, setNotaInModifica] = useState<string | null>(null);
  const [bozzaElenco, setBozzaElenco] = useState<string[]>([]);
  const [bozzaChecklist, setBozzaChecklist] = useState<string[]>([]);
  const [inputElenco, setInputElenco] = useState("");
  const [inputChecklist, setInputChecklist] = useState("");
  const [esitoNuova, setEsitoNuova] = useState<{
    bersaglio: "nota" | "testo";
    estratto: string;
  } | null>(null);
  const testoNuovaRef = useRef<HTMLTextAreaElement>(null);

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

  function aggiungiBozza(tipo: "elenco" | "checklist") {
    const valore = (tipo === "elenco" ? inputElenco : inputChecklist).trim();
    if (!valore) return;
    if (tipo === "elenco") {
      setBozzaElenco((prev) => [...prev, valore]);
      setInputElenco("");
      return;
    }
    setBozzaChecklist((prev) => [...prev, valore]);
    setInputChecklist("");
  }

  function apriEsitoNuova(bersaglio: "nota" | "testo", estratto: string) {
    setEsito(null);
    setEsitoNuova({ bersaglio, estratto });
    setColore("verde");
    setProblema("");
    setModifica("");
    setError(null);
  }

  function esitoSuTestoNuova() {
    const campo = testoNuovaRef.current;
    const estratto = campo
      ? testo.slice(campo.selectionStart, campo.selectionEnd).trim()
      : "";
    if (!estratto) {
      setError("Seleziona un brano dentro il testo della nota.");
      return;
    }
    apriEsitoNuova("testo", estratto);
  }

  function salvaNota() {
    const istante = new Date(quando);
    if (Number.isNaN(istante.getTime())) {
      setError("Data e ora non valide.");
      return;
    }
    if (esitoNuova && !problema.trim()) {
      setError("Il problema riscontrato è obbligatorio.");
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
      for (const voce of bozzaElenco) {
        const aggiunta = await aggiungiVoceNotaAction({
          notaId: res.id,
          tipo: "elenco",
          testo: voce,
        });
        if (!aggiunta.success) {
          setError(aggiunta.error);
          reload();
          return;
        }
      }
      for (const voce of bozzaChecklist) {
        const aggiunta = await aggiungiVoceNotaAction({
          notaId: res.id,
          tipo: "checklist",
          testo: voce,
        });
        if (!aggiunta.success) {
          setError(aggiunta.error);
          reload();
          return;
        }
      }
      if (esitoNuova) {
        const esitoSalvato = await attribuisciEsitoNotaAction({
          notaId: res.id,
          bersaglio: esitoNuova.bersaglio,
          voceId: null,
          estrattoTesto: esitoNuova.estratto,
          colore,
          problema,
          modificaPrevista: modifica,
        });
        if (!esitoSalvato.success) {
          setError(esitoSalvato.error);
          reload();
          return;
        }
      }
      setTesto("");
      setDopoNumero("");
      setQuando(adessoLocale());
      setBozzaElenco([]);
      setBozzaChecklist([]);
      setInputElenco("");
      setInputChecklist("");
      setEsitoNuova(null);
      setProblema("");
      setModifica("");
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
    setEsitoNuova(null);
    setEsito(bozza);
    setColore("verde");
    setProblema("");
    setModifica("");
    setError(null);
  }

  function toggleModifica(notaId: string) {
    setEsito(null);
    setNotaInModifica((corrente) => (corrente === notaId ? null : notaId));
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
          ref={testoNuovaRef}
          value={testo}
          onChange={(e) => setTesto(e.target.value.slice(0, 8000))}
          rows={4}
          placeholder="Azione fatta"
          className="mt-3 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => apriEsitoNuova("nota", "")}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
          >
            Risultato sulla nota
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={esitoSuTestoNuova}
            className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
          >
            Risultato sul testo selezionato
          </button>
        </div>
        <BozzaVoci
          titolo="Elenco"
          placeholder="Voce di elenco"
          voci={bozzaElenco}
          valore={inputElenco}
          pending={pending}
          onValore={setInputElenco}
          onAggiungi={() => aggiungiBozza("elenco")}
        />
        <BozzaVoci
          titolo="Checklist"
          placeholder="Voce da spuntare"
          voci={bozzaChecklist}
          valore={inputChecklist}
          pending={pending}
          onValore={setInputChecklist}
          onAggiungi={() => aggiungiBozza("checklist")}
        />
        {esitoNuova ? (
          <PannelloEsito
            titolo={
              esitoNuova.bersaglio === "testo"
                ? `Risultato sul brano «${esitoNuova.estratto}»`
                : "Risultato sulla nota"
            }
            nomeRadio="colore-nuova"
            colore={colore}
            problema={problema}
            modifica={modifica}
            pending={pending}
            onColore={setColore}
            onProblema={setProblema}
            onModifica={setModifica}
            onChiudi={() => setEsitoNuova(null)}
          />
        ) : null}
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

      {note.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nessuna nota ancora.</p>
      ) : (
        <div className="relative mx-auto w-full max-w-6xl">
          <div
            className="pointer-events-none absolute bottom-2 left-4 top-2 w-0.5 bg-gradient-to-b from-slate-300 via-slate-400 to-slate-300 md:left-1/2 md:-translate-x-1/2"
            aria-hidden
          />
          <ol className="relative space-y-8 md:space-y-10">
            {note.map((nota, index) => {
              const aSinistra = index % 2 === 0;
              const ultimo = nota.esiti[nota.esiti.length - 1];
              const punto = ultimo ? COLORE_CLASSE[ultimo.colore] : "bg-slate-400";
              return (
                <li
                  key={nota.id}
                  className="relative grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-3 md:grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] md:gap-6"
                >
                  <div className="relative z-10 col-start-1 row-start-1 flex justify-center pt-3 md:col-start-2">
                    <span
                      className={`h-3.5 w-3.5 rounded-full ring-4 ring-white ${punto}`}
                      aria-hidden
                    />
                  </div>
                  <div
                    className={`col-start-2 row-start-1 min-w-0 ${
                      aSinistra ? "md:col-start-1" : "md:col-start-3"
                    }`}
                  >
                    <NotaCard
                      nota={nota}
                      lato={aSinistra ? "sinistra" : "destra"}
                      inModifica={notaInModifica === nota.id}
                      pending={pending}
                      bozzaVoce={bozzaVoce}
                      esito={esito?.notaId === nota.id ? esito : null}
                      colore={colore}
                      problema={problema}
                      modifica={modifica}
                      modificaAperta={modificaAperta}
                      modificaTesto={modificaTesto}
                      onToggleModifica={() => toggleModifica(nota.id)}
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
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
            <span aria-hidden>↑</span>
            <span>Inizio</span>
            <span className="mx-2 text-slate-300">·</span>
            <span>Ultima</span>
            <span aria-hidden>↓</span>
          </div>
        </div>
      )}
    </div>
  );
}

function NotaCard({
  nota,
  lato,
  inModifica,
  pending,
  bozzaVoce,
  esito,
  colore,
  problema,
  modifica,
  modificaAperta,
  modificaTesto,
  onToggleModifica,
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
  lato: "sinistra" | "destra";
  inModifica: boolean;
  pending: boolean;
  bozzaVoce: Record<string, string>;
  esito: BozzaEsito | null;
  colore: RsColore;
  problema: string;
  modifica: string;
  modificaAperta: string | null;
  modificaTesto: string;
  onToggleModifica: () => void;
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
    <article className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm shadow-sm">
      <div
        className={`flex flex-wrap items-center justify-between gap-2 ${
          lato === "sinistra" ? "md:flex-row-reverse" : ""
        }`}
      >
        <div
          className={`flex flex-wrap items-center gap-2 ${
            lato === "sinistra" ? "md:justify-end" : ""
          }`}
        >
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Nota {etichettaSequenzaNota(nota.numero, nota.suffisso)}
          </span>
          <time dateTime={nota.occurredAt} className="text-xs text-[var(--muted)]">
            {formatQuando(nota.occurredAt)}
          </time>
        </div>
        <button
          type="button"
          onClick={onToggleModifica}
          className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          {inModifica ? "Chiudi" : "Modifica"}
        </button>
      </div>
      <p ref={setTestoNodo} className="mt-2 whitespace-pre-wrap text-left text-sm text-slate-800">
        {nota.bodyText}
      </p>
      {inModifica ? (
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
      ) : null}

      <BloccoVoci
        titolo="Elenco"
        tipo="elenco"
        notaId={nota.id}
        voci={elenco}
        pending={pending}
        mostraAggiungi={inModifica}
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
        mostraAggiungi={inModifica}
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
        <PannelloEsito
          titolo={
            esito.bersaglio === "testo"
              ? `Risultato sul brano «${esito.estratto}»`
              : "Risultato"
          }
          nomeRadio={`colore-${nota.id}`}
          colore={colore}
          problema={problema}
          modifica={modifica}
          pending={pending}
          onColore={onColore}
          onProblema={onProblema}
          onModifica={onModifica}
          onSalva={onSalvaEsito}
          onChiudi={onChiudiEsito}
        />
      ) : null}
    </article>
  );
}

function BloccoVoci({
  titolo,
  tipo,
  notaId,
  voci,
  pending,
  mostraAggiungi,
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
  mostraAggiungi: boolean;
  bozza: string;
  onBozza: (valore: string) => void;
  onAggiungi: () => void;
  onToggle: (voceId: string, fatto: boolean) => void;
  onEsito: (voceId: string, etichetta: string) => void;
}) {
  if (!mostraAggiungi && voci.length === 0) return null;
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
            {mostraAggiungi ? (
              <button
                type="button"
                onClick={() => onEsito(voce.id, voce.testo)}
                className="text-xs underline"
              >
                Risultato
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {mostraAggiungi ? (
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
      ) : null}
    </div>
  );
}

function BozzaVoci({
  titolo,
  placeholder,
  voci,
  valore,
  pending,
  onValore,
  onAggiungi,
}: {
  titolo: string;
  placeholder: string;
  voci: string[];
  valore: string;
  pending: boolean;
  onValore: (valore: string) => void;
  onAggiungi: () => void;
}) {
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold">{titolo}</p>
      {voci.length > 0 ? (
        <ul className="mt-1 space-y-1">
          {voci.map((voce, index) => (
            <li key={`${voce}-${index}`} className="flex items-center gap-2 text-sm">
              <span className="text-slate-400">{titolo === "Checklist" ? "☐" : "•"}</span>
              <span>{voce}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-1 flex gap-2">
        <input
          value={valore}
          onChange={(e) => onValore(e.target.value.slice(0, 500))}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-lg border border-[var(--border)] px-2 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={pending || !valore.trim()}
          onClick={onAggiungi}
          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
        >
          Aggiungi
        </button>
      </div>
    </div>
  );
}

function PannelloEsito({
  titolo,
  nomeRadio,
  colore,
  problema,
  modifica,
  pending,
  onColore,
  onProblema,
  onModifica,
  onSalva,
  onChiudi,
}: {
  titolo: string;
  nomeRadio: string;
  colore: RsColore;
  problema: string;
  modifica: string;
  pending: boolean;
  onColore: (colore: RsColore) => void;
  onProblema: (valore: string) => void;
  onModifica: (valore: string) => void;
  onSalva?: () => void;
  onChiudi: () => void;
}) {
  return (
    <div className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3">
      <p className="text-xs font-semibold">{titolo}</p>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        {(Object.keys(COLORE_LABEL) as RsColore[]).map((tono) => (
          <label key={tono} className="flex items-center gap-2">
            <input
              type="radio"
              name={nomeRadio}
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
        {onSalva ? (
          <button
            type="button"
            disabled={pending || !problema.trim()}
            onClick={onSalva}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Salva risultato
          </button>
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Il risultato si salva insieme alla nota.
          </p>
        )}
        <button
          type="button"
          onClick={onChiudi}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs"
        >
          Chiudi
        </button>
      </div>
    </div>
  );
}
