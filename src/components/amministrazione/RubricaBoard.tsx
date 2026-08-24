"use client";

import { useEffect, useState, useTransition } from "react";
import { FaPlus } from "react-icons/fa6";
import {
  createRubricaTimelineAction,
  listRubricaContattiAction,
  listRubricaTimelineAction,
  listWebmailMessagesLiteAction,
} from "@/app/actions/rubrica";
import { RubricaContattoFormModal } from "@/components/amministrazione/RubricaContattoFormModal";
import {
  AZIENDA_TIPO_LABELS,
  MODALITA_LABELS,
  RAPPORTO_LABELS,
  displayContattoName,
  type RubricaContatto,
  type RubricaModalita,
  type RubricaTimelineItem,
} from "@/lib/rubrica/types";

function toLocalInputValue(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RubricaBoard() {
  const [items, setItems] = useState<RubricaContatto[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<RubricaContatto | null>(null);
  const [timeline, setTimeline] = useState<RubricaTimelineItem[]>([]);
  const [mailOptions, setMailOptions] = useState<
    { id: string; label: string }[]
  >([]);

  const [riassunto, setRiassunto] = useState("");
  const [argomenti, setArgomenti] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [modalita, setModalita] = useState<RubricaModalita>("chiamata");
  const [mapsUrl, setMapsUrl] = useState("");
  const [mailId, setMailId] = useState("");
  const [occurredAt, setOccurredAt] = useState(toLocalInputValue());

  function reload(q = query) {
    startTransition(async () => {
      const res = await listRubricaContattiAction({ query: q });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setItems(res.items);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openTimeline(c: RubricaContatto) {
    setSelected(c);
    setRiassunto("");
    setArgomenti("");
    setDescrizione("");
    setModalita("chiamata");
    setMapsUrl("");
    setMailId("");
    setOccurredAt(toLocalInputValue());
    const [tl, mails] = await Promise.all([
      listRubricaTimelineAction(c.id),
      listWebmailMessagesLiteAction(),
    ]);
    if (tl.success) setTimeline(tl.items);
    else setTimeline([]);
    if (mails.success) setMailOptions(mails.items);
  }

  function addTimeline() {
    if (!selected) return;
    startTransition(async () => {
      const res = await createRubricaTimelineAction({
        contattoId: selected.id,
        occurredAt: new Date(occurredAt).toISOString(),
        riassunto,
        argomenti,
        descrizione,
        modalita,
        mapsUrl: modalita === "incontro" ? mapsUrl : "",
        webmailMessageId:
          modalita === "mail" && mailId ? mailId : null,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      await openTimeline(selected);
    });
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          <FaPlus size={12} />
          Nuovo contatto
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reload(query);
          }}
          placeholder="Cerca nome, mail, azienda…"
          className="min-w-[220px] flex-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => reload(query)}
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-slate-50"
        >
          Cerca
        </button>
      </div>

      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)] bg-[var(--card)]">
        {items.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-start gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{displayContattoName(c)}</p>
              <p className="text-xs text-[var(--muted)]">
                {RAPPORTO_LABELS[c.rapporto]}
                {c.aziendaTipo !== "nessuna"
                  ? ` → ${AZIENDA_TIPO_LABELS[c.aziendaTipo]}`
                  : ""}
                {c.aziendaLabel ? ` · ${c.aziendaLabel}` : ""}
                {c.mansione ? ` · ${c.mansione}` : ""}
              </p>
              {c.note ? (
                <p className="mt-0.5 text-xs italic text-slate-600">{c.note}</p>
              ) : null}
              <p className="text-xs text-[var(--muted)]">
                {[c.telefono, c.email].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void openTimeline(c)}
              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
            >
              Timeline
            </button>
          </li>
        ))}
        {items.length === 0 && !pending ? (
          <li className="px-4 py-8 text-center text-sm text-[var(--muted)]">
            Nessun contatto in rubrica.
          </li>
        ) : null}
      </ul>

      {selected ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 py-10">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">
              Timeline — {displayContattoName(selected)}
            </h3>
            <p className="text-xs text-[var(--muted)]">
              Registra conversazioni, chiamate, mail o incontri. Nella
              descrizione puoi citare operatori con @Nome e riferire
              attività/note/promemoria.
            </p>

            <div className="mt-4 space-y-3 rounded-lg border border-[var(--border)] p-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Data / ora</span>
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Riassunto *</span>
                <input
                  value={riassunto}
                  onChange={(e) => setRiassunto(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Argomenti importanti</span>
                <input
                  value={argomenti}
                  onChange={(e) => setArgomenti(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Descrizione</span>
                <textarea
                  value={descrizione}
                  onChange={(e) => setDescrizione(e.target.value)}
                  rows={3}
                  placeholder="Es. @SandroIncorvaia ha parlato di… (puoi citare attività/note/promemoria)"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Modalità contatto</span>
                <select
                  value={modalita}
                  onChange={(e) =>
                    setModalita(e.target.value as RubricaModalita)
                  }
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                >
                  {(Object.keys(MODALITA_LABELS) as RubricaModalita[]).map(
                    (k) => (
                      <option key={k} value={k}>
                        {MODALITA_LABELS[k]}
                      </option>
                    )
                  )}
                </select>
              </label>
              {modalita === "incontro" ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">Link Google Maps *</span>
                  <input
                    value={mapsUrl}
                    onChange={(e) => setMapsUrl(e.target.value)}
                    placeholder="https://maps.google.com/…"
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              {modalita === "mail" ? (
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Collega mail gestionale
                  </span>
                  <select
                    value={mailId}
                    onChange={(e) => setMailId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                  >
                    <option value="">— opzionale —</option>
                    {mailOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                disabled={pending || !riassunto.trim()}
                onClick={addTimeline}
                className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Aggiungi interazione
              </button>
            </div>

            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
              {timeline.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-sm"
                >
                  <p className="font-medium">
                    {MODALITA_LABELS[t.modalita]} ·{" "}
                    {new Date(t.occurredAt).toLocaleString("it-IT")}
                  </p>
                  <p>{t.riassunto}</p>
                  {t.argomenti ? (
                    <p className="text-xs text-[var(--muted)]">
                      Argomenti: {t.argomenti}
                    </p>
                  ) : null}
                  {t.descrizione ? (
                    <p className="mt-1 whitespace-pre-wrap text-xs">
                      {t.descrizione}
                    </p>
                  ) : null}
                  {t.mapsUrl ? (
                    <a
                      href={t.mapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-[var(--primary)] underline"
                    >
                      Apri Maps
                    </a>
                  ) : null}
                </li>
              ))}
              {timeline.length === 0 ? (
                <li className="py-4 text-center text-sm text-[var(--muted)]">
                  Nessuna interazione ancora.
                </li>
              ) : null}
            </ul>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showCreate ? (
        <RubricaContattoFormModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}
