"use client";

import { useCallback, useEffect, useId, useState } from "react";
import {
  aggiornaCaveauSitoAction,
  creaCaveauSitoAction,
  eliminaCaveauSitoAction,
  listCaveauSitiAction,
  rivelaPasswordCaveauAction,
} from "@/app/actions/caveau-siti";
import type { CaveauSitoRiga } from "@/lib/amministrazione/caveau-siti";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";

type Bozza = {
  id: string | null;
  nome: string;
  url: string;
  mail: string;
  password: string;
};

const vuota: Bozza = { id: null, nome: "", url: "", mail: "", password: "" };

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
  const [errore, setErrore] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bozza, setBozza] = useState<Bozza | null>(null);
  const [elimina, setElimina] = useState<CaveauSitoRiga | null>(null);
  const [conferma, setConferma] = useState("");
  const [rivela, setRivela] = useState<CaveauSitoRiga | null>(null);
  const [codice, setCodice] = useState("");
  const [passwordVista, setPasswordVista] = useState<string | null>(null);

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
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Elenco dei siti a cui l&apos;azienda è registrata. La password resta cifrata e si
          mostra solo dopo il codice del caveau, chiesto ogni volta.
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
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Sito</th>
              <th className="px-3 py-2">URL</th>
              <th className="px-3 py-2">Mail</th>
              <th className="px-3 py-2">Password</th>
              <th className="px-3 py-2">Versione</th>
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
              righe.map((riga) => (
                <tr key={riga.id} className="border-t border-slate-100">
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
              <label className="mt-4 block text-sm">
                <span className="text-slate-600">Codice del caveau</span>
                <input
                  type="password"
                  autoComplete="off"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  value={codice}
                  onChange={(e) => setCodice(e.target.value)}
                />
              </label>
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
