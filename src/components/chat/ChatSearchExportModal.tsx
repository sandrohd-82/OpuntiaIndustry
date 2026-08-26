"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { FaFilePdf, FaMagnifyingGlass, FaXmark } from "react-icons/fa6";
import { recordDecisionAction } from "@/app/actions/learning";
import {
  downloadChatPdf,
  listChatFilterParticipants,
  searchChatMessages,
  type ChatFilterInput,
  type ChatParticipantOption,
  type ChatSearchHit,
} from "@/lib/chat/search-export";
import { createClient } from "@/lib/supabase/client";

export type ChatOpenContext = {
  kind: "direct" | "topic";
  id: string;
} | null;

type Mode = "search" | "export";

type Props = {
  open: boolean;
  mode: Mode;
  userId: string;
  openContext: ChatOpenContext;
  onClose: () => void;
};

const defaultFilters = (
  openContext: ChatOpenContext
): ChatFilterInput => ({
  query: "",
  dateFrom: "",
  dateTo: "",
  senderIds: [],
  scope: openContext ? "open" : "all",
  openKind: openContext?.kind ?? null,
  openId: openContext?.id ?? null,
  includeText: true,
  includeTranscripts: true,
  includeAttachments: true,
  includeDayHeaders: true,
  includeSenderName: true,
});

export function ChatSearchExportModal({
  open,
  mode,
  userId,
  openContext,
  onClose,
}: Props) {
  const [filters, setFilters] = useState<ChatFilterInput>(() =>
    defaultFilters(openContext)
  );
  const [participants, setParticipants] = useState<ChatParticipantOption[]>(
    []
  );
  const [hits, setHits] = useState<ChatSearchHit[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportedBy, setExportedBy] = useState("utente");

  useEffect(() => {
    if (!open) return;
    setFilters(defaultFilters(openContext));
    setHits([]);
    setError(null);
  }, [open, openContext, mode]);

  const loadParticipants = useCallback(async () => {
    const supabase = createClient();
    try {
      const list = await listChatFilterParticipants(supabase, userId, {
        scope: filters.scope,
        openKind: filters.openKind,
        openId: filters.openId,
      });
      setParticipants(list);
      const me = list.find((p) => p.id === userId);
      if (me) setExportedBy(me.name);
    } catch {
      setParticipants([]);
    }
  }, [userId, filters.scope, filters.openKind, filters.openId]);

  useEffect(() => {
    if (!open) return;
    void loadParticipants();
  }, [open, loadParticipants]);

  async function runSearch() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const payload: ChatFilterInput = {
        ...filters,
        query: mode === "export" ? "" : filters.query,
        openKind: openContext?.kind ?? filters.openKind,
        openId: openContext?.id ?? filters.openId,
      };
      if (payload.scope === "open" && (!payload.openId || !payload.openKind)) {
        throw new Error(
          "Nessuna chat aperta: seleziona «Tutte le chat» oppure apri un thread."
        );
      }
      const results = await searchChatMessages(supabase, userId, payload);
      setHits(results);
      if (mode === "search") {
        void recordDecisionAction({
          module: "chat",
          context: "chat_search",
          action: "confirm",
          entityType: "chat_search",
          entityId: payload.openId,
          inputText: payload.query,
          choiceAfter: {
            scope: payload.scope,
            count: results.length,
            dateFrom: payload.dateFrom,
            dateTo: payload.dateTo,
            senderIds: payload.senderIds,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ricerca fallita");
      setHits([]);
    } finally {
      setPending(false);
    }
  }

  async function runExport() {
    setPending(true);
    setError(null);
    const supabase = createClient();
    try {
      const payload: ChatFilterInput = {
        ...filters,
        query: "",
        openKind: openContext?.kind ?? filters.openKind,
        openId: openContext?.id ?? filters.openId,
      };
      if (payload.scope === "open" && (!payload.openId || !payload.openKind)) {
        throw new Error(
          "Nessuna chat aperta: seleziona «Tutte le chat» oppure apri un thread."
        );
      }
      const results = await searchChatMessages(supabase, userId, payload);
      setHits(results);
      if (results.length === 0) {
        throw new Error("Nessun messaggio da esportare con i filtri scelti.");
      }
      downloadChatPdf(results, payload, {
        exportedBy,
        version: "v1",
      });
      void recordDecisionAction({
        module: "chat",
        context: "chat_export_pdf",
        action: "confirm",
        entityType: "chat_export",
        entityId: payload.openId,
        inputText: "",
        choiceAfter: {
          scope: payload.scope,
          count: results.length,
          dateFrom: payload.dateFrom,
          dateTo: payload.dateTo,
          senderIds: payload.senderIds,
          includeText: payload.includeText,
          includeTranscripts: payload.includeTranscripts,
          includeAttachments: payload.includeAttachments,
          documentVersion: "v1",
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export fallito");
    } finally {
      setPending(false);
    }
  }

  function toggleSender(id: string) {
    setFilters((prev) => {
      const has = prev.senderIds.includes(id);
      return {
        ...prev,
        senderIds: has
          ? prev.senderIds.filter((x) => x !== id)
          : [...prev.senderIds, id],
      };
    });
  }

  if (!open) return null;

  const title = mode === "search" ? "Cerca nelle chat" : "Esporta chat in PDF";
  const canOpen = Boolean(openContext);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/60 px-3 py-8"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            {mode === "search" ? (
              <FaMagnifyingGlass className="text-[var(--primary)]" size={14} />
            ) : (
              <FaFilePdf className="text-red-600" size={14} />
            )}
            <h2 className="text-sm font-semibold">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Chiudi"
          >
            <FaXmark size={14} />
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          {mode === "search" ? (
            <label className="block text-xs font-medium text-slate-600">
              Testo / frase / @utente
              <input
                value={filters.query}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, query: e.target.value }))
                }
                placeholder='es. consegna @Mario oppure "ordine urgente"'
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              Dal
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, dateFrom: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
            <label className="text-xs font-medium text-slate-600">
              Al
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, dateTo: e.target.value }))
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-600">
              Ambito
            </legend>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={filters.scope === "open"}
                  disabled={!canOpen}
                  onChange={() =>
                    setFilters((p) => ({
                      ...p,
                      scope: "open",
                      openKind: openContext?.kind ?? null,
                      openId: openContext?.id ?? null,
                    }))
                  }
                />
                Chat aperta
                {!canOpen ? (
                  <span className="text-[10px] text-slate-400">
                    (apri un thread)
                  </span>
                ) : null}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name="scope"
                  checked={filters.scope === "all"}
                  onChange={() =>
                    setFilters((p) => ({ ...p, scope: "all" }))
                  }
                />
                Tutte le chat
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-600">
              Utenti (vuoto = tutti)
            </legend>
            <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-2">
              {participants.length === 0 ? (
                <p className="text-xs text-slate-400">Nessun partecipante.</p>
              ) : (
                participants.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-2 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={filters.senderIds.includes(p.id)}
                      onChange={() => toggleSender(p.id)}
                    />
                    <span>
                      @{p.name}
                      {p.id === userId ? " (tu)" : ""}
                    </span>
                  </label>
                ))
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1 text-xs font-medium text-slate-600">
              Includi contenuti
            </legend>
            <div className="flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.includeText}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      includeText: e.target.checked,
                    }))
                  }
                />
                Testo messaggi
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.includeTranscripts}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      includeTranscripts: e.target.checked,
                    }))
                  }
                />
                Note vocali trascritte
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={filters.includeAttachments}
                  onChange={(e) =>
                    setFilters((p) => ({
                      ...p,
                      includeAttachments: e.target.checked,
                    }))
                  }
                />
                Allegati (nome file)
              </label>
              {mode === "export" ? (
                <>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filters.includeDayHeaders}
                      onChange={(e) =>
                        setFilters((p) => ({
                          ...p,
                          includeDayHeaders: e.target.checked,
                        }))
                      }
                    />
                    Intestazioni giorno
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={filters.includeSenderName}
                      onChange={(e) =>
                        setFilters((p) => ({
                          ...p,
                          includeSenderName: e.target.checked,
                        }))
                      }
                    />
                    Nome mittente
                  </label>
                </>
              ) : null}
            </div>
          </fieldset>

          {error ? (
            <p className="rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {mode === "search" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void runSearch()}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Ricerca…" : "Cerca"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void runSearch()}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {pending ? "…" : "Anteprima"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void runExport()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                >
                  <FaFilePdf size={12} />
                  {pending ? "Esportazione…" : "Scarica PDF"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
            >
              Chiudi
            </button>
          </div>
        </div>

        {hits.length > 0 ? (
          <div className="max-h-72 space-y-2 overflow-y-auto border-t border-[var(--border)] px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">
              {hits.length} risultati
            </p>
            {hits.map((h) => (
              <Link
                key={`${h.kind}-${h.id}`}
                href={h.href}
                onClick={onClose}
                className="block rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span>
                    {h.kind === "direct" ? "1:1" : "Argomento"} · {h.threadTitle}{" "}
                    · @{h.senderName}
                  </span>
                  <span>
                    {new Date(h.createdAt).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {h.content ? (
                  <p className="mt-0.5 line-clamp-2 text-slate-800">
                    {h.content}
                  </p>
                ) : null}
                {h.transcriptText ? (
                  <p className="mt-0.5 line-clamp-2 text-xs italic text-slate-600">
                    [Trascrizione] {h.transcriptText}
                  </p>
                ) : null}
                {h.fileName ? (
                  <p className="mt-0.5 text-xs text-[var(--primary)]">
                    Allegato: {h.fileName}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
