"use client";

import { useEffect, useState, useTransition } from "react";
import {
  approvaAnagraficaDocumentoAction,
  listAnagraficaDocumentiAction,
  softDeleteAnagraficaDocumentoAction,
  uploadAnagraficaDocumentoAction,
} from "@/app/actions/anagrafica-documenti";
import {
  ANAGRAFICA_DOCUMENTO_STATO_LABEL,
  ANAGRAFICA_DOCUMENTO_TIPO_LABEL,
  ANAGRAFICA_DOCUMENTO_TIPI,
  type AnagraficaDocumento,
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

  return (
    <AnagraficaSchedaSection title="Documenti" tone="documenti">
      {canEdit ? (
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
            fd.set("file", file);
            start(async () => {
              const res = await uploadAnagraficaDocumentoAction(fd);
              if (!res.success) {
                setError(res.error);
                return;
              }
              setTitolo("");
              setNote("");
              setFile(null);
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
          <label className="block text-xs sm:col-span-2">
            <span className="mb-1 block font-medium">Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-indigo-700 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Carica documento
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
