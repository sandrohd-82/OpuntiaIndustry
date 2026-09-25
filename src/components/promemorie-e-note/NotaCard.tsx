"use client";

import { useState, useTransition } from "react";
import { FaPen } from "react-icons/fa6";
import { loadWebmailAllegatiPerNotaAction } from "@/app/actions/attivita-mentions";
import { updateNotaPnAction } from "@/app/actions/promemorie-e-note";
import {
  NotaFormExtras,
  type NotaExtrasValue,
} from "@/components/promemorie-e-note/NotaFormExtras";
import { MentionDescriptionField } from "@/components/promemorie-e-note/MentionDescriptionField";
import type { PnAttivitaCollegamento } from "@/lib/promemorie-e-note/mention-tokens";
import type { PnNota } from "@/lib/promemorie-e-note/types";
import { NotaRichBody } from "@/components/promemorie-e-note/NotaRichBody";

const NOTE_COLORS: Record<PnNota["colore"], string> = {
  giallo: "bg-amber-100 border-amber-300",
  verde: "bg-emerald-100 border-emerald-300",
  blu: "bg-sky-100 border-sky-300",
  rosa: "bg-pink-100 border-pink-300",
  grigio: "bg-slate-100 border-slate-300",
};

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function extrasFromNota(n: PnNota): NotaExtrasValue {
  return {
    dueAt: n.dueAt,
    createPromemoria: false,
    createAttivita: false,
    linkedPromemoriaId: n.linkedPromemoriaId,
    linkedAttivitaId: n.linkedAttivitaId,
  };
}

type Props = {
  nota: PnNota;
  onUpdated: (item: PnNota) => void;
  /** Lista compatta (es. modal clienti possibili) */
  compact?: boolean;
  onError?: (message: string) => void;
};

export function NotaCard({ nota, onUpdated, compact, onError }: Props) {
  const [editing, setEditing] = useState(false);
  const [titolo, setTitolo] = useState(nota.titolo);
  const [body, setBody] = useState(nota.body);
  const [colore, setColore] = useState<PnNota["colore"]>(nota.colore);
  const [extras, setExtras] = useState<NotaExtrasValue>(extrasFromNota(nota));
  const [collegamenti, setCollegamenti] = useState<PnAttivitaCollegamento[]>(
    []
  );
  const [allegati, setAllegati] = useState(nota.allegati ?? []);
  const [pending, startTransition] = useTransition();
  const [mailError, setMailError] = useState<string | null>(null);

  function openEdit() {
    setTitolo(nota.titolo);
    setBody(nota.bodyRich || nota.body);
    setColore(nota.colore);
    setExtras(extrasFromNota(nota));
    setCollegamenti([]);
    setAllegati(nota.allegati ?? []);
    setMailError(null);
    setEditing(true);
  }

  function save() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await updateNotaPnAction({
        id: nota.id,
        titolo,
        body,
        bodyRich: body,
        colore,
        dueAt: extras.dueAt,
        createPromemoria: extras.createPromemoria,
        createAttivita: extras.createAttivita,
        linkedPromemoriaId: extras.linkedPromemoriaId,
        linkedAttivitaId: extras.linkedAttivitaId,
        collegamenti,
        allegati,
      });
      if (!res.success) {
        onError?.(res.error);
        return;
      }
      onUpdated(res.item);
      setEditing(false);
    });
  }

  const shellClass = compact
    ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
    : `rounded-xl border p-3 shadow-sm ${NOTE_COLORS[nota.colore]}`;

  return (
    <>
      <div className={`relative ${shellClass}`}>
        <button
          type="button"
          onClick={openEdit}
          aria-label="Modifica nota"
          title="Modifica nota"
          className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-black/10 bg-white/80 text-slate-700 hover:bg-white"
        >
          <FaPen size={11} />
        </button>
        <div className="pr-9">
          {nota.titolo ? (
            <p className="text-sm font-semibold">{nota.titolo}</p>
          ) : null}
          <NotaRichBody
            className={nota.titolo ? "mt-1" : ""}
            compact={compact}
            body={nota.body}
            bodyRich={nota.bodyRich}
            allegati={nota.allegati}
          />
          {nota.dueAt ? (
            <p className="mt-1 text-xs text-slate-600">
              {formatWhen(nota.dueAt)}
            </p>
          ) : null}
          {(nota.linkedPromemoriaId || nota.linkedAttivitaId) && (
            <p className="mt-0.5 text-xs text-slate-600">
              {nota.linkedPromemoriaId ? "· promemoria " : ""}
              {nota.linkedAttivitaId ? "· evento" : ""}
            </p>
          )}
          {!compact ? (
            <p className="mt-2 text-[10px] text-slate-600">
              {formatWhen(nota.createdAt)}
              {nota.entityLabel
                ? ` · collegata a ${nota.entityLabel}`
                : nota.entityType
                  ? ` · ${nota.entityType}`
                  : ""}
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <h3 className="font-semibold">Modifica nota</h3>
            <label className="mt-3 block text-xs font-medium">
              Titolo (opz.)
            </label>
            <input
              value={titolo}
              onChange={(e) => setTitolo(e.target.value.slice(0, 200))}
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            />
            <div className="mt-3">
              <MentionDescriptionField
                label="Testo"
                value={body}
                onChange={setBody}
                collegamenti={collegamenti}
                onCollegamentiChange={setCollegamenti}
                rows={4}
                placeholder="Testo nota… @C- cliente, @Wm- mail. Leggenda @ per i comandi"
                onMailPicked={async (hit) => {
                  const res = await loadWebmailAllegatiPerNotaAction(
                    hit.entityId
                  );
                  if (!res.success) {
                    setMailError(res.error);
                    return;
                  }
                  setMailError(null);
                  setAllegati((prev) => {
                    const seen = new Set(prev.map((a) => a.id));
                    return [
                      ...prev,
                      ...res.allegati.filter((a) => !seen.has(a.id)),
                    ];
                  });
                }}
              />
            </div>
            {mailError ? (
              <p className="mt-2 text-xs text-red-700">{mailError}</p>
            ) : null}
            {allegati.length > 0 ? (
              <p className="mt-1 text-[11px] text-slate-600">
                {allegati.length} allegat{allegati.length === 1 ? "o" : "i"}
              </p>
            ) : null}
            <label className="mt-3 block text-xs font-medium">Colore</label>
            <select
              value={colore}
              onChange={(e) =>
                setColore(e.target.value as PnNota["colore"])
              }
              className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              <option value="giallo">Giallo</option>
              <option value="verde">Verde</option>
              <option value="blu">Blu</option>
              <option value="rosa">Rosa</option>
              <option value="grigio">Grigio</option>
            </select>
            <NotaFormExtras value={extras} onChange={setExtras} />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending || !body.trim()}
                onClick={save}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? "Salvataggio…" : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
