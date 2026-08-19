"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  getWebmailBozzaForMessaggioAction,
  listWebmailAccountsAction,
  listWebmailCategorieAction,
  listWebmailMessaggiAction,
  runWebmailSyncAction,
  sendWebmailBozzaAction,
  updateWebmailBozzaAction,
  upsertWebmailAccountAction,
} from "@/app/actions/webmail";
import {
  WEBMAIL_PROVIDER_PRESETS,
  type WebmailAccountPublic,
  type WebmailBozzaAi,
  type WebmailCategoria,
  type WebmailMessaggio,
  type WebmailProvider,
} from "@/lib/webmail/types";

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("it-IT");
  } catch {
    return iso;
  }
}

export function WebmailBoard() {
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [categorie, setCategorie] = useState<WebmailCategoria[]>([]);
  const [messaggi, setMessaggi] = useState<WebmailMessaggio[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>("");
  const [categoriaFilter, setCategoriaFilter] = useState<string>("");
  const [onlyDraft, setOnlyDraft] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bozza, setBozza] = useState<WebmailBozzaAi | null>(null);
  const [draftSubject, setDraftSubject] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [setupOpen, setSetupOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);

  const [provider, setProvider] = useState<WebmailProvider>("aruba");
  const preset = WEBMAIL_PROVIDER_PRESETS[provider];
  const [accLabel, setAccLabel] = useState("Casella commerciale");
  const [accEmail, setAccEmail] = useState("");
  const [accUser, setAccUser] = useState("");
  const [accPass, setAccPass] = useState("");
  const [imapHost, setImapHost] = useState(preset.imapHost);
  const [imapPort, setImapPort] = useState(preset.imapPort);
  const [smtpHost, setSmtpHost] = useState(preset.smtpHost);
  const [smtpPort, setSmtpPort] = useState(preset.smtpPort);

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
    if (editingId) return;
    const p = WEBMAIL_PROVIDER_PRESETS[provider];
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
  }, [provider, editingId]);

  function resetAccountForm() {
    setEditingId(null);
    setProvider("aruba");
    const p = WEBMAIL_PROVIDER_PRESETS.aruba;
    setAccLabel("Casella commerciale");
    setAccEmail("");
    setAccUser("");
    setAccPass("");
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
    setSyncEnabled(true);
  }

  function openNewAccount() {
    resetAccountForm();
    setSetupOpen(true);
  }

  function openEditAccount(a: WebmailAccountPublic) {
    setEditingId(a.id);
    setProvider(a.provider);
    setAccLabel(a.label);
    setAccEmail(a.emailAddress);
    setAccUser(a.username);
    setAccPass("");
    setImapHost(a.imapHost);
    setImapPort(a.imapPort);
    setSmtpHost(a.smtpHost);
    setSmtpPort(a.smtpPort);
    setSyncEnabled(a.syncEnabled);
    setSetupOpen(true);
    setError(null);
    setInfo(null);
  }

  function syncNow() {
    setInfo(null);
    startTransition(async () => {
      const res = await runWebmailSyncAction(accountFilter || undefined);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo(
        `Sync: ${res.imported} nuovi, ${res.drafted} bozze` +
          (res.errors.length ? ` · ${res.errors.join("; ")}` : "")
      );
      await reload();
    });
  }

  function saveAccount() {
    setInfo(null);
    const wasEdit = Boolean(editingId);
    startTransition(async () => {
      const res = await upsertWebmailAccountAction({
        id: editingId || undefined,
        label: accLabel,
        emailAddress: accEmail,
        provider,
        imapHost: imapHost || preset.imapHost,
        imapPort: imapPort || preset.imapPort,
        imapSecure: preset.imapSecure,
        smtpHost: smtpHost || preset.smtpHost,
        smtpPort: smtpPort || preset.smtpPort,
        smtpSecure: preset.smtpSecure,
        username:
          provider === "generic"
            ? (accUser || accEmail).trim()
            : accEmail.trim(),
        password: accPass.trim() || undefined,
        syncEnabled,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSetupOpen(false);
      resetAccountForm();
      setInfo(
        wasEdit
          ? `Casella ${res.account.emailAddress} aggiornata. Riprova «Sincronizza ora».`
          : `Casella ${res.account.emailAddress} collegata.`
      );
      await reload();
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
      setInfo("Bozza aggiornata.");
    });
  }

  function sendDraft() {
    if (!bozza) return;
    if (
      !window.confirm(
        "Inviare questa email al destinatario? L'operazione è tracciata in audit ISO."
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
      setInfo("Email inviata. Audit registrato (ai_generated + approved_by).");
      setBozza(null);
      await reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-[var(--muted)]">
          Webmail multi-casella (Gmail / Aruba): sync automatico, smistamento in
          categorie, bozze AI con human-in-the-loop. Nessun invio senza conferma
          operatore. Procedure:{" "}
          <code className="text-xs">docs/WEBMAIL-COLLEGAMENTO-GMAIL-ARUBA.md</code>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (setupOpen && !editingId) {
                setSetupOpen(false);
                return;
              }
              openNewAccount();
            }}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Collega casella
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={syncNow}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Sincronizza ora
          </button>
        </div>
      </div>

      {setupOpen ? (
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {editingId ? "Modifica casella" : "Nuova casella"}
            </h2>
            <button
              type="button"
              className="text-xs text-[var(--muted)] underline"
              onClick={() => {
                setSetupOpen(false);
                resetAccountForm();
              }}
            >
              Chiudi
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">{preset.docsHint}</p>
          {provider === "aruba" ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              Aruba: lo username IMAP è sempre l’email della casella aziendale.
              Il browser a volte riempie da solo la mail personale del login —
              quella non viene più usata.
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">Provider</span>
              <select
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as WebmailProvider)
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <option value="aruba">Aruba</option>
                <option value="gmail">Gmail</option>
                <option value="generic">Generico</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">Etichetta</span>
              <input
                value={accLabel}
                onChange={(e) => setAccLabel(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">Email casella</span>
              <input
                value={accEmail}
                onChange={(e) => {
                  const v = e.target.value;
                  setAccEmail(v);
                  if (provider !== "generic") setAccUser(v);
                }}
                autoComplete="off"
                name="webmail-mailbox-email"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            {provider === "generic" ? (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium">
                  Username IMAP/SMTP
                </span>
                <input
                  value={accUser}
                  onChange={(e) => setAccUser(e.target.value)}
                  autoComplete="off"
                  name="webmail-mailbox-user"
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                />
              </label>
            ) : (
              <div className="text-sm">
                <span className="mb-1 block text-xs font-medium">
                  Username IMAP/SMTP
                </span>
                <p className="rounded-lg border border-dashed border-[var(--border)] bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  = email casella (non usa la mail personale del login)
                  {accEmail ? (
                    <>
                      : <code>{accEmail}</code>
                    </>
                  ) : null}
                </p>
              </div>
            )}
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium">
                Password casella / App Password
                {editingId ? " (lascia vuoto per non cambiare)" : ""}
              </span>
              <input
                type="password"
                value={accPass}
                onChange={(e) => setAccPass(e.target.value)}
                autoComplete="new-password"
                name="webmail-mailbox-pass"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">IMAP host</span>
              <input
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">IMAP porta</span>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">SMTP host</span>
              <input
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">SMTP porta</span>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
              />
              Sync automatica abilitata
            </label>
          </div>
          <button
            type="button"
            disabled={
              pending ||
              !accEmail ||
              (!editingId && !accPass.trim())
            }
            onClick={saveAccount}
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {editingId
              ? "Salva modifiche (area Amministrazione)"
              : "Salva casella (area Amministrazione)"}
          </button>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
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
          Solo Bozza AI pronta
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
              Nessun messaggio. Collega una casella e sincronizza.
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
                    {cat ? (
                      <span
                        className="mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                        style={{ background: cat.colore }}
                      >
                        {cat.nome}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="min-h-[24rem] rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {!selected ? (
            <p className="p-6 text-sm text-[var(--muted)]">
              Seleziona una mail per la revisione affiancata.
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
                <pre className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-800">
                  {selected.bodyText || "(vuoto)"}
                </pre>
              </section>
              <section className="p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  Bozza AI proposta
                </h3>
                {!bozza ? (
                  <p className="mt-4 text-sm text-[var(--muted)]">
                    Nessuna bozza AI per questo messaggio.
                  </p>
                ) : (
                  <div className="mt-2 space-y-3">
                    <p className="text-xs text-[var(--muted)]">
                      Intent: {bozza.intent}
                      {bozza.confidence != null
                        ? ` · ${bozza.confidence}%`
                        : ""}
                      {bozza.aiGenerated ? " · AI" : ""}
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
                          <li key={a.id}>
                            Allegato: {a.fileName}
                            {a.storagePath ? ` (${a.storagePath})` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {bozza.ragNotes ? (
                      <details className="text-xs text-[var(--muted)]">
                        <summary>Note RAG</summary>
                        <pre className="mt-1 whitespace-pre-wrap">
                          {bozza.ragNotes}
                        </pre>
                      </details>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
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

      {accounts.length > 0 ? (
        <ul className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs">
          {accounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800">
                  {a.label} · {a.emailAddress} ({a.provider})
                </p>
                <p className="text-[var(--muted)]">
                  user IMAP: <code>{a.username}</code> · {a.imapHost}:{a.imapPort}{" "}
                  · sync {a.syncEnabled ? "ON" : "OFF"} · ultimo{" "}
                  {formatWhen(a.lastSyncAt)}
                </p>
                {a.lastSyncError ? (
                  <p className="mt-1 text-red-700">{a.lastSyncError}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => openEditAccount(a)}
                className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
              >
                Modifica
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
