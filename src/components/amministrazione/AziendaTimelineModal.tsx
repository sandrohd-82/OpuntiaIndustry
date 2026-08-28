"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";
import {
  linkWebmailToAziendaTimelineAction,
  listAziendaTimelineAction,
  listAziendaTimelineMailHintsAction,
  searchWebmailForAziendaTimelineAction,
  type AziendaTimelineMailHint,
  type AziendaTimelineMailHit,
} from "@/app/actions/azienda-timeline";
import type {
  AziendaTimelineItem,
  AziendaTimelineKind,
  AziendaTimelineTipo,
} from "@/lib/amministrazione/azienda-timeline";
import { hasNestedModalOpen } from "@/lib/ui/nested-modal";
import { NotaRichBody } from "@/components/promemorie-e-note/NotaRichBody";

const KIND_LABEL: Record<AziendaTimelineKind, string> = {
  webmail: "WebMail",
  rubrica: "Rubrica",
  nota: "Nota",
  ordine: "Ordine",
  fattura_emessa: "Fattura emessa",
  fattura_ricevuta: "Fattura ricevuta",
};

const KIND_CLASS: Record<AziendaTimelineKind, string> = {
  webmail: "bg-sky-100 text-sky-800",
  rubrica: "bg-violet-100 text-violet-800",
  nota: "bg-amber-100 text-amber-900",
  ordine: "bg-emerald-100 text-emerald-800",
  fattura_emessa: "bg-teal-100 text-teal-800",
  fattura_ricevuta: "bg-orange-100 text-orange-900",
};

const KIND_DOT: Record<AziendaTimelineKind, string> = {
  webmail: "bg-sky-500",
  rubrica: "bg-violet-500",
  nota: "bg-amber-500",
  ordine: "bg-emerald-500",
  fattura_emessa: "bg-teal-500",
  fattura_ricevuta: "bg-orange-500",
};

type Props = {
  aziendaTipo: AziendaTimelineTipo;
  aziendaId: string;
  aziendaLabel: string;
  onClose: () => void;
  elevated?: boolean;
};

function TimelineCard({
  item,
  align,
}: {
  item: AziendaTimelineItem;
  align: "left" | "right";
}) {
  const isNota = item.kind === "nota";
  return (
    <article
      className={`rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm shadow-sm ${
        align === "left" ? "md:text-right" : "md:text-left"
      }`}
    >
      <div
        className={`flex flex-wrap items-center gap-2 ${
          align === "left" ? "md:justify-end" : "md:justify-start"
        }`}
      >
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_CLASS[item.kind]}`}
        >
          {KIND_LABEL[item.kind]}
        </span>
        <time dateTime={item.occurredAt} className="text-xs text-[var(--muted)]">
          {new Date(item.occurredAt).toLocaleString("it-IT")}
        </time>
      </div>
      <p className="mt-1.5 font-medium text-slate-900">{item.title}</p>
      {isNota ? (
        <div className={`mt-2 ${align === "left" ? "md:text-left" : ""}`}>
          <NotaRichBody
            compact
            body={item.notaBody}
            bodyRich={item.notaBodyRich}
            allegati={item.notaAllegati}
          />
        </div>
      ) : item.subtitle ? (
        <p className="mt-0.5 text-xs text-[var(--muted)]">{item.subtitle}</p>
      ) : null}
    </article>
  );
}

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

export function AziendaTimelineModal({
  aziendaTipo,
  aziendaId,
  aziendaLabel,
  onClose,
  elevated = false,
}: Props) {
  const [items, setItems] = useState<AziendaTimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "mail">("none");

  const [mailHints, setMailHints] = useState<AziendaTimelineMailHint[]>([]);
  const [mailDomains, setMailDomains] = useState<string[]>([]);
  const [mailQuery, setMailQuery] = useState("");
  const [mailHits, setMailHits] = useState<AziendaTimelineMailHit[]>([]);
  const [mailSearching, setMailSearching] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listAziendaTimelineAction({ aziendaTipo, aziendaId });
    if (res.success) {
      setItems(res.items);
    } else {
      setItems([]);
      setError(res.error);
    }
    setLoading(false);
  }, [aziendaTipo, aziendaId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (panel !== "mail") return;
    void listAziendaTimelineMailHintsAction({ aziendaTipo, aziendaId }).then(
      (res) => {
        if (res.success) {
          setMailHints(res.emails);
          setMailDomains(res.domains);
        }
      }
    );
    void runMailSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo all'apertura pannello
  }, [panel, aziendaTipo, aziendaId]);

  async function runMailSearch(query: string) {
    setMailSearching(true);
    const res = await searchWebmailForAziendaTimelineAction({
      aziendaTipo,
      aziendaId,
      emailQuery: query,
    });
    setMailSearching(false);
    if (!res.success) {
      setError(res.error);
      setMailHits([]);
      return;
    }
    setMailHits(res.items);
    setMailDomains(res.domains);
  }

  const displayItems = useMemo(() => [...items].reverse(), [items]);

  function linkMail(hit: AziendaTimelineMailHit) {
    if (hit.alreadyLinked) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await linkWebmailToAziendaTimelineAction({
        aziendaTipo,
        aziendaId,
        aziendaLabel,
        messaggioId: hit.id,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Mail collegata alla timeline.");
      await reload();
      await runMailSearch(mailQuery);
    });
  }

  const dialog = (
    <div
      className={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-950/55 p-3 py-6 sm:p-6 sm:py-10 ${
        elevated ? "z-[100]" : "z-[80]"
      }`}
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        if (hasNestedModalOpen()) return;
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Timeline ${aziendaLabel}`}
        className="flex w-full max-w-[min(96vw,90rem)] flex-col rounded-2xl border border-[var(--border)] bg-slate-50 shadow-2xl"
        style={{ maxHeight: "min(92vh, 56rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-[var(--border)] bg-white px-5 py-4 sm:px-8">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold sm:text-xl">
              Timeline — {aziendaLabel || "Azienda"}
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)] sm:text-sm">
              Asse dal basso (passato) all’alto (recente). Le note si creano
              dalla scheda azienda; qui puoi collegare mail WebMail.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setPanel((p) => (p === "mail" ? "none" : "mail"))
              }
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-950 hover:bg-sky-100"
            >
              + Mail
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              Chiudi
            </button>
          </div>
        </div>

        {panel === "mail" ? (
          <div className="shrink-0 border-b border-[var(--border)] bg-sky-50/80 px-5 py-4 sm:px-8">
            <p className="text-sm font-medium text-sky-950">
              Collega mail WebMail
            </p>
            <p className="mt-0.5 text-xs text-sky-900/80">
              Default: indirizzi scheda/referenti e stesso dominio aziendale
              (escl. caselle consumer). Solo caselle con i tuoi permessi.
            </p>
            {mailHints.length > 0 || mailDomains.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {mailHints.map((h) => (
                  <button
                    key={`${h.email}-${h.source}`}
                    type="button"
                    onClick={() => {
                      setMailQuery(h.email);
                      void runMailSearch(h.email);
                    }}
                    className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[11px] text-sky-900 hover:bg-sky-100"
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
                      void runMailSearch(`@${d}`);
                    }}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-900"
                  >
                    @{d}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                value={mailQuery}
                onChange={(e) => setMailQuery(e.target.value)}
                placeholder="Cerca indirizzo email…"
                className="min-w-[14rem] flex-1 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={mailSearching}
                onClick={() => void runMailSearch(mailQuery)}
                className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {mailSearching ? "Cerco…" : "Cerca"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMailQuery("");
                  void runMailSearch("");
                }}
                className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs"
              >
                Suggerite
              </button>
            </div>
            <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
              {mailHits.length === 0 && !mailSearching ? (
                <li className="text-xs text-[var(--muted)]">
                  Nessuna mail trovata nelle caselle accessibili.
                </li>
              ) : (
                mailHits.map((hit) => (
                  <li
                    key={hit.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">
                        {hit.subject}
                      </p>
                      <p className="truncate text-[var(--muted)]">
                        {hit.fromName || hit.fromAddress} ·{" "}
                        {formatWhen(hit.receivedAt)} · {hit.matchReason}
                      </p>
                    </div>
                    {hit.alreadyLinked ? (
                      <span className="shrink-0 rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">
                        Già in timeline
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => linkMail(hit)}
                        className="shrink-0 rounded-lg bg-sky-700 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                      >
                        Collega
                      </button>
                    )}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {(error || info) && (
          <div className="shrink-0 px-5 pt-3 sm:px-8">
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            {info ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {info}
              </p>
            ) : null}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-8">
          {loading ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">
              Caricamento timeline…
            </p>
          ) : displayItems.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--muted)]">
              Nessuna attività. Usa + Mail per collegare una mail, oppure crea
              una nota dalla scheda azienda.
            </p>
          ) : (
            <div className="relative mx-auto w-full max-w-6xl">
              <div
                className="pointer-events-none absolute bottom-2 left-4 top-2 w-0.5 bg-gradient-to-t from-slate-300 via-slate-400 to-slate-300 md:left-1/2 md:-translate-x-1/2"
                aria-hidden
              />
              <ol className="relative space-y-8 md:space-y-10">
                {displayItems.map((item, index) => {
                  const onLeft = index % 2 === 0;
                  return (
                    <li
                      key={item.id}
                      className="relative grid grid-cols-[1.25rem_1fr] items-start gap-3 md:grid-cols-[1fr_2.5rem_1fr] md:gap-6"
                    >
                      <div className="relative z-10 flex justify-center pt-3 md:hidden">
                        <span
                          className={`h-3 w-3 rounded-full ring-4 ring-slate-50 ${KIND_DOT[item.kind]}`}
                          aria-hidden
                        />
                      </div>
                      <div className="md:hidden">
                        <TimelineCard item={item} align="right" />
                      </div>
                      <div className="hidden md:block">
                        {onLeft ? (
                          <TimelineCard item={item} align="left" />
                        ) : (
                          <div aria-hidden className="h-1" />
                        )}
                      </div>
                      <div className="relative z-10 hidden justify-center pt-3 md:flex">
                        <span
                          className={`h-3.5 w-3.5 rounded-full ring-4 ring-slate-50 ${KIND_DOT[item.kind]}`}
                          aria-hidden
                        />
                      </div>
                      <div className="hidden md:block">
                        {!onLeft ? (
                          <TimelineCard item={item} align="right" />
                        ) : (
                          <div aria-hidden className="h-1" />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-6 flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
                <span aria-hidden>↑</span>
                <span>Recente</span>
                <span className="mx-2 text-slate-300">·</span>
                <span>Passato</span>
                <span aria-hidden>↓</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return null;
  return createPortal(dialog, document.body);
}
