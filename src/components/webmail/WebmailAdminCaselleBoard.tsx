"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FaPlus, FaTrash } from "react-icons/fa6";
import {
  listWebmailAccountsAction,
  listWebmailOperatorsAction,
  softDeleteWebmailAccountAction,
  upsertWebmailAccountAction,
  type WebmailOperatorOption,
} from "@/app/actions/webmail";
import { WebmailSetupGuideModal } from "@/components/webmail/WebmailSetupGuideModal";
import {
  WEBMAIL_PROVIDER_PRESETS,
  type WebmailAccountPublic,
  type WebmailProvider,
} from "@/lib/webmail/types";

export function WebmailAdminCaselleBoard() {
  const [accounts, setAccounts] = useState<WebmailAccountPublic[]>([]);
  const [profiles, setProfiles] = useState<WebmailOperatorOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [guideOpen, setGuideOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [provider, setProvider] = useState<WebmailProvider>("aruba");
  const [password, setPassword] = useState("");
  const [imapHost, setImapHost] = useState("");
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState(465);
  const [username, setUsername] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(true);

  const preset = WEBMAIL_PROVIDER_PRESETS[provider];
  const profileById = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const reload = useCallback(async () => {
    const [a, p] = await Promise.all([
      listWebmailAccountsAction(),
      listWebmailOperatorsAction(),
    ]);
    if (!a.success) {
      setError(a.error);
      return;
    }
    if (!p.success) {
      setError(p.error);
      return;
    }
    setAccounts(a.accounts);
    setProfiles(p.operators);
    setError(null);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  function resetForm() {
    setEditingId(null);
    setLabel("");
    setEmail("");
    setProvider("aruba");
    setPassword("");
    setImapHost("");
    setImapPort(993);
    setSmtpHost("");
    setSmtpPort(465);
    setUsername("");
    setOwnerUserId("");
    setSyncEnabled(true);
  }

  function openNew() {
    resetForm();
    setFormOpen(true);
  }

  function openEdit(acc: WebmailAccountPublic) {
    setEditingId(acc.id);
    setLabel(acc.label);
    setEmail(acc.emailAddress);
    setProvider(acc.provider);
    setPassword("");
    setImapHost(acc.imapHost);
    setImapPort(acc.imapPort);
    setSmtpHost(acc.smtpHost);
    setSmtpPort(acc.smtpPort);
    setUsername(acc.username);
    setOwnerUserId(acc.ownerUserId ?? "");
    setSyncEnabled(acc.syncEnabled);
    setFormOpen(true);
  }

  function onProviderChange(next: WebmailProvider) {
    setProvider(next);
    const p = WEBMAIL_PROVIDER_PRESETS[next];
    setImapHost(p.imapHost);
    setImapPort(p.imapPort);
    setSmtpHost(p.smtpHost);
    setSmtpPort(p.smtpPort);
  }

  function save() {
    if (!ownerUserId) {
      setError("Seleziona il profilo utente a cui collegare la casella.");
      return;
    }
    setInfo(null);
    startTransition(async () => {
      const res = await upsertWebmailAccountAction({
        id: editingId || undefined,
        label: label.trim() || email.trim(),
        emailAddress: email.trim(),
        provider,
        imapHost: imapHost || preset.imapHost,
        imapPort: imapPort || preset.imapPort,
        imapSecure: preset.imapSecure,
        smtpHost: smtpHost || preset.smtpHost,
        smtpPort: smtpPort || preset.smtpPort,
        smtpSecure: preset.smtpSecure,
        username:
          provider === "generic"
            ? (username || email).trim()
            : email.trim(),
        password: password.trim() || undefined,
        syncEnabled,
        ownerUserId,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setFormOpen(false);
      resetForm();
      setInfo(
        editingId
          ? `Casella ${res.account.emailAddress} aggiornata.`
          : `Casella ${res.account.emailAddress} collegata al profilo.`
      );
      await reload();
    });
  }

  function remove(acc: WebmailAccountPublic) {
    if (
      !window.confirm(
        `Disattivare la casella ${acc.emailAddress}? L’utente non la vedrà più (soft delete ISO).`
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await softDeleteWebmailAccountAction(acc.id);
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo(`Casella ${acc.emailAddress} disattivata.`);
      await reload();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Solo SuperAdmin: crea o modifica caselle IMAP e collegale a un
            profilo dell’organigramma. L’utente vedrà solo la propria casella.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setGuideOpen(true)}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium"
          >
            Spiega come fare
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white"
          >
            <FaPlus size={12} />
            Nuova casella
          </button>
          <Link
            href="/app/webmail/caselle"
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
          >
            Vai a WebMail
          </Link>
        </div>
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

      {formOpen ? (
        <section className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              {editingId ? "Modifica casella" : "Nuova casella + profilo"}
            </h2>
            <button
              type="button"
              className="text-xs text-[var(--muted)] underline"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
            >
              Chiudi
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">{preset.docsHint}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium">
                Profilo utente (obbligatorio)
              </span>
              <select
                value={ownerUserId}
                onChange={(e) => setOwnerUserId(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <option value="">— Seleziona profilo —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName} · {p.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">Provider</span>
              <select
                value={provider}
                onChange={(e) =>
                  onProviderChange(e.target.value as WebmailProvider)
                }
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <option value="aruba">Aruba</option>
                <option value="gmail">Gmail</option>
                <option value="generic">Generico / PEC</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">Etichetta</span>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="es. Commerciale"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">
                Indirizzo email casella
              </span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>

            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">
                Password{editingId ? " (vuota = non cambiare)" : ""}
              </span>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="new-password"
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>

            {provider === "generic" ? (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-medium">Username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                />
              </label>
            ) : null}

            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">IMAP host</span>
              <input
                value={imapHost || preset.imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">IMAP porta</span>
              <input
                type="number"
                value={imapPort || preset.imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">SMTP host</span>
              <input
                value={smtpHost || preset.smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-medium">SMTP porta</span>
              <input
                type="number"
                value={smtpPort || preset.smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 465)}
                className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
              />
            </label>

            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
              />
              Sync automatica abilitata
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
            >
              Annulla
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {pending ? "Salvataggio…" : "Salva casella"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">Caselle configurate</h2>
        </div>
        {accounts.length === 0 ? (
          <p className="p-4 text-sm text-[var(--muted)]">
            Nessuna casella. Crea la prima con «Nuova casella» o leggi «Spiega
            come fare».
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {accounts.map((acc) => {
              const owner = acc.ownerUserId
                ? profileById.get(acc.ownerUserId)
                : null;
              return (
                <li
                  key={acc.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {acc.label} · {acc.emailAddress}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">
                      {acc.provider.toUpperCase()} · Profilo:{" "}
                      {owner
                        ? `${owner.fullName} (${owner.email})`
                        : "non assegnato"}
                      {acc.lastSyncError
                        ? ` · Errore sync: ${acc.lastSyncError}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(acc)}
                      className="rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-medium"
                    >
                      Modifica
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(acc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <FaTrash size={10} />
                      Disattiva
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <WebmailSetupGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
      />
    </div>
  );
}
