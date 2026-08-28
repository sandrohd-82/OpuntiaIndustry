"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { FaChevronDown } from "react-icons/fa6";
import {
  addWebmailBlacklistAction,
  confirmWebmailCategoriaSuggestionAction,
  generateWebmailAiReplyAction,
  getWebmailBozzaForMessaggioAction,
  isWebmailSenderBlacklistedAction,
  linkWebmailMessaggioAnagraficaAction,
  listWebmailAccountsAction,
  listWebmailCategorieAction,
  listWebmailMessaggiAction,
  rejectWebmailCategoriaSuggestionAction,
  restoreWebmailMessaggioAction,
  runWebmailSyncAction,
  sendWebmailBozzaAction,
  softDeleteWebmailMessaggioAction,
  translateWebmailTextAction,
  updateWebmailBozzaAction,
} from "@/app/actions/webmail";
import { WebmailCategoriaModal } from "@/components/webmail/WebmailCategoriaModal";
import { WebmailCollegaAziendaModal } from "@/components/webmail/WebmailCollegaAziendaModal";
import type {
  WebmailAccountPublic,
  WebmailBozzaAi,
  WebmailCategoria,
  WebmailMailboxView,
  WebmailMessaggio,
} from "@/lib/webmail/types";
import { WEBMAIL_TRANSLATE_LANGS } from "@/lib/webmail/translate-langs";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

function linkStatoLabel(stato: WebmailMessaggio["linkStato"]) {
  if (stato === "collegata") return "Collegata";
  if (stato === "da_salvare") return "Da salvare";
  return "Bozza";
}

export function WebmailBoard({
  initialAccountId = null,
  view = "all",
  categoriaId = null,
  hideTopFilters = false,
}: {
  initialAccountId?: string | null;
  view?: WebmailMailboxView;
  categoriaId?: string | null;
  /** Nasconde filtri account/categoria quando la vista è guidata dal menu. */
  hideTopFilters?: boolean;
}) {
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [messaggi, setMessaggi] = useState<WebmailMessaggio[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>(
    initialAccountId ?? ""
  );
  const [categoriaFilter, setCategoriaFilter] = useState<string>(
    categoriaId ?? ""
  );
  const [onlyDraft, setOnlyDraft] = useState(view === "bozze");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bozza, setBozza] = useState<WebmailBozzaAi | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [aziendaModalOpen, setAziendaModalOpen] = useState(false);
  const [senderBlacklisted, setSenderBlacklisted] = useState(false);
  const [blacklistAllAccounts, setBlacklistAllAccounts] = useState(false);
  const [headersOpen, setHeadersOpen] = useState(false);
  const [inboundTranslation, setInboundTranslation] = useState<{
    subject: string | null;
    bodyText: string;
    targetLangLabel: string;
  } | null>(null);
  const [showInboundTranslation, setShowInboundTranslation] = useState(false);
  const [outboundLang, setOutboundLang] = useState("en");
  const [outboundTranslation, setOutboundTranslation] = useState<{
    subject: string | null;
    bodyText: string;
    targetLangLabel: string;
  } | null>(null);

  const selected = useMemo(
    () => messaggi.find((m) => m.id === selectedId) ?? null,
    [messaggi, selectedId]
  );

  useEffect(() => {
    setHeadersOpen(false);
    setInboundTranslation(null);
    setShowInboundTranslation(false);
    setOutboundTranslation(null);
  }, [selectedId]);

  const catById = useMemo(() => {
    const m = new Map<string, WebmailCategoria>();
    for (const c of categorie) m.set(c.id, c);
    return m;
  }, [categorie]);

  const reload = useCallback(async () => {
    setError(null);
    const effectiveView = view;
    const [a, c, m] = await Promise.all([
      listWebmailAccountsAction(),
      listWebmailCategorieAction(),
      listWebmailMessaggiAction({
        accountId: accountFilter || null,
        categoriaId:
          effectiveView === "categoria"
            ? categoriaId || categoriaFilter || null
            : effectiveView === "all"
              ? categoriaFilter || null
              : null,
        onlyAiDraft: effectiveView === "bozze" ? true : onlyDraft,
        view: effectiveView,
      }),
    ]);
    if (!a.success) {
      setError(a.error);
      return;
    }
    if (!c.success) {
      setError(c.error);
      return;
    }
    if (!m.success) {
      setError(m.error);
      return;
    }
    setAccounts(a.accounts);
    setCategorie(c.items);
    setMessaggi(m.messaggi);
  }, [accountFilter, categoriaFilter, onlyDraft, view, categoriaId]);

  useEffect(() => {
    setAccountFilter(initialAccountId ?? "");
    setSelectedId(null);
  }, [initialAccountId]);

  useEffect(() => {
    setCategoriaFilter(categoriaId ?? "");
    setSelectedId(null);
  }, [categoriaId]);

  useEffect(() => {
    setOnlyDraft(view === "bozze");
  }, [view]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedId) {
      setBozza(null);
      return;
    }
    void (async () => {
      const res = await getWebmailBozzaForMessaggioAction(selectedId);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozza(res.bozza);
      setDraftSubject(res.bozza?.subject ?? "");
      setDraftBody(res.bozza?.bodyText ?? "");
    })();
  }, [selectedId]);

  useEffect(() => {
    if (!selected?.fromAddress || !selected.accountId) {
      setSenderBlacklisted(false);
      return;
    }
    void isWebmailSenderBlacklistedAction({
      emailAddress: selected.fromAddress,
      accountId: selected.accountId,
    }).then((res) => {
      if (res.success) setSenderBlacklisted(res.blacklisted);
    });
  }, [selected?.id, selected?.fromAddress, selected?.accountId]);

  function patchMessaggio(m: WebmailMessaggio) {
    setMessaggi((prev) => prev.map((x) => (x.id === m.id ? m : x)));
  }

  function syncNow() {
    setInfo(null);
    startTransition(async () => {
      try {
        const res = await runWebmailSyncAction(accountFilter || undefined);
        if (!res.success) {
          setError(res.error);
          return;
        }
        const errs = res.errors ?? [];
        setInfo(
          `Sync: ${res.imported} nuovi` +
            (res.pending > 0
              ? ` · ancora ${res.pending} da importare (premi di nuovo Sincronizza)`
              : "") +
            (errs.length ? ` · ${errs.join("; ")}` : "")
        );
        await reload();
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Errore sync (timeout o connessione). Riprova."
        );
      }
    });
  }

  function generateAi() {
    if (!selected) return;
    setInfo(null);
    startTransition(async () => {
      const res = await generateWebmailAiReplyAction(selected.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozza(res.bozza);
      setDraftSubject(res.bozza.subject);
      setDraftBody(res.bozza.bodyText);
      patchMessaggio({ ...selected, hasAiDraft: true });
      setInfo("Risposta AI generata — controlla e invia se corretta.");
    });
  }

  function saveDraft() {
    if (!bozza) return;
    startTransition(async () => {
      const res = await updateWebmailBozzaAction({
        bozzaId: bozza.id,
        subject: draftSubject,
        bodyText: draftBody,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setBozza((prev) =>
        prev
          ? { ...prev, subject: draftSubject, bodyText: draftBody }
          : prev
      );
      setInfo("Bozza salvata.");
    });
  }

  function sendDraft() {
    if (!bozza) return;
    if (
      !window.confirm(
        "Inviare questa email dalla casella collegata? L’operazione sarà registrata in audit."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await sendWebmailBozzaAction({ bozzaId: bozza.id });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Email inviata. Audit registrato.");
      setBozza(null);
      await reload();
    });
  }

  const suggestCat = selected?.categoriaSuggestId
    ? catById.get(selected.categoriaSuggestId)
    : null;
  const currentCat = selected?.categoriaId
    ? catById.get(selected.categoriaId)
    : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          {view === "cestino"
            ? "Mail eliminate (soft delete). Puoi ripristinarle nel gestionale."
            : view === "inbox"
              ? "In arrivo: messaggi senza categoria. Spostali in una categoria quando li classifichi."
              : view === "bozze"
                ? "Messaggi con bozza AI da revisionare o inviare."
                : view === "categoria"
                  ? "Messaggi nella categoria selezionata."
                  : "Leggi la mail, genera la risposta AI solo quando serve, sposta in categoria e collega l’azienda. Il sistema impara dalle tue conferme (soglie 2 / 4 / 6)."}
        </p>
        {view !== "cestino" ? (
          <button
            type="button"
            disabled={pending}
            onClick={syncNow}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Sincronizza ora
          </button>
        ) : null}
      </div>

      {hideTopFilters ? null : (
      <div className="flex flex-wrap gap-2">
        {initialAccountId ? null : (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
          >
            <option value="">Tutte le caselle</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.emailAddress})
              </option>
            ))}
          </select>
        )}
        {view === "all" ? (
          <>
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm"
            >
              <option value="">Tutte le categorie</option>
              {categorie.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={onlyDraft}
                onChange={(e) => setOnlyDraft(e.target.checked)}
              />
              Solo con bozza AI
            </label>
          </>
        ) : null}
      </div>
      )}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ul className="max-h-[70vh] space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-2">
          {messaggi.length === 0 ? (
            <li className="p-4 text-center text-sm text-[var(--muted)]">
              Nessun messaggio. Se la casella è già collegata, sincronizza.
            </li>
          ) : (
            messaggi.map((m) => {
              const cat = m.categoriaId ? catById.get(m.categoriaId) : null;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                      selectedId === m.id
                        ? "border-sky-400 bg-sky-50"
                        : "border-transparent hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-1 font-medium text-slate-900">
                        {m.subject}
                      </p>
                      {m.hasAiDraft ? (
                        <span className="shrink-0 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                          Bozza AI
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
                      {m.fromName || m.fromAddress} · {formatWhen(m.receivedAt)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {cat ? (
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                          style={{ background: cat.colore }}
                        >
                          {cat.nome}
                        </span>
                      ) : null}
                      {m.categoriaAutoPending ? (
                        <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                          Auto-spostata
                        </span>
                      ) : null}
                      {m.aziendaLabel ? (
                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900">
                          {m.aziendaLabel}
                        </span>
                      ) : (
                        <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                          {linkStatoLabel(m.linkStato)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="min-h-[24rem] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {!selected ? (
            <p className="p-6 text-sm text-[var(--muted)]">
              Seleziona una mail per leggerla e agire.
            </p>
          ) : (
            <div
              className={`grid h-full gap-0 ${
                view === "cestino" ? "" : "lg:grid-cols-2"
              }`}
            >
              <section className="border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Mail ricevuta
                </h3>
                <p className="mt-2 font-semibold text-slate-900">
                  {selected.subject}
                </p>
                <div className="mt-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                    <span className="min-w-0 truncate">
                      Da {selected.fromName || selected.fromAddress} ·{" "}
                      {formatWhen(selected.receivedAt)}
                    </span>
                    <button
                      type="button"
                      aria-expanded={headersOpen}
                      aria-label={
                        headersOpen
                          ? "Nascondi dettagli mail e header"
                          : "Mostra dettagli mail e header"
                      }
                      title="Dettagli mail e header"
                      onClick={() => setHeadersOpen((v) => !v)}
                      className="inline-flex shrink-0 items-center justify-center rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      <FaChevronDown
                        size={11}
                        className={`transition-transform duration-150 ${
                          headersOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                  {headersOpen ? (
                    <dl className="mt-2 space-y-1.5 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2.5 text-xs text-slate-800">
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">Da</dt>
                        <dd className="break-all">
                          {selected.fromName
                            ? `${selected.fromName} <${selected.fromAddress}>`
                            : selected.fromAddress || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">A</dt>
                        <dd className="break-all">
                          {selected.toAddresses.length
                            ? selected.toAddresses.join(", ")
                            : "—"}
                        </dd>
                      </div>
                      {selected.ccAddresses.length > 0 ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">Cc</dt>
                          <dd className="break-all">
                            {selected.ccAddresses.join(", ")}
                          </dd>
                        </div>
                      ) : null}
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Oggetto
                        </dt>
                        <dd className="break-words">
                          {selected.subject || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Data arrivo
                        </dt>
                        <dd>{formatWhen(selected.receivedAt)}</dd>
                      </div>
                      {selected.sentAt ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">
                            Data invio
                          </dt>
                          <dd>{formatWhen(selected.sentAt)}</dd>
                        </div>
                      ) : null}
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Message-ID
                        </dt>
                        <dd className="break-all font-mono text-[11px]">
                          {selected.messageIdHeader || "—"}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Cartella
                        </dt>
                        <dd>
                          {selected.folder || "INBOX"}
                          {selected.messageUid
                            ? ` · UID ${selected.messageUid}`
                            : ""}
                        </dd>
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                        <dt className="font-medium text-[var(--muted)]">
                          Direzione
                        </dt>
                        <dd>
                          {selected.direction === "outbound"
                            ? "In uscita"
                            : "In arrivo"}
                        </dd>
                      </div>
                      {selected.createdAt ? (
                        <div className="grid gap-0.5 sm:grid-cols-[7.5rem_1fr]">
                          <dt className="font-medium text-[var(--muted)]">
                            Importata
                          </dt>
                          <dd>{formatWhen(selected.createdAt)}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </div>

                {selected.categoriaAutoPending && currentCat ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    <p>
                      Il sistema ha spostato questa mail in{" "}
                      <strong>{currentCat.nome}</strong>. Confermi che è
                      corretto?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded bg-amber-800 px-2 py-1 text-[11px] font-medium text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await confirmWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                            setInfo(
                              `Confermato. Apprendimento: ${res.learnMode}.`
                            );
                          });
                        }}
                      >
                        Sì, corretto
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-[11px] font-medium"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await rejectWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                            setCatModalOpen(true);
                          });
                        }}
                      >
                        No, cambia
                      </button>
                    </div>
                  </div>
                ) : null}

                {selected.categoriaSuggestMode === "suggest" &&
                suggestCat &&
                !selected.categoriaAutoPending ? (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                    <p>
                      Questa mail sembra della categoria{" "}
                      <strong>{suggestCat.nome}</strong>. Confermi?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded bg-sky-700 px-2 py-1 text-[11px] font-medium text-white"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await confirmWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                            setInfo(
                              `Categoria applicata. Apprendimento: ${res.learnMode}.`
                            );
                          });
                        }}
                      >
                        Conferma
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-sky-300 bg-white px-2 py-1 text-[11px] font-medium"
                        onClick={() => {
                          startTransition(async () => {
                            const res =
                              await rejectWebmailCategoriaSuggestionAction(
                                selected.id
                              );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            patchMessaggio(res.messaggio);
                          });
                        }}
                      >
                        Ignora
                      </button>
                    </div>
                  </div>
                ) : null}

                {selected.categoriaSuggestMode === "auto_silent" &&
                selected.categoriaAutoNotified &&
                currentCat &&
                !selected.categoriaAutoPending ? (
                  <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    Spostata automaticamente in <strong>{currentCat.nome}</strong>{" "}
                    (apprendimento consolidato).
                  </p>
                ) : null}

                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs text-rose-950">
                  <label className="flex cursor-pointer items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={senderBlacklisted}
                      disabled={pending || senderBlacklisted}
                      onChange={(e) => {
                        if (!e.target.checked || !selected) return;
                        const applyAll = blacklistAllAccounts;
                        if (
                          !window.confirm(
                            applyAll
                              ? `Non importare più mail da ${selected.fromAddress} su TUTTE le caselle?\nVerranno eliminate dal gestionale tutte le mail già presenti da questo mittente.`
                              : `Non importare più mail da ${selected.fromAddress} su questa casella?\nVerranno eliminate dal gestionale tutte le mail già presenti da questo mittente.`
                          )
                        ) {
                          return;
                        }
                        startTransition(async () => {
                          const res = await addWebmailBlacklistAction({
                            emailAddress: selected.fromAddress,
                            accountId: selected.accountId,
                            applyToAllAccounts: applyAll,
                            messaggioId: selected.id,
                          });
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setSenderBlacklisted(true);
                          setSelectedId(null);
                          setBozza(null);
                          setInfo(
                            `Blacklist ${res.item.emailAddress}: eliminate ${res.purged} mail. Non verranno più importate.`
                          );
                          await reload();
                        });
                      }}
                    />
                    <span>
                      <span className="font-semibold">Non importare più</span>{" "}
                      da <code>{selected.fromAddress}</code>
                      {senderBlacklisted ? " (già in blacklist)" : ""}
                    </span>
                  </label>
                  {!senderBlacklisted ? (
                    <label className="mt-2 flex items-center gap-2 pl-5 text-[11px]">
                      <input
                        type="checkbox"
                        checked={blacklistAllAccounts}
                        onChange={(e) =>
                          setBlacklistAllAccounts(e.target.checked)
                        }
                      />
                      Applica a tutte le caselle
                    </label>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {view === "cestino" ? (
                    <button
                      type="button"
                      disabled={pending}
                      className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                      onClick={() => {
                        startTransition(async () => {
                          const res = await restoreWebmailMessaggioAction(
                            selected.id
                          );
                          if (!res.success) {
                            setError(res.error);
                            return;
                          }
                          setSelectedId(null);
                          setInfo("Mail ripristinata dal cestino.");
                          await reload();
                        });
                      }}
                    >
                      Ripristina
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        onClick={() => setCatModalOpen(true)}
                      >
                        Sposta in categoria
                      </button>
                      <button
                        type="button"
                        className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                        onClick={() => setAziendaModalOpen(true)}
                      >
                        Collega ad azienda
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Eliminare questa mail dal gestionale? Verrà tentata anche la rimozione dalla casella IMAP (Trash). Non verrà più risincronizzata."
                            )
                          ) {
                            return;
                          }
                          startTransition(async () => {
                            const res = await softDeleteWebmailMessaggioAction(
                              selected.id
                            );
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            setSelectedId(null);
                            setBozza(null);
                            setInfo(
                              res.imapOk
                                ? `Mail eliminata. IMAP: ${res.imapDetail}`
                                : `Mail eliminata dal gestionale (non verrà più sincronizzata). IMAP: ${res.imapDetail}`
                            );
                            await reload();
                          });
                        }}
                      >
                        Elimina
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2 text-xs">
                  <p className="font-semibold text-slate-700">Anagrafica</p>
                  <p className="mt-1 text-slate-600">
                    {selected.aziendaLabel
                      ? `${selected.aziendaTipo ?? "azienda"} · ${selected.aziendaLabel}`
                      : "Nessuna azienda collegata"}
                    {" · "}
                    {linkStatoLabel(selected.linkStato)}
                    {selected.contattoId ? " · referente collegato" : ""}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    className="mt-2 rounded border border-[var(--border)] bg-white px-2 py-1 text-[11px] font-medium hover:bg-slate-100 disabled:opacity-50"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await linkWebmailMessaggioAnagraficaAction({
                          messaggioId: selected.id,
                          rematch: true,
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        patchMessaggio(res.messaggio);
                        setInfo("Match mittente aggiornato.");
                      });
                    }}
                  >
                    Ricalcola match mittente
                  </button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending || !selected.bodyText.trim()}
                    className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                    onClick={() => {
                      startTransition(async () => {
                        const res = await translateWebmailTextAction({
                          messaggioId: selected.id,
                          subject: selected.subject,
                          bodyText: selected.bodyText,
                          targetLang: "it",
                          direction: "inbound",
                        });
                        if (!res.success) {
                          setError(res.error);
                          return;
                        }
                        setInboundTranslation({
                          subject: res.subject,
                          bodyText: res.bodyText,
                          targetLangLabel: res.targetLangLabel,
                        });
                        setShowInboundTranslation(true);
                        setInfo(
                          `Traduzione in ${res.targetLangLabel} (${res.model}).`
                        );
                      });
                    }}
                  >
                    Traduci in italiano
                  </button>
                  {inboundTranslation ? (
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium hover:bg-slate-50"
                      onClick={() =>
                        setShowInboundTranslation((v) => !v)
                      }
                    >
                      {showInboundTranslation
                        ? "Mostra originale"
                        : "Mostra traduzione"}
                    </button>
                  ) : null}
                </div>
                <pre className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                  {showInboundTranslation && inboundTranslation
                    ? [
                        inboundTranslation.subject
                          ? `Oggetto: ${inboundTranslation.subject}`
                          : null,
                        inboundTranslation.bodyText,
                      ]
                        .filter(Boolean)
                        .join("\n\n")
                    : selected.bodyText || "(vuoto)"}
                </pre>
                {showInboundTranslation && inboundTranslation ? (
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    Traduzione Gemini → {inboundTranslation.targetLangLabel}{" "}
                    (originale non modificato)
                  </p>
                ) : null}
              </section>
              {view === "cestino" ? null : (
              <section className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Risposta AI
                </h3>
                {!bozza ? (
                  <div className="mt-4 space-y-3">
                    <p className="text-sm text-[var(--muted)]">
                      Nessuna bozza. Dopo aver letto la mail, genera una
                      proposta di risposta.
                    </p>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={generateAi}
                      className="rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Genera risposta AI
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs text-[var(--muted)]">
                      Intent: {bozza.intent}
                      {bozza.confidence != null
                        ? ` · ${bozza.confidence}%`
                        : ""}
                    </p>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium">
                        Oggetto
                      </span>
                      <input
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs font-medium">
                        Testo
                      </span>
                      <textarea
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        rows={14}
                        className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      />
                    </label>
                    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
                      <label className="text-xs">
                        <span className="mb-1 block font-medium text-[var(--muted)]">
                          Traduci bozza in
                        </span>
                        <select
                          value={outboundLang}
                          onChange={(e) => setOutboundLang(e.target.value)}
                          className="rounded border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
                        >
                          {WEBMAIL_TRANSLATE_LANGS.filter(
                            (l) => l.code !== "it"
                          ).map((l) => (
                            <option key={l.code} value={l.code}>
                              {l.label}
                            </option>
                          ))}
                          <option value="it">Italiano</option>
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={pending || !draftBody.trim()}
                        className="rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 text-xs font-medium text-sky-900 disabled:opacity-50"
                        onClick={() => {
                          startTransition(async () => {
                            const res = await translateWebmailTextAction({
                              messaggioId: selected.id,
                              bozzaId: bozza.id,
                              subject: draftSubject,
                              bodyText: draftBody,
                              targetLang: outboundLang,
                              direction: "outbound",
                            });
                            if (!res.success) {
                              setError(res.error);
                              return;
                            }
                            setOutboundTranslation({
                              subject: res.subject,
                              bodyText: res.bodyText,
                              targetLangLabel: res.targetLangLabel,
                            });
                            setInfo(
                              `Traduzione bozza → ${res.targetLangLabel} (${res.model}).`
                            );
                          });
                        }}
                      >
                        Traduci
                      </button>
                      {outboundTranslation ? (
                        <button
                          type="button"
                          disabled={pending}
                          className="rounded-lg bg-sky-700 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                          onClick={() => {
                            if (outboundTranslation.subject) {
                              setDraftSubject(outboundTranslation.subject);
                            }
                            setDraftBody(outboundTranslation.bodyText);
                            setInfo(
                              `Traduzione applicata al testo della bozza (${outboundTranslation.targetLangLabel}). Salva se vuoi conservarla.`
                            );
                          }}
                        >
                          Applica alla bozza
                        </button>
                      ) : null}
                    </div>
                    {outboundTranslation ? (
                      <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 p-2 text-xs text-slate-800">
                        {[
                          outboundTranslation.subject
                            ? `Oggetto: ${outboundTranslation.subject}`
                            : null,
                          outboundTranslation.bodyText,
                        ]
                          .filter(Boolean)
                          .join("\n\n")}
                      </pre>
                    ) : null}
                    {bozza.allegati.length > 0 ? (
                      <ul className="space-y-1 text-xs text-slate-700">
                        {bozza.allegati.map((a) => (
                          <li key={a.id}>Allegato: {a.fileName}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={generateAi}
                        className="rounded-lg border border-violet-300 px-3 py-2 text-sm text-violet-900"
                      >
                        Rigenera AI
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={saveDraft}
                        className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                      >
                        Salva modifiche
                      </button>
                      <button
                        type="button"
                        disabled={pending || bozza.documentoStato === "inviata"}
                        onClick={sendDraft}
                        className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      >
                        Invia email
                      </button>
                    </div>
                  </div>
                )}
              </section>
              )}
            </div>
          )}
        </div>
      </div>

      {selected ? (
        <>
          <WebmailCategoriaModal
            open={catModalOpen}
            messaggioId={selected.id}
            categorie={categorie}
            currentCategoriaId={selected.categoriaId}
            onClose={() => setCatModalOpen(false)}
            onCategoriaCreated={(c) =>
              setCategorie((prev) =>
                prev.some((x) => x.id === c.id) ? prev : [...prev, c]
              )
            }
            onDone={(_id, learnMode) => {
              setInfo(`Categoria aggiornata. Apprendimento: ${learnMode}.`);
              void reload();
            }}
          />
          <WebmailCollegaAziendaModal
            open={aziendaModalOpen}
            messaggio={selected}
            onClose={() => setAziendaModalOpen(false)}
            onDone={(m) => {
              patchMessaggio(m);
              setInfo("Azienda/referente collegati.");
            }}
          />
        </>
      ) : null}
    </div>
  );
}
