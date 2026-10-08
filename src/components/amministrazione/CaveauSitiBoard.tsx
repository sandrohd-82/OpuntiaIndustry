"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  aggiornaCaveauAcquistoAction,
  aggiornaCaveauSitoAction,
  creaCaveauAcquistoAction,
  creaCaveauSitoAction,
  eliminaCaveauAcquistoAction,
  eliminaCaveauSitoAction,
  inviaCodiceCaveauAction,
  listCaveauSitiAction,
  rivelaPasswordCaveauAction,
} from "@/app/actions/caveau-siti";
import type { CaveauAcquistoRiga, CaveauSitoRiga } from "@/lib/amministrazione/caveau-siti";
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
  registratoAt: string;
};

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

function formatPrezzo(valore: number | null): string {
  if (valore == null) return "—";
  return valore.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
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
  const [eliminaAcquisto, setEliminaAcquisto] = useState<CaveauAcquistoRiga | null>(null);
  const acquistoTitleId = useId();

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
      return;
    }
    setErrore(null);
    setRighe(res.righe);
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
    setAcquisto({
      id: null,
      sitoId: sito.id,
      sitoNome: sito.nome,
      url: "",
      titolo: "",
      descrizione: "",
      prezzo: "",
      registratoAt: adessoLocale(),
    });
  }

  async function salvaAcquisto() {
    if (!acquisto || busy) return;
    setBusy(true);
    setErrore(null);
    const payload = {
      sitoId: acquisto.sitoId,
      url: acquisto.url,
      titolo: acquisto.titolo,
      descrizione: acquisto.descrizione,
      prezzo: acquisto.prezzo,
      registratoAt: acquisto.registratoAt,
    };
    const res = acquisto.id
      ? await aggiornaCaveauAcquistoAction({ ...payload, id: acquisto.id })
      : await creaCaveauAcquistoAction(payload);
    setBusy(false);
    if (!res.ok) {
      setErrore(res.error);
      return;
    }
    setAcquisto(null);
    await load();
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
          Elenco dei siti a cui l&apos;azienda è registrata. La password resta cifrata e si
          mostra solo con il codice inviato per email al Super Admin.
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
                    <td className="px-3 py-2 text-slate-700">{riga.mail}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">••••••••</td>
                    <td className="px-3 py-2 text-slate-600">{riga.versione}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        onClick={() => {
                          setErrore(null);
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
                                  ["url", "URL"],
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
                              .map((voce) => (
                              <tr key={voce.id} className="border-t border-slate-200">
                                <td className="px-2 py-1 text-slate-700">
                                  {voce.registratoAt ? formatQuando(voce.registratoAt) : "—"}
                                </td>
                                <td className="px-2 py-1 font-medium text-slate-900">
                                  {voce.titolo}
                                </td>
                                <td className="px-2 py-1">
                                  {/^https?:\/\//i.test(voce.url) ? (
                                    <a
                                      href={voce.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sky-800 underline"
                                    >
                                      {voce.url}
                                    </a>
                                  ) : (
                                    <span className="text-slate-700">{voce.url}</span>
                                  )}
                                </td>
                                <td className="max-w-xs px-2 py-1 text-slate-600">
                                  {voce.descrizione || "—"}
                                </td>
                                <td className="px-2 py-1 tabular-nums text-slate-800">
                                  {formatPrezzo(voce.prezzo)}
                                </td>
                                <td className="px-2 py-1">
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs"
                                      onClick={() => {
                                        setErrore(null);
                                        setAcquisto({
                                          id: voce.id,
                                          sitoId: riga.id,
                                          sitoNome: riga.nome,
                                          url: voce.url,
                                          titolo: voce.titolo,
                                          descrizione: voce.descrizione,
                                          prezzo: prezzoTesto(voce.prezzo),
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
                            ))}
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
                <span className="text-slate-600">Mail</span>
                <input
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  autoComplete="off"
                  value={bozza.mail}
                  onChange={(e) => setBozza({ ...bozza, mail: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <span className="text-slate-600">
                  Password{bozza.id ? " (vuota = resta quella già salvata)" : ""}
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
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
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
              <div className="grid gap-3 sm:grid-cols-2">
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
                  <span className="text-slate-600">Data</span>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                    value={acquisto.registratoAt}
                    onChange={(e) =>
                      setAcquisto({ ...acquisto, registratoAt: e.target.value })
                    }
                  />
                </label>
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
