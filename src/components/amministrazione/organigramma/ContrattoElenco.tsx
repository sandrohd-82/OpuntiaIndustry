"use client";

import { useState } from "react";
import { FaDownload, FaEye } from "react-icons/fa6";
import { getContrattoUrlAction } from "@/app/actions/organigramma";
import { ValiditaDocumentoBadge } from "@/components/amministrazione/organigramma/ValiditaDocumentoBadge";
import {
  contrattoAlertLabel,
  contrattoAlertLivello,
  contrattoStatoLabel,
  contrattoTipoLabel,
  validitaContratto,
  type OrganigrammaContratto,
  type OrganigrammaContrattoStato,
} from "@/lib/amministrazione/organigramma";

function formatData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const value = iso.includes("T") ? iso : `${iso}T00:00:00`;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("it-IT");
}

function formatImporto(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function isImageMime(mime: string, fileName: string): boolean {
  if (mime.startsWith("image/")) return true;
  return /\.(jpe?g|png|webp)$/i.test(fileName);
}

function isPdfMime(mime: string, fileName: string): boolean {
  return mime === "application/pdf" || /\.pdf$/i.test(fileName);
}

async function downloadContratto(
  id: string,
  fallbackName: string
): Promise<{ success: true } | { success: false; error: string }> {
  const res = await getContrattoUrlAction(id, "download");
  if (!res.success) return res;
  const name = res.fileName || fallbackName || "contratto";
  try {
    const blob = await fetch(res.url).then((r) => {
      if (!r.ok) throw new Error("Download non disponibile.");
      return r.blob();
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    a.click();
    URL.revokeObjectURL(href);
    return { success: true };
  } catch {
    const a = document.createElement("a");
    a.href = res.url;
    a.download = name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
    return { success: true };
  }
}

export function ContrattoElenco({
  items,
  isAdmin,
  onRemove,
  onStato,
  onError,
}: {
  items: OrganigrammaContratto[];
  isAdmin: boolean;
  onRemove?: (id: string) => Promise<void>;
  onStato?: (id: string, stato: OrganigrammaContrattoStato) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [preview, setPreview] = useState<{
    title: string;
    url: string;
    mime: string;
    fileName: string;
    id: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function openPreview(d: OrganigrammaContratto) {
    setBusyId(d.id);
    const res = await getContrattoUrlAction(d.id, "preview");
    setBusyId(null);
    if (!res.success) {
      onError(res.error);
      return;
    }
    setPreview({
      id: d.id,
      title: d.titolo,
      url: res.url,
      mime: res.mime || d.mime,
      fileName: res.fileName || d.fileName,
    });
  }

  if (items.length === 0) {
    return (
      <p className="mt-3 text-sm text-[var(--muted)]">Nessun contratto.</p>
    );
  }

  return (
    <>
      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] bg-slate-50 text-left text-xs uppercase text-[var(--muted)]">
              <th className="px-3 py-2.5">Titolo</th>
              <th className="px-3 py-2.5">Tipologia</th>
              <th className="px-3 py-2.5">Dal</th>
              <th className="px-3 py-2.5">Al</th>
              <th className="px-3 py-2.5">Importo</th>
              <th className="px-3 py-2.5">Validità</th>
              <th className="px-3 py-2.5">Stato</th>
              <th className="px-3 py-2.5">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => {
              const validita = validitaContratto(d);
              const livello = contrattoAlertLivello(d.dataFine, d.documentoStato);
              return (
                <tr key={d.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-3 py-2.5">
                    <p className="font-medium">{d.titolo}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {d.fileName || "—"} · v{d.versione}
                    </p>
                  </td>
                  <td className="px-3 py-2.5">{contrattoTipoLabel(d.tipologia)}</td>
                  <td className="px-3 py-2.5">{formatData(d.dataInizio)}</td>
                  <td className="px-3 py-2.5">
                    {d.tipologia === "tempo_indeterminato"
                      ? "Indeterminato"
                      : formatData(d.dataFine)}
                  </td>
                  <td className="px-3 py-2.5">{formatImporto(d.importo)}</td>
                  <td className="px-3 py-2.5">
                    <div className="space-y-1">
                      <ValiditaDocumentoBadge stato={validita} />
                      {livello && livello !== "scaduto" ? (
                        <p className="text-xs font-medium text-amber-800">
                          {contrattoAlertLabel(livello)}
                        </p>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {isAdmin && onStato ? (
                      <select
                        value={d.documentoStato}
                        className="rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs"
                        onChange={(e) =>
                          void onStato(
                            d.id,
                            e.target.value as OrganigrammaContrattoStato
                          )
                        }
                      >
                        <option value="bozza">Bozza</option>
                        <option value="approvato">Approvato</option>
                        <option value="chiuso">Chiuso</option>
                      </select>
                    ) : (
                      contrattoStatoLabel(d.documentoStato)
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() => void openPreview(d)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FaEye size={12} />
                        Visualizza anteprima
                      </button>
                      <button
                        type="button"
                        disabled={busyId === d.id}
                        onClick={() =>
                          void downloadContratto(d.id, d.fileName).then((res) => {
                            if (!res.success) onError(res.error);
                          })
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        <FaDownload size={12} />
                        Download
                      </button>
                      {isAdmin && onRemove ? (
                        <button
                          type="button"
                          onClick={() => void onRemove(d.id)}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Rimuovi
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {preview ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-4 py-10"
          role="presentation"
          onClick={() => setPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-4xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Anteprima — {preview.title}
                </h3>
                <p className="text-xs text-[var(--muted)]">{preview.fileName}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    void downloadContratto(preview.id, preview.fileName).then(
                      (res) => {
                        if (!res.success) onError(res.error);
                      }
                    )
                  }
                  className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium hover:bg-slate-50"
                >
                  <FaDownload size={12} />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                >
                  Chiudi
                </button>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-slate-100">
              {isImageMime(preview.mime, preview.fileName) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview.url}
                  alt={preview.title}
                  className="mx-auto max-h-[70vh] w-auto max-w-full object-contain"
                />
              ) : isPdfMime(preview.mime, preview.fileName) ? (
                <iframe
                  title={`Anteprima ${preview.title}`}
                  src={preview.url}
                  className="h-[70vh] w-full bg-white"
                />
              ) : (
                <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                  Anteprima non disponibile per questo formato. Usa Download.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
