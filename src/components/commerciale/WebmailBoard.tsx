"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  confirmWebmailCategoriaSuggestionAction,
  generateWebmailAiReplyAction,
  getWebmailBozzaForMessaggioAction,
  linkWebmailMessaggioAnagraficaAction,
  listWebmailAccountsAction,
  listWebmailCategorieAction,
  listWebmailMessaggiAction,
  rejectWebmailCategoriaSuggestionAction,
  runWebmailSyncAction,
  sendWebmailBozzaAction,
  softDeleteWebmailMessaggioAction,
  updateWebmailBozzaAction,
} from "@/app/actions/webmail";
import { WebmailCategoriaModal } from "@/components/webmail/WebmailCategoriaModal";
import { WebmailCollegaAziendaModal } from "@/components/webmail/WebmailCollegaAziendaModal";
import type {
  WebmailAccountPublic,
  WebmailBozzaAi,
  WebmailCategoria,
  WebmailMessaggio,
} from "@/lib/webmail/types";

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
}: {
  initialAccountId?: string | null;
}) {
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [messaggi, setMessaggi] = useState<WebmailMessaggio[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>(
    initialAccountId ?? ""
  );
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [onlyDraft, setOnlyDraft] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bozza, setBozza] = useState<WebmailBozzaAi | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [aziendaModalOpen, setAziendaModalOpen] = useState(false);

  const selected = useMemo(
    () => messaggi.find((m) => m.id === selectedId) ?? null,
    [messaggi, selectedId]
  );

  const catById = useMemo(() => {
    const m = new Map<string, WebmailCategoria>();
    for (const c of categorie) m.set(c.id, c);
    return m;
  }, [categorie]);

  const reload = useCallback(async () => {
    setError(null);
    const [a, c, m] = await Promise.all([
      listWebmailAccountsAction(),
      listWebmailCategorieAction(),
      listWebmailMessaggiAction({
        accountId: accountFilter || null,
        categoriaId: categoriaFilter || null,
        onlyAiDraft: onlyDraft,
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
  }, [accountFilter, categoriaFilter, onlyDraft]);

  useEffect(() => {
    setAccountFilter(initialAccountId ?? "");
    setSelectedId(null);
  }, [initialAccountId]);

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
          Leggi la mail, genera la risposta AI solo quando serve, sposta in
          categoria e collega l’azienda. Il sistema impara dalle tue conferme
          (soglie 2 / 4 / 6).
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={syncNow}
          className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Sincronizza ora
        </button>
      </div>

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
      </div>

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
            <div className="grid h-full gap-0 lg:grid-cols-2">
              <section className="border-b border-[var(--border)] p-4 lg:border-b-0 lg:border-r">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Mail ricevuta
                </h3>
                <p className="mt-2 font-semibold text-slate-900">
                  {selected.subject}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  Da {selected.fromName || selected.fromAddress} ·{" "}
                  {formatWhen(selected.receivedAt)}
                </p>

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

                <div className="mt-3 flex flex-wrap gap-2">
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
                <pre className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                  {selected.bodyText || "(vuoto)"}
                </pre>
              </section>
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
