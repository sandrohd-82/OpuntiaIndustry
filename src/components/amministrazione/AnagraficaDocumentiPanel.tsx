"use client";

import { useEffect, useState, useTransition } from "react";
import {
  approvaAnagraficaDocumentoAction,
  listAnagraficaDocumentiAction,
  searchMailPerDocumentoClienteAction,
  softDeleteAnagraficaDocumentoAction,
  uploadAnagraficaDocumentoAction,
  type DocumentoClienteMailHint,
  type DocumentoClienteMailHit,
} from "@/app/actions/anagrafica-documenti";
import {
  ANAGRAFICA_DOCUMENTO_ORIGINE_LABEL,
  ANAGRAFICA_DOCUMENTO_ORIGINI,
  ANAGRAFICA_DOCUMENTO_STATO_LABEL,
  ANAGRAFICA_DOCUMENTO_TIPO_LABEL,
  ANAGRAFICA_DOCUMENTO_TIPI,
  formatAnagraficaIsoDate,
  isAnagraficaScadenzaPassata,
  type AnagraficaDocumento,
  type AnagraficaDocumentoOrigine,
  type AnagraficaDocumentoTipo,
} from "@/lib/amministrazione/anagrafica-documenti";
import { AnagraficaSchedaSection } from "@/components/amministrazione/AnagraficaSchedaSection";
import { FileDropZone } from "@/components/ui/FileDropZone";

export function AnagraficaDocumentiPanel({
  clienteId,
  canEdit,
  items: itemsProp,
  onChanged,
}: {
  clienteId: string;
  canEdit: boolean;
  items?: AnagraficaDocumento[];
  onChanged?: () => void;
}) {
  const [items, setItems] = useState<AnagraficaDocumento[]>(itemsProp ?? []);
  const [error, setError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<AnagraficaDocumentoTipo>("contratto");
  const [titolo, setTitolo] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [archiviaId, setArchiviaId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dataDocumento, setDataDocumento] = useState("");
  const [dataScadenza, setDataScadenza] = useState("");
  const [ricevutoVia, setRicevutoVia] =
    useState<AnagraficaDocumentoOrigine>("non_specificato");
  const [mailQuery, setMailQuery] = useState("");
  const [mailHits, setMailHits] = useState<DocumentoClienteMailHit[]>([]);
  const [mailHints, setMailHints] = useState<DocumentoClienteMailHint[]>([]);
  const [mailDomains, setMailDomains] = useState<string[]>([]);
  const [mailSearchable, setMailSearchable] = useState(true);
  const [mailSearched, setMailSearched] = useState(false);
  const [webmailMessaggioId, setWebmailMessaggioId] = useState("");
  const [collegamentoEtichetta, setCollegamentoEtichetta] = useState("");
  const [collegamentoUrl, setCollegamentoUrl] = useState("");
  const [formAperto, setFormAperto] = useState(false);

  function resetForm() {
    setTipo("contratto");
    setTitolo("");
    setNote("");
    setFile(null);
    setDataDocumento("");
    setDataScadenza("");
    setRicevutoVia("non_specificato");
    setMailQuery("");
    setMailHits([]);
    setMailHints([]);
    setMailDomains([]);
    setMailSearched(false);
    setWebmailMessaggioId("");
    setCollegamentoEtichetta("");
    setCollegamentoUrl("");
  }

  function chiudiForm() {
    resetForm();
    setFormAperto(false);
    setError(null);
  }

  function cercaMail(query = mailQuery) {
    start(async () => {
      const res = await searchMailPerDocumentoClienteAction(clienteId, query);
      if (!res.success) {
        setError(res.error);
        setMailSearchable(false);
        return;
      }
      setError(null);
      setMailSearchable(res.searchable);
      setMailHits(res.items);
      setMailHints(res.hints);
      setMailDomains(res.domains);
      setMailSearched(true);
    });
  }

  useEffect(() => {
    if (!formAperto || ricevutoVia !== "mail") return;
    cercaMail("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avvio come in timeline
  }, [formAperto, ricevutoVia, clienteId]);

  function reload() {
    void listAnagraficaDocumentiAction(clienteId).then((res) => {
      if (!res.success) setError(res.error);
      else {
        setItems(res.items);
        setError(null);
      }
    });
  }

  useEffect(() => {
    if (itemsProp) {
      setItems(itemsProp);
      return;
    }
    reload();
  }, [clienteId, itemsProp]);

  useEffect(() => {
    setFormAperto(false);
    resetForm();
  }, [clienteId]);

  return (
    <AnagraficaSchedaSection title="Documenti" tone="documenti">
      {canEdit ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (formAperto) {
                chiudiForm();
                return;
              }
              setError(null);
              setFormAperto(true);
            }}
            className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-800"
          >
            {formAperto ? "Chiudi caricamento" : "Carica nuovo documento"}
          </button>
          <span className="text-[11px] text-slate-600">
            {items.length === 0
              ? "Nessun documento in elenco"
              : `${items.length} document${items.length === 1 ? "o" : "i"} in elenco`}
          </span>
        </div>
      ) : null}

      {canEdit && formAperto ? (
        <form
          className="grid gap-2 rounded-lg border border-white/70 bg-white p-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!file) {
              setError("Seleziona un file da caricare.");
              return;
            }
            const fd = new FormData();
            fd.set("clienteId", clienteId);
            fd.set("tipo", tipo);
            fd.set("titolo", titolo.trim() || file.name.replace(/\.[^.]+$/, ""));
            fd.set("note", note);
            fd.set("dataDocumento", dataDocumento);
            fd.set("dataScadenza", dataScadenza);
            fd.set("ricevutoVia", ricevutoVia);
            fd.set("webmailMessaggioId", webmailMessaggioId);
            fd.set("collegamentoEtichetta", collegamentoEtichetta);
            fd.set("collegamentoUrl", collegamentoUrl);
            fd.set("file", file);
            start(async () => {
              const res = await uploadAnagraficaDocumentoAction(fd);
              if (!res.success) {
                setError(res.error);
                return;
              }
              chiudiForm();
              reload();
              onChanged?.();
            });
          }}
        >
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Tipo</span>
            <select
              value={tipo}
              onChange={(e) =>
                setTipo(e.target.value as AnagraficaDocumentoTipo)
              }
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            >
              {ANAGRAFICA_DOCUMENTO_TIPI.map((t) => (
                <option key={t} value={t}>
                  {ANAGRAFICA_DOCUMENTO_TIPO_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">Titolo</span>
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value)}
              placeholder="Es. Contratto 2026"
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <FileDropZone
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png,image/webp"
              file={file}
              busy={pending}
              title="Trascina qui il documento"
              hint="PDF, Word, JPG, PNG, WebP · max 20 MB"
              readyCaption="pronto, premi Carica documento"
              onFile={(next) => {
                setFile(next);
                setError(null);
                if (!titolo.trim()) {
                  setTitolo(next.name.replace(/\.[^.]+$/, ""));
                }
              }}
              onInvalid={(msg) =>
                setError(
                  msg.includes("PDF")
                    ? "Formato ammesso: PDF, Word, JPG, PNG, WebP."
                    : msg
                )
              }
            />
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">
              Data documento <span className="font-normal text-slate-500">(facoltativa)</span>
            </span>
            <input
              type="date"
              value={dataDocumento}
              onChange={(e) => setDataDocumento(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">
              Scadenza <span className="font-normal text-slate-500">(facoltativa)</span>
            </span>
            <input
              type="date"
              value={dataScadenza}
              min={dataDocumento || undefined}
              onChange={(e) => setDataScadenza(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-xs font-medium">
              Ricevuto tramite{" "}
              <span className="font-normal text-slate-500">(facoltativo)</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {ANAGRAFICA_DOCUMENTO_ORIGINI.map((o) => (
                <label
                  key={o}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                    ricevutoVia === o
                      ? "border-indigo-400 bg-indigo-50 text-indigo-950"
                      : "border-[var(--border)] bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="ricevutoVia"
                    className="accent-indigo-700"
                    checked={ricevutoVia === o}
                    onChange={() => {
                      setRicevutoVia(o);
                      if (o !== "mail") {
                        setWebmailMessaggioId("");
                        setMailHits([]);
                        setMailSearched(false);
                      }
                      if (o !== "altro") setCollegamentoUrl("");
                      if (o === "non_specificato") {
                        setCollegamentoEtichetta("");
                      }
                    }}
                  />
                  {ANAGRAFICA_DOCUMENTO_ORIGINE_LABEL[o]}
                </label>
              ))}
            </div>
          </fieldset>
          {ricevutoVia === "mail" ? (
            <div className="space-y-2 rounded-md border border-indigo-100 bg-indigo-50/40 p-2 sm:col-span-2">
              <p className="text-[11px] text-slate-600">
                Ricerca come in timeline: indirizzi della scheda, referenti e
                dominio, in tutte le caselle aziendali. Puoi anche scrivere solo
                un riferimento.
              </p>
              {mailHints.length > 0 || mailDomains.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {mailHints.map((h) => (
                    <button
                      key={`${h.email}-${h.source}`}
                      type="button"
                      onClick={() => {
                        setMailQuery(h.email);
                        cercaMail(h.email);
                      }}
                      className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[11px] text-indigo-950 hover:bg-indigo-100"
                      title={h.source}
                    >
                      {h.email}
                    </button>
                  ))}
                  {mailDomains.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setMailQuery(`@${d}`);
                        cercaMail(`@${d}`);
                      }}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-900"
                    >
                      @{d}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <input
                  value={mailQuery}
                  onChange={(e) => setMailQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      cercaMail(mailQuery);
                    }
                  }}
                  placeholder="Cerca indirizzo, oggetto o mittente…"
                  className="min-w-[12rem] flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => cercaMail(mailQuery)}
                  className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {pending ? "Cerco…" : "Cerca"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setMailQuery("");
                    cercaMail("");
                  }}
                  className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
                >
                  Suggerite
                </button>
              </div>
              {!mailSearchable ? (
                <p className="text-[11px] text-amber-900">
                  Ricerca webmail non disponibile: indica comunque un
                  riferimento testuale.
                </p>
              ) : null}
              {mailSearched && mailHits.length === 0 && mailSearchable ? (
                <p className="text-[11px] text-slate-600">
                  Nessuna mail trovata nelle caselle aziendali. Puoi comunque
                  scrivere il riferimento.
                </p>
              ) : null}
              {mailHits.length > 0 ? (
                <ul className="max-h-56 space-y-1 overflow-auto">
                  {mailHits.map((hit) => (
                    <li key={hit.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setWebmailMessaggioId(hit.id);
                          setCollegamentoEtichetta(
                            hit.subject || hit.fromAddress || "Mail collegata"
                          );
                        }}
                        className={`w-full rounded-md border px-2 py-1.5 text-left text-xs ${
                          webmailMessaggioId === hit.id
                            ? "border-indigo-500 bg-white"
                            : "border-transparent bg-white/70 hover:border-indigo-200"
                        }`}
                      >
                        <span className="block font-medium">{hit.subject}</span>
                        <span className="block text-slate-600">
                          {hit.fromName ? `${hit.fromName} · ` : ""}
                          {hit.fromAddress}
                          {hit.receivedAt
                            ? ` · ${formatAnagraficaIsoDate(hit.receivedAt)}`
                            : ""}
                          {hit.direction === "outbound" ? " · inviata" : ""}
                        </span>
                        <span className="block text-[10px] text-indigo-900">
                          {hit.casella}
                          {hit.matchReason ? ` · ${hit.matchReason}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <label className="block text-xs">
                <span className="mb-1 block font-medium">
                  Oggetto o riferimento
                </span>
                <input
                  value={collegamentoEtichetta}
                  onChange={(e) => setCollegamentoEtichetta(e.target.value)}
                  placeholder="Es. PEC del 12/03, oggetto contratto"
                  className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          ) : null}
          {ricevutoVia === "altro" ? (
            <div className="space-y-2 sm:col-span-2">
              <label className="block text-xs">
                <span className="mb-1 block font-medium">
                  Riferimento
                </span>
                <input
                  value={collegamentoEtichetta}
                  onChange={(e) => setCollegamentoEtichetta(e.target.value)}
                  placeholder="Es. consegnato a mano, corriere, protocollo"
                  className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="mb-1 block font-medium">
                  Link o percorso{" "}
                  <span className="font-normal text-slate-500">(facoltativo)</span>
                </span>
                <input
                  value={collegamentoUrl}
                  onChange={(e) => setCollegamentoUrl(e.target.value)}
                  placeholder="https://… oppure cartella condivisa"
                  className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                />
              </label>
            </div>
          ) : null}
          <label className="block text-xs sm:col-span-2">
            <span className="mb-1 block font-medium">Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Carica documento
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={chiudiForm}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-xs"
            >
              Annulla
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">Nessun documento caricato.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-white/80 bg-white px-3 py-2 text-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {doc.titolo}{" "}
                    <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] uppercase text-indigo-900">
                      {ANAGRAFICA_DOCUMENTO_TIPO_LABEL[doc.tipo]}
                    </span>
                    <span className="ml-1 text-[10px] uppercase text-slate-600">
                      {ANAGRAFICA_DOCUMENTO_STATO_LABEL[doc.documentoStato]} · v
                      {doc.versione}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--muted)]">{doc.fileName}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-600">
                    {doc.dataDocumento ? (
                      <span>Data {formatAnagraficaIsoDate(doc.dataDocumento)}</span>
                    ) : null}
                    {doc.dataScadenza ? (
                      <span
                        className={
                          isAnagraficaScadenzaPassata(doc.dataScadenza)
                            ? "font-medium text-amber-800"
                            : undefined
                        }
                      >
                        Scad. {formatAnagraficaIsoDate(doc.dataScadenza)}
                        {isAnagraficaScadenzaPassata(doc.dataScadenza)
                          ? " (scaduto)"
                          : ""}
                      </span>
                    ) : null}
                    {doc.ricevutoVia !== "non_specificato" ? (
                      <span>
                        {ANAGRAFICA_DOCUMENTO_ORIGINE_LABEL[doc.ricevutoVia]}
                        {doc.collegamentoEtichetta
                          ? ` · ${doc.collegamentoEtichetta}`
                          : ""}
                      </span>
                    ) : null}
                    {doc.collegamentoUrl ? (
                      doc.collegamentoUrl.startsWith("http") ? (
                        <a
                          href={doc.collegamentoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-800 hover:underline"
                        >
                          Collegamento
                        </a>
                      ) : (
                        <span>{doc.collegamentoUrl}</span>
                      )
                    ) : null}
                  </p>
                  {doc.note ? (
                    <p className="mt-0.5 text-xs text-slate-600">{doc.note}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-md px-2 py-1 text-xs font-medium text-indigo-800 hover:bg-indigo-50"
                    >
                      Apri
                    </a>
                  ) : null}
                  {canEdit && doc.documentoStato === "bozza" ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await approvaAnagraficaDocumentoAction(
                            doc.id
                          );
                          if (!res.success) setError(res.error);
                          else {
                            reload();
                            onChanged?.();
                          }
                        })
                      }
                      className="rounded-md px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                    >
                      Approva
                    </button>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        archiviaId === doc.id
                          ? start(async () => {
                              const res =
                                await softDeleteAnagraficaDocumentoAction(
                                  doc.id
                                );
                              setArchiviaId(null);
                              if (!res.success) setError(res.error);
                              else {
                                reload();
                                onChanged?.();
                              }
                            })
                          : setArchiviaId(doc.id)
                      }
                      className="rounded-md px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-50"
                    >
                      {archiviaId === doc.id ? "Conferma archivia" : "Archivia"}
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AnagraficaSchedaSection>
  );
}
