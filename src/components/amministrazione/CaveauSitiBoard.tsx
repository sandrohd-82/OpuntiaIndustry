"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  aggiornaCaveauAcquistoAction,
  aggiornaCaveauSitoAction,
  apriCaveauAcquistoDocumentoAction,
  caricaCaveauAcquistoDocumentoAction,
  creaCaveauAcquistoAction,
  creaCaveauSitoAction,
  creaCaveauUnitaAction,
  eliminaCaveauAcquistoAction,
  eliminaCaveauAcquistoDocumentoAction,
  eliminaCaveauSitoAction,
  inviaCodiceCaveauAction,
  listCaveauSitiAction,
  rivelaPasswordCaveauAction,
} from "@/app/actions/caveau-siti";
import {
  CAVEAU_UNITA_BASE,
  type CaveauAcquistoDocumento,
  type CaveauAcquistoRiga,
  type CaveauSitoRiga,
} from "@/lib/amministrazione/caveau-siti";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";

type Bozza = {
  id: string | null;
  nome: string;
  url: string;
  mail: string;
  password: string;
};

const vuota: Bozza = { id: null, nome: "", url: "", mail: "", password: "" };

type AcquistoBozza = {
  id: string | null;
  sitoId: string;
  sitoNome: string;
  url: string;
  titolo: string;
  descrizione: string;
  prezzo: string;
  unita: string;
  registratoAt: string;
};

function hrefEsterno(raw: string): string | null {
  const testo = raw.trim();
  if (!testo) return null;
  const conProtocollo = /^https?:\/\//i.test(testo) ? testo : `https://${testo}`;
  try {
    const url = new URL(conProtocollo);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function formatPeso(byte: number): string {
  if (byte < 1024) return `${byte} B`;
  if (byte < 1024 * 1024) return `${Math.round(byte / 1024)} KB`;
  return `${(byte / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

type DocNuovo = { key: string; nome: string; file: File | null };

function docVuoto(): DocNuovo {
  return { key: crypto.randomUUID(), nome: "", file: null };
}

function RiquadroFile({
  file,
  onFile,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
}) {
  const inputId = useId();
  const [sopra, setSopra] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setSopra(true);
      }}
      onDragLeave={() => setSopra(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSopra(false);
        const scelto = e.dataTransfer.files?.[0];
        if (scelto) onFile(scelto);
      }}
      className={`rounded-xl border-2 border-dashed px-4 py-4 text-center ${
        sopra ? "border-slate-900 bg-white" : "border-slate-300 bg-slate-50"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="mx-auto h-8 w-8 text-slate-500"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M7 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10.5A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
        <path d="M14 3.5V8.5H19" />
        <path d="M12 17v-5" />
        <path d="M9.5 13.5 12 11l2.5 2.5" />
      </svg>
      <p className="mt-2 text-sm font-medium text-slate-800">
        {file ? file.name : "Trascina il file oppure scegli"}
      </p>
      <p className="mt-1 text-xs text-slate-500">
        {file ? formatPeso(file.size) : "PDF, immagini, Word o Excel, fino a 15 MB"}
      </p>
      <label
        htmlFor={inputId}
        className="mt-3 inline-flex cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white"
      >
        Scegli file
      </label>
      <input
        id={inputId}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const scelto = e.target.files?.[0];
          if (scelto) onFile(scelto);
          e.target.value = "";
        }}
      />
      {file ? (
        <button
          type="button"
          className="mt-2 text-xs text-slate-600 underline"
          onClick={() => onFile(null)}
        >
          Togli file
        </button>
      ) : null}
    </div>
  );
}

function adessoLocale(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function versoLocale(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatPrezzo(valore: number | null, unita: string): string {
  const importo =
    valore == null
      ? ""
      : valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  if (!importo && !unita) return "—";
  if (!unita) return importo;
  if (!importo) return unita;
  return `${importo} / ${unita}`;
}

function prezzoTesto(valore: number | null): string {
  if (valore == null) return "";
  return String(valore).replace(".", ",");
}

type Verso = "asc" | "desc";
type CampoSito = "nome" | "url" | "mail" | "versione";
type CampoAcquisto = "registratoAt" | "titolo" | "url" | "descrizione" | "prezzo";

function valoreOrdine(
  a: string | number | null,
  b: string | number | null,
  verso: Verso
): number {
  const vuoto = (v: string | number | null) => v == null || v === "";
  if (vuoto(a) && vuoto(b)) return 0;
  if (vuoto(a)) return 1;
  if (vuoto(b)) return -1;
  const base =
    typeof a === "number" && typeof b === "number"
      ? a - b
      : String(a).localeCompare(String(b), "it", { numeric: true, sensitivity: "base" });
  return verso === "asc" ? base : -base;
}

function DescrizioneDueRighe({
  testo,
  onLeggi,
}: {
  testo: string;
  onLeggi: () => void;
}) {
  const pieno = useRef<HTMLParagraphElement>(null);
  const stretto = useRef<HTMLParagraphElement>(null);
  const [tagliata, setTagliata] = useState(false);

  useEffect(() => {
    const intero = pieno.current;
    const visibile = stretto.current;
    if (!intero || !visibile) return;
    setTagliata(intero.scrollHeight > visibile.clientHeight + 1);
  }, [testo]);

  if (!testo.trim()) return <span>—</span>;

  return (
    <div className="relative max-w-xs">
      <p
        ref={pieno}
        aria-hidden="true"
        className="invisible absolute inset-x-0 whitespace-pre-wrap"
      >
        {testo}
      </p>
      <p
        ref={stretto}
        className="whitespace-pre-wrap text-slate-600"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {testo}
      </p>
      {tagliata ? (
        <button
          type="button"
          className="mt-1 text-xs text-sky-800 underline"
          onClick={onLeggi}
        >
          Leggi altro
        </button>
      ) : null}
    </div>
  );
}

function IntestazioneOrdine({
  children,
  attivo,
  verso,
  onClick,
}: {
  children: string;
  attivo: boolean;
  verso: Verso;
  onClick: () => void;
}) {
  const segno = attivo ? (verso === "asc" ? "↑" : "↓") : "↕";
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800"
    >
      {children}
      <span aria-hidden="true">{segno}</span>
    </button>
  );
}

function formatQuando(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export function CaveauSitiBoard() {
  const formTitleId = useId();
  const rivelaTitleId = useId();
  const [righe, setRighe] = useState<CaveauSitoRiga[]>([]);
  const [unitaExtra, setUnitaExtra] = useState<string[]>([]);
  const [unitaAperta, setUnitaAperta] = useState(false);
  const [nuovaUnita, setNuovaUnita] = useState("");
  const [ordineSiti, setOrdineSiti] = useState<{ campo: CampoSito; verso: Verso }>({
    campo: "nome",
    verso: "asc",
  });
  const [ordineAcquisti, setOrdineAcquisti] = useState<
    Record<string, { campo: CampoAcquisto; verso: Verso }>
  >({});
  const [acquistiAperti, setAcquistiAperti] = useState<Record<string, boolean>>({});
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [elimina, setElimina] = useState<CaveauSitoRiga | null>(null);
  const [conferma, setConferma] = useState("");
  const [rivela, setRivela] = useState<CaveauSitoRiga | null>(null);
  const [codice, setCodice] = useState("");
  const [passwordVista, setPasswordVista] = useState<string | null>(null);
  const [codiceInviatoA, setCodiceInviatoA] = useState<string | null>(null);
  const [acquisto, setAcquisto] = useState<AcquistoBozza | null>(null);
  const [documentiNuovi, setDocumentiNuovi] = useState<DocNuovo[]>(() => [docVuoto()]);
  const [documentiSalvati, setDocumentiSalvati] = useState<CaveauAcquistoDocumento[]>([]);
  const [documentoDaRimuovere, setDocumentoDaRimuovere] =
    useState<CaveauAcquistoDocumento | null>(null);
  const [eliminaAcquisto, setEliminaAcquisto] = useState<CaveauAcquistoRiga | null>(null);
  const [descrizioneAperta, setDescrizioneAperta] = useState<{
    titolo: string;
    testo: string;
  } | null>(null);
  const acquistoTitleId = useId();
  const unitaTitleId = useId();
  const descrizioneTitleId = useId();

  const sitiOrdinati = useMemo(
    () =>
      [...righe].sort((a, b) =>
        valoreOrdine(a[ordineSiti.campo], b[ordineSiti.campo], ordineSiti.verso)
      ),
    [righe, ordineSiti]
  );

  function cliccaOrdineSiti(campo: CampoSito) {
    setOrdineSiti((prev) =>
      prev.campo === campo
        ? { campo, verso: prev.verso === "asc" ? "desc" : "asc" }
        : { campo, verso: "asc" }
    );
  }

  function cliccaOrdineAcquisti(sitoId: string, campo: CampoAcquisto) {
    setOrdineAcquisti((prev) => {
      const corrente = prev[sitoId] ?? { campo: "registratoAt" as const, verso: "desc" as const };
      const prossimo =
        corrente.campo === campo
          ? { campo, verso: corrente.verso === "asc" ? ("desc" as const) : ("asc" as const) }
          : { campo, verso: "asc" as const };
      return { ...prev, [sitoId]: prossimo };
    });
  }

  const load = useCallback(async () => {
    const res = await listCaveauSitiAction();
    if (!res.ok) {
      setErrore(res.error);
      setRighe([]);
      return [];
    }
    setErrore(null);
    setRighe(res.righe);
    setUnitaExtra(res.unitaExtra);
    return res.righe;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function salva() {
    if (!bozza || busy) return;
    setBusy(true);
    setErrore(null);
    const res = bozza.id
      ? await aggiornaCaveauSitoAction({
          id: bozza.id,
          nome: bozza.nome,
          url: bozza.url,
          mail: bozza.mail,
          password: bozza.password,
        })
      : await creaCaveauSitoAction({
          nome: bozza.nome,
          url: bozza.url,
          mail: bozza.mail,
          password: bozza.password,
        });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setBozza(null);
    await load();
  }

  async function confermaElimina() {
    if (!elimina || busy) return;
    setBusy(true);
    setErrore(null);
    const res = await eliminaCaveauSitoAction({ id: elimina.id, conferma });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setElimina(null);
    setConferma("");
    await load();
  }

  async function scopri() {
    if (!rivela || busy) return;
    setBusy(true);
    setErrore(null);
    const res = await rivelaPasswordCaveauAction({ id: rivela.id, codice });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      setPasswordVista(null);
      return;
    }
    setPasswordVista(res.password);
    setCodice("");
  }

  function chiudiRivela() {
    setRivela(null);
    setCodice("");
    setPasswordVista(null);
    setCodiceInviatoA(null);
  }

  async function inviaCodice() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    const res = await inviaCodiceCaveauAction();
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setCodiceInviatoA(res.email);
  }

  function nuovoAcquisto(sito: CaveauSitoRiga) {
    setErrore(null);
    setDocumentiSalvati([]);
    setDocumentiNuovi([docVuoto()]);
    setAcquisto({
      id: null,
      sitoId: sito.id,
      sitoNome: sito.nome,
      url: "",
      titolo: "",
      descrizione: "",
      prezzo: "",
      unita: "",
      registratoAt: adessoLocale(),
    });
  }

  async function apriDocumento(id: string) {
    const res = await apriCaveauAcquistoDocumentoAction({ id });
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  async function confermaRimuoviDocumento() {
    if (!documentoDaRimuovere || busy) return;
    setBusy(true);
    setErrore(null);
    const res = await eliminaCaveauAcquistoDocumentoAction({ id: documentoDaRimuovere.id });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setDocumentiSalvati((prev) => prev.filter((voce) => voce.id !== documentoDaRimuovere.id));
    setDocumentoDaRimuovere(null);
    await load();
  }

  async function salvaAcquisto() {
    if (!acquisto || busy) return;
    const compilati = documentiNuovi.filter((doc) => doc.nome.trim() || doc.file);
    if (compilati.some((doc) => !doc.nome.trim() || !doc.file)) {
      setErrore("Ogni documento vuole un nome e un file.");
      return;
    }
    setBusy(true);
    setErrore(null);
    try {
      await salvaAcquistoPronto(compilati);
    } catch {
      setBusy(false);
      setErrore("Salvataggio non riuscito. Riprova.");
    }
  }

  async function salvaAcquistoPronto(compilati: DocNuovo[]) {
    if (!acquisto) {
      setBusy(false);
      return;
    }
    const payload = {
      sitoId: acquisto.sitoId,
      url: acquisto.url,
      titolo: acquisto.titolo,
      descrizione: acquisto.descrizione,
      prezzo: acquisto.prezzo,
      unitaMisura: acquisto.unita,
      registratoAt: acquisto.registratoAt,
    };
    const res = acquisto.id
      ? await aggiornaCaveauAcquistoAction({ ...payload, id: acquisto.id })
      : await creaCaveauAcquistoAction(payload);
    if (!res.ok) {
      setBusy(false);
      setErrore(res.error);
      return;
    }
    const rimasti: DocNuovo[] = [];
    let messaggio = "";
    let interrotto = false;
    for (const doc of compilati) {
      if (interrotto || !doc.file) {
        rimasti.push(doc);
        continue;
      }
      const body = new FormData();
      body.set("acquistoId", res.id);
      body.set("nome", doc.nome.trim());
      body.set("file", doc.file);
      const caricato = await caricaCaveauAcquistoDocumentoAction(body);
      if (!caricato.ok) {
        rimasti.push(doc);
        interrotto = true;
        messaggio = `Acquisto salvato. «${doc.nome.trim()}» non è stato caricato: ${caricato.error}`;
      }
    }
    setBusy(false);
    if (interrotto) {
      setAcquisto({ ...acquisto, id: res.id });
      setDocumentiNuovi(rimasti.length > 0 ? rimasti : [docVuoto()]);
      const aggiornate = await load();
      const trovato = aggiornate
        .flatMap((sito) => sito.acquisti)
        .find((voce) => voce.id === res.id);
      if (trovato) setDocumentiSalvati(trovato.documenti);
      setErrore(messaggio);
      return;
    }
    setAcquisto(null);
    setDocumentiSalvati([]);
    setDocumentiNuovi([docVuoto()]);
    await load();
  }

  async function salvaUnita() {
    if (busy) return;
    setBusy(true);
    setErrore(null);
    const res = await creaCaveauUnitaAction({ sigla: nuovaUnita });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setUnitaExtra((prev) =>
      prev.includes(res.sigla) ? prev : [...prev, res.sigla].sort((a, b) => a.localeCompare(b, "it"))
    );
    setAcquisto((corrente) => (corrente ? { ...corrente, unita: res.sigla } : corrente));
    setNuovaUnita("");
    setUnitaAperta(false);
  }

  async function confermaEliminaAcquisto() {
    if (!eliminaAcquisto || busy) return;
    setBusy(true);
    setErrore(null);
    const res = await eliminaCaveauAcquistoAction({
      id: eliminaAcquisto.id,
      conferma,
    });
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setEliminaAcquisto(null);
    setConferma("");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Elenco dei siti a cui l&apos;azienda è registrata. Mail e password si possono
          lasciare vuote e completare dopo: gli acquisti si aggiungono comunque. La
          password, se c&apos;è, resta cifrata e si mostra solo con il codice inviato per
          email al Super Admin.
        </p>
        <button
          type="button"
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          onClick={() => {
            setErrore(null);
            setBozza({ ...vuota });
          }}
        >
          Nuovo sito
        </button>
      </div>

      {errore ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errore}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2">
                <IntestazioneOrdine
                  attivo={ordineSiti.campo === "nome"}
                  verso={ordineSiti.verso}
                  onClick={() => cliccaOrdineSiti("nome")}
                >
                  Sito
                </IntestazioneOrdine>
              </th>
              <th className="px-3 py-2">
                <IntestazioneOrdine
                  attivo={ordineSiti.campo === "url"}
                  verso={ordineSiti.verso}
                  onClick={() => cliccaOrdineSiti("url")}
                >
                  URL
                </IntestazioneOrdine>
              </th>
              <th className="px-3 py-2">
                <IntestazioneOrdine
                  attivo={ordineSiti.campo === "mail"}
                  verso={ordineSiti.verso}
                  onClick={() => cliccaOrdineSiti("mail")}
                >
                  Mail
                </IntestazioneOrdine>
              </th>
              <th className="px-3 py-2">Password</th>
              <th className="px-3 py-2">
                <IntestazioneOrdine
                  attivo={ordineSiti.campo === "versione"}
                  verso={ordineSiti.verso}
                  onClick={() => cliccaOrdineSiti("versione")}
                >
                  Versione
                </IntestazioneOrdine>
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {righe.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-slate-500">
                  Nessun sito registrato.
                </td>
              </tr>
            ) : (
              sitiOrdinati.map((riga) => (
                <Fragment key={riga.id}>
                  <tr className="border-t border-slate-200">
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {riga.nome}
                      <div className="text-xs font-normal text-slate-500">
                        {formatQuando(riga.updatedAt)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {/^https?:\/\//i.test(riga.url) ? (
                        <a
                          href={riga.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-800 underline"
                        >
                          {riga.url}
                        </a>
                      ) : (
                        <span className="text-slate-700">{riga.url}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-700">{riga.mail || "—"}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">
                      {riga.haPassword ? "••••••••" : "Da completare"}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{riga.versione}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        onClick={() => {
                          setErrore(null);
                          if (!riga.haPassword) {
                            setErrore(
                              "Password non ancora registrata. Si può aggiungere da Modifica."
                            );
                            return;
                          }
                          setRivela(riga);
                          setCodice("");
                          setPasswordVista(null);
                          setCodiceInviatoA(null);
                        }}
                        >
                          Mostra
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                          onClick={() => {
                            setErrore(null);
                            setBozza({
                              id: riga.id,
                              nome: riga.nome,
                              url: riga.url,
                              mail: riga.mail,
                              password: "",
                            });
                          }}
                        >
                          Modifica
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-700"
                          onClick={() => {
                            setErrore(null);
                            setElimina(riga);
                            setConferma("");
                          }}
                        >
                          Elimina
                        </button>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-t border-slate-100 bg-slate-50">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          aria-expanded={Boolean(acquistiAperti[riga.id])}
                          className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"
                          onClick={() =>
                            setAcquistiAperti((prev) => ({
                              ...prev,
                              [riga.id]: !prev[riga.id],
                            }))
                          }
                        >
                          <span aria-hidden="true">
                            {acquistiAperti[riga.id] ? "▾" : "▸"}
                          </span>
                          {acquistiAperti[riga.id] ? "Nascondi acquisti" : "Mostra acquisti"} (
                          {riga.acquisti.length})
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                          onClick={() => nuovoAcquisto(riga)}
                        >
                          Nuovo acquisto
                        </button>
                      </div>
                      {acquistiAperti[riga.id] ? (
                        (riga.acquisti.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">Nessun acquisto registrato.</p>
                        ) : (
                        <table className="mt-3 min-w-full text-left text-sm">
                          <thead className="text-xs text-slate-500">
                            <tr>
                              {(
                                [
                                  ["registratoAt", "Data"],
                                  ["titolo", "Titolo"],
                                  ["url", "Link"],
                                  ["descrizione", "Descrizione"],
                                  ["prezzo", "Prezzo"],
                                ] as const
                              ).map(([campo, etichetta]) => {
                                const ordine = ordineAcquisti[riga.id] ?? {
                                  campo: "registratoAt" as const,
                                  verso: "desc" as const,
                                };
                                return (
                                  <th key={campo} className="px-2 py-1">
                                    <IntestazioneOrdine
                                      attivo={ordine.campo === campo}
                                      verso={ordine.verso}
                                      onClick={() => cliccaOrdineAcquisti(riga.id, campo)}
                                    >
                                      {etichetta}
                                    </IntestazioneOrdine>
                                  </th>
                                );
                              })}
                              <th className="px-2 py-1 text-xs font-medium text-slate-500">
                                Documenti
                              </th>
                              <th className="px-2 py-1" />
                            </tr>
                          </thead>
                          <tbody>
                            {[...riga.acquisti]
                              .sort((a, b) => {
                                const ordine = ordineAcquisti[riga.id] ?? {
                                  campo: "registratoAt" as const,
                                  verso: "desc" as const,
                                };
                                if (ordine.campo === "prezzo") {
                                  return valoreOrdine(a.prezzo, b.prezzo, ordine.verso);
                                }
                                if (ordine.campo === "registratoAt") {
                                  return valoreOrdine(a.registratoAt, b.registratoAt, ordine.verso);
                                }
                                return valoreOrdine(a[ordine.campo], b[ordine.campo], ordine.verso);
                              })
                              .map((voce) => {
                              const link = hrefEsterno(voce.url);
                              return (
                              <tr key={voce.id} className="border-t border-slate-200">
                                <td className="px-2 py-1 text-slate-700">
                                  {voce.registratoAt ? formatQuando(voce.registratoAt) : "—"}
                                </td>
                                <td className="px-2 py-1 font-medium text-slate-900">
                                  {voce.titolo}
                                </td>
                                <td className="px-2 py-1">
                                  {link ? (
                                    <a
                                      href={link}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-block rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
                                    >
                                      Apri link
                                    </a>
                                  ) : (
                                    <span className="text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-1 text-slate-600">
                                  <DescrizioneDueRighe
                                    testo={voce.descrizione}
                                    onLeggi={() =>
                                      setDescrizioneAperta({
                                        titolo: voce.titolo,
                                        testo: voce.descrizione,
                                      })
                                    }
                                  />
                                </td>
                                <td className="px-2 py-1 tabular-nums text-slate-800">
                                  {formatPrezzo(voce.prezzo, voce.unitaMisura)}
                                </td>
                                <td className="px-2 py-1">
                                  {voce.documenti.length === 0 ? (
                                    <span className="text-slate-500">—</span>
                                  ) : (
                                    <div className="flex flex-col items-start gap-1">
                                      {voce.documenti.map((doc) => (
                                        <button
                                          key={doc.id}
                                          type="button"
                                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-left text-xs font-medium text-slate-800 hover:bg-slate-50"
                                          onClick={() => void apriDocumento(doc.id)}
                                        >
                                          {doc.nome}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-2 py-1">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                      onClick={() => {
                                        setErrore(null);
                                        setDocumentiSalvati(voce.documenti);
                                        setDocumentiNuovi([docVuoto()]);
                                        setAcquisto({
                                          id: voce.id,
                                          sitoId: riga.id,
                                          sitoNome: riga.nome,
                                          url: voce.url,
                                          titolo: voce.titolo,
                                          descrizione: voce.descrizione,
                                          prezzo: prezzoTesto(voce.prezzo),
                                          unita: voce.unitaMisura,
                                          registratoAt: versoLocale(voce.registratoAt),
                                        });
                                      }}
                                    >
                                      Modifica
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                                      onClick={() => {
                                        setErrore(null);
                                        setEliminaAcquisto(voce);
                                        setConferma("");
                                      }}
                                    >
                                      Elimina
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        ))
                      ) : null}
                    </td>
                  </tr>
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {bozza ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={formTitleId}
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id={formTitleId} className="text-lg font-semibold text-slate-900">
              {bozza.id ? "Modifica sito" : "Nuovo sito"}
            </h2>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">Nome</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={bozza.nome}
                  onChange={(e) => setBozza({ ...bozza, nome: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={bozza.url}
                  onChange={(e) => setBozza({ ...bozza, url: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Mail (facoltativa)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  autoComplete="off"
                  value={bozza.mail}
                  onChange={(e) => setBozza({ ...bozza, mail: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">
                  Password
                  {bozza.id
                    ? " (facoltativa, vuota = resta quella già salvata)"
                    : " (facoltativa, si può aggiungere dopo)"}
                </span>
                <input
                  type="password"
                  autoComplete="new-password"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={bozza.password}
                  onChange={(e) => setBozza({ ...bozza, password: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setBozza(null)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void salva()}
                disabled={busy}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {unitaAperta ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={unitaTitleId}
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id={unitaTitleId} className="text-lg font-semibold text-slate-900">
              Nuova unità
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Sigla breve, per esempio un, mt o lt. Resta in elenco per i prossimi acquisti.
            </p>
            {errore ? <p className="mt-3 text-sm text-red-700">{errore}</p> : null}
            <label className="mt-4 block text-sm">
              <span className="text-slate-600">Sigla</span>
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                value={nuovaUnita}
                onChange={(e) => setNuovaUnita(e.target.value)}
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setUnitaAperta(false)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void salvaUnita()}
                disabled={busy}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {elimina ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">Rimuovi {elimina.nome}</h2>
            <p className="mt-2 text-sm text-slate-600">
              La scheda resta in archivio. Per confermare scrivi{" "}
              <span className="font-medium">{fraseConfermaSoftDelete(elimina.nome)}</span>
            </p>
            <input
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setElimina(null)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void confermaElimina()}
                disabled={busy}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {acquisto ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={acquistoTitleId}
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id={acquistoTitleId} className="text-lg font-semibold text-slate-900">
              {acquisto.id ? "Modifica acquisto" : "Nuovo acquisto"} — {acquisto.sitoNome}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Obbligatori solo URL e titolo. La data è quella di adesso e si può cambiare.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="text-slate-600">URL</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={acquisto.url}
                  onChange={(e) => setAcquisto({ ...acquisto, url: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Titolo / nome</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={acquisto.titolo}
                  onChange={(e) => setAcquisto({ ...acquisto, titolo: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">Descrizione</span>
                <textarea
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  rows={3}
                  value={acquisto.descrizione}
                  onChange={(e) =>
                    setAcquisto({ ...acquisto, descrizione: e.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm">
                  <span className="text-slate-600">Prezzo (€)</span>
                  <input
                    inputMode="decimal"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={acquisto.prezzo}
                    onChange={(e) => setAcquisto({ ...acquisto, prezzo: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Unità</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={acquisto.unita}
                    onChange={(e) => {
                      if (e.target.value === "__altro__") {
                        setNuovaUnita("");
                        setUnitaAperta(true);
                        return;
                      }
                      setAcquisto({ ...acquisto, unita: e.target.value });
                    }}
                  >
                    <option value="">—</option>
                    {CAVEAU_UNITA_BASE.map((sigla) => (
                      <option key={sigla} value={sigla}>
                        {sigla}
                      </option>
                    ))}
                    {unitaExtra
                      .filter(
                        (sigla) =>
                          !(CAVEAU_UNITA_BASE as readonly string[]).includes(sigla)
                      )
                      .map((sigla) => (
                        <option key={sigla} value={sigla}>
                          {sigla}
                        </option>
                      ))}
                    {acquisto.unita &&
                    !(CAVEAU_UNITA_BASE as readonly string[]).includes(acquisto.unita) &&
                    !unitaExtra.includes(acquisto.unita) ? (
                      <option value={acquisto.unita}>{acquisto.unita}</option>
                    ) : null}
                    <option value="__altro__">Altro…</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-600">Data</span>
                  <input
                    type="datetime-local"
                    step={60}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={acquisto.registratoAt}
                    onChange={(e) =>
                      setAcquisto({ ...acquisto, registratoAt: e.target.value })
                    }
                  />
                </label>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-800">Documenti</p>
                  <button
                    type="button"
                    className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-medium"
                    onClick={() => setDocumentiNuovi((prev) => [...prev, docVuoto()])}
                  >
                    Aggiungi documento
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  Facoltativi. Ogni documento ha un nome, per esempio Scheda tecnica, e un file.
                </p>
                {documentiSalvati.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{doc.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {doc.fileName} · {formatPeso(doc.fileSize)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                        onClick={() => void apriDocumento(doc.id)}
                      >
                        Apri
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 bg-white px-2 py-1 text-xs text-red-700"
                        onClick={() => setDocumentoDaRimuovere(doc)}
                      >
                        Rimuovi
                      </button>
                    </div>
                  </div>
                ))}
                {documentiNuovi.map((doc, index) => (
                  <div key={doc.key} className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block min-w-0 flex-1 text-sm">
                        <span className="text-slate-600">Nome documento</span>
                        <input
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                          placeholder="Es. Scheda tecnica"
                          value={doc.nome}
                          onChange={(e) =>
                            setDocumentiNuovi((prev) =>
                              prev.map((voce) =>
                                voce.key === doc.key ? { ...voce, nome: e.target.value } : voce
                              )
                            )
                          }
                        />
                      </label>
                      {documentiNuovi.length > 1 || doc.nome || doc.file ? (
                        <button
                          type="button"
                          className="mt-5 text-xs text-slate-600 underline"
                          onClick={() =>
                            setDocumentiNuovi((prev) => {
                              const next = prev.filter((voce) => voce.key !== doc.key);
                              return next.length > 0 ? next : [docVuoto()];
                            })
                          }
                        >
                          Togli
                        </button>
                      ) : null}
                    </div>
                    <RiquadroFile
                      file={doc.file}
                      onFile={(file) =>
                        setDocumentiNuovi((prev) =>
                          prev.map((voce) => (voce.key === doc.key ? { ...voce, file } : voce))
                        )
                      }
                    />
                    <span className="sr-only">Documento {index + 1}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setAcquisto(null)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void salvaAcquisto()}
                disabled={busy}
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {documentoDaRimuovere ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              Rimuovi {documentoDaRimuovere.nome}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Il file resta in archivio e non compare più sull&apos;acquisto.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setDocumentoDaRimuovere(null)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void confermaRimuoviDocumento()}
                disabled={busy}
              >
                Rimuovi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {eliminaAcquisto ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 className="text-lg font-semibold text-slate-900">
              Rimuovi {eliminaAcquisto.titolo}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              La riga resta in archivio. Per confermare scrivi{" "}
              <span className="font-medium">
                {fraseConfermaSoftDelete(eliminaAcquisto.titolo)}
              </span>
            </p>
            <input
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={conferma}
              onChange={(e) => setConferma(e.target.value)}
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setEliminaAcquisto(null)}
                disabled={busy}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="rounded-lg bg-red-700 px-3 py-2 text-sm text-white disabled:opacity-60"
                onClick={() => void confermaEliminaAcquisto()}
                disabled={busy}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {descrizioneAperta ? (
        <div className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={descrizioneTitleId}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id={descrizioneTitleId} className="text-lg font-semibold text-slate-900">
              {descrizioneAperta.titolo}
            </h2>
            <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-slate-700">
              {descrizioneAperta.testo}
            </p>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={() => setDescrizioneAperta(null)}
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rivela ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={rivelaTitleId}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
          >
            <h2 id={rivelaTitleId} className="text-lg font-semibold text-slate-900">
              Password di {rivela.nome}
            </h2>
            {passwordVista ? (
              <div className="mt-4 space-y-3">
                <input
                  readOnly
                  className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-sm"
                  value={passwordVista}
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  onClick={() => void navigator.clipboard.writeText(passwordVista)}
                >
                  Copia
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-600">
                  {codiceInviatoA
                    ? `Codice inviato a ${codiceInviatoA}. Vale pochi minuti e si usa una volta sola.`
                    : "Chiedi il codice: arriva sulla email del Super Admin che ha fatto l'accesso."}
                </p>
                {errore ? <p className="text-sm text-red-700">{errore}</p> : null}
                <label className="block text-sm">
                  <span className="text-slate-600">Codice ricevuto per email</span>
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 tracking-widest"
                    value={codice}
                    onChange={(e) => setCodice(e.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                onClick={chiudiRivela}
                disabled={busy}
              >
                Chiudi
              </button>
              {passwordVista ? null : (
                <button
                  type="button"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-60"
                  onClick={() => void inviaCodice()}
                  disabled={busy}
                >
                  Invia codice
                </button>
              )}
              {passwordVista ? null : (
                <button
                  type="button"
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
                  onClick={() => void scopri()}
                  disabled={busy}
                >
                  Mostra
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
