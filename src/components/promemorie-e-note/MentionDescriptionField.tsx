"use client";

import { useEffect, useRef, useState } from "react";
import { searchAttivitaMentionAction } from "@/app/actions/attivita-mentions";
import { MentionMailModal } from "@/components/promemorie-e-note/MentionMailModal";
import {
  ATTIVITA_MENTION_LEGGENDA,
  buildMentionToken,
  collegamentiStillInText,
  detectActiveMention,
  insertMentionToken,
  mentionHref,
  specForKind,
  splitDescriptionMentions,
  type ActiveMention,
  type AttivitaMentionHit,
  type AttivitaMentionKind,
  type PnAttivitaCollegamento,
} from "@/lib/promemorie-e-note/mention-tokens";

type Props = {
  value: string;
  onChange: (next: string) => void;
  collegamenti: PnAttivitaCollegamento[];
  onCollegamentiChange: (next: PnAttivitaCollegamento[]) => void;
  placeholder?: string;
  rows?: number;
};

export function MentionDescriptionView({
  text,
  collegamenti,
}: {
  text: string;
  collegamenti: PnAttivitaCollegamento[];
}) {
  if (!text) return null;
  const parts = splitDescriptionMentions(text, collegamenti);
  return (
    <p className="mt-1 whitespace-pre-wrap text-sm">
      {parts.map((p, i) => {
        if (p.type === "text") return <span key={i}>{p.value}</span>;
        const href = p.link ? mentionHref(p.link) : null;
        if (!href) {
          return (
            <span key={i} className="font-medium text-sky-800">
              {p.value}
            </span>
          );
        }
        return (
          <a
            key={i}
            href={href}
            className="font-medium text-sky-800 underline"
          >
            {p.value}
          </a>
        );
      })}
    </p>
  );
}

export function MentionDescriptionField({
  value,
  onChange,
  collegamenti,
  onCollegamentiChange,
  placeholder,
  rows = 4,
}: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const [active, setActive] = useState<ActiveMention | null>(null);
  const [hits, setHits] = useState<AttivitaMentionHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const mailAnchor = useRef<{ start: number; end: number } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  function setText(next: string, cursor?: number) {
    onChange(next);
    onCollegamentiChange(collegamentiStillInText(next, collegamenti));
    if (cursor != null) {
      requestAnimationFrame(() => {
        const el = areaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(cursor, cursor);
      });
    }
  }

  function refreshActiveFromTextarea() {
    const el = areaRef.current;
    if (!el) return;
    const next = detectActiveMention(el.value, el.selectionStart ?? 0);
    setActive(next);
    if (next?.kind === "mail") {
      mailAnchor.current = { start: next.start, end: next.end };
      setMailOpen(true);
      setActive(null);
    }
  }

  useEffect(() => {
    if (!active || active.kind === "mail") {
      setHits([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      setLoading(true);
      setSearchError(null);
      void searchAttivitaMentionAction({
        kind: active.kind,
        q: active.query,
      }).then((res) => {
        if (cancelled) return;
        setLoading(false);
        if (!res.success) {
          setSearchError(res.error);
          setHits([]);
          return;
        }
        setHits(res.items);
      });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [active?.kind, active?.query, active?.start]);

  function applyHit(kind: AttivitaMentionKind, hit: AttivitaMentionHit) {
    const el = areaRef.current;
    const anchor = kind === "mail" ? mailAnchor.current : null;
    const start =
      active?.start ?? anchor?.start ?? el?.selectionStart ?? value.length;
    const end = active?.end ?? anchor?.end ?? el?.selectionEnd ?? value.length;
    const token = buildMentionToken(kind, hit.label, hit.entityId);
    const inserted = insertMentionToken(value, start, end, token);
    const nextLink: PnAttivitaCollegamento = {
      kind,
      entityId: hit.entityId,
      entityLabel: hit.label,
      token,
      meta: hit.meta ?? {},
    };
    const kept = collegamentiStillInText(inserted.text, collegamenti).filter(
      (c) => !(c.kind === kind && c.entityId === hit.entityId)
    );
    onCollegamentiChange([...kept, nextLink]);
    onChange(inserted.text);
    setActive(null);
    setHits([]);
    setLegendOpen(false);
    setMailOpen(false);
    mailAnchor.current = null;
    requestAnimationFrame(() => {
      const box = areaRef.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(inserted.cursor, inserted.cursor);
    });
  }

  function startFromLegend(kind: AttivitaMentionKind) {
    const spec = specForKind(kind);
    const el = areaRef.current;
    const pos = el?.selectionStart ?? value.length;
    const prefix = `@${spec.prefix}`;
    const before = value.slice(0, pos);
    const after = value.slice(pos);
    const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
    const inserted = `${lead}${prefix}`;
    const next = `${before}${inserted}${after}`;
    const start = before.length + lead.length;
    setText(next, start + prefix.length);
    setLegendOpen(false);
    if (kind === "mail") {
      mailAnchor.current = { start, end: start + prefix.length };
      setMailOpen(true);
      setActive(null);
      return;
    }
    setActive({
      start,
      end: start + prefix.length,
      kind,
      prefix: spec.prefix,
      query: "",
    });
  }

  const showPicker = Boolean(active && active.kind !== "mail");

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="block text-xs font-medium">Descrizione</span>
        <button
          type="button"
          onClick={() => setLegendOpen((v) => !v)}
          className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium hover:bg-slate-50"
        >
          Leggenda @
        </button>
      </div>
      <div className="relative">
        <textarea
          ref={areaRef}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            const next = detectActiveMention(
              e.target.value,
              e.target.selectionStart ?? 0
            );
            if (next?.kind === "mail") {
              mailAnchor.current = { start: next.start, end: next.end };
              setMailOpen(true);
              setActive(null);
              return;
            }
            setActive(next);
          }}
          onClick={refreshActiveFromTextarea}
          onKeyUp={refreshActiveFromTextarea}
          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
        />

        {legendOpen ? (
          <div className="absolute right-0 top-0 z-20 w-72 rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg">
            <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-[var(--muted)]">
              Comandi @
            </p>
            <ul className="max-h-64 overflow-y-auto">
              {ATTIVITA_MENTION_LEGGENDA.map((s) => (
                <li key={s.kind}>
                  <button
                    type="button"
                    onClick={() => startFromLegend(s.kind)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                  >
                    <span>
                      <span className="font-medium">{s.label}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--muted)]">
                        {s.example}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] text-slate-500">
                      {s.prefix ? `@${s.prefix}` : "@"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {showPicker ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[var(--border)] bg-white p-2 shadow-lg">
            <p className="px-1 pb-1 text-[11px] font-medium text-[var(--muted)]">
              {specForKind(active!.kind).label}
              {active!.query ? ` · “${active!.query}”` : ""}
            </p>
            {loading ? (
              <p className="px-1 text-xs text-[var(--muted)]">Ricerca…</p>
            ) : searchError ? (
              <p className="px-1 text-xs text-red-700">{searchError}</p>
            ) : hits.length === 0 ? (
              <p className="px-1 text-xs text-[var(--muted)]">
                Nessun risultato. Continua a digitare o usa la leggenda.
              </p>
            ) : (
              <ul>
                {hits.map((hit) => (
                  <li key={hit.entityId}>
                    <button
                      type="button"
                      onClick={() => applyHit(active!.kind, hit)}
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50"
                    >
                      <span className="font-medium">{hit.label}</span>
                      {hit.hint ? (
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          {hit.hint}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {mailOpen ? (
        <MentionMailModal
          onClose={() => setMailOpen(false)}
          onPick={(hit) => applyHit("mail", hit)}
        />
      ) : null}
    </div>
  );
}
