"use client";

import { useEffect, useState, useTransition } from "react";
import {
  FaCheck,
  FaEnvelope,
  FaMagnifyingGlass,
  FaPen,
  FaTrash,
  FaWandMagicSparkles,
} from "react-icons/fa6";
import {
  generateEmailDraftsAction,
  listAiScoutLeadsAction,
  listScoutWebmailAccountsAction,
  rejectLeadAction,
  scoutProducersAction,
  sendLeadEmailAction,
  updateLeadDraftAction,
} from "@/app/actions/ai-scout";
import type { AiScoutLead } from "@/lib/ai-scout/types";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Bozza",
  APPROVED: "Approvato",
  SENT: "Inviato",
  REJECTED: "Scartato",
};

export function AiScoutBoard() {
  const [items, setItems] = useState<AiScoutLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("Olio Extravergine");
  const [region, setRegion] = useState("Sicilia");
  const [accounts, setAccounts] = useState<
    Array<{ id: string; label: string; email: string }>
  >([]);
  const [accountId, setAccountId] = useState("");
  const [useSystemSmtp, setUseSystemSmtp] = useState(true);
  const [editing, setEditing] = useState<AiScoutLead | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  function reload() {
    startTransition(async () => {
      const res = await listAiScoutLeadsAction();
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
    void (async () => {
      const res = await listScoutWebmailAccountsAction();
      if (res.success) {
        setAccounts(res.accounts);
        if (res.accounts[0]) {
          setAccountId(res.accounts[0].id);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runScout() {
    setInfo(null);
    startTransition(async () => {
      const res = await scoutProducersAction({ category, region, maxResults: 8 });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setInfo(
        `Trovati ${res.created} lead.${res.warning ? ` ${res.warning}` : ""}`
      );
      reload();
    });
  }

  function runDrafts() {
    setInfo(null);
    startTransition(async () => {
      const res = await generateEmailDraftsAction({ onlyMissing: true });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setInfo(`Generate ${res.updated} bozze email.`);
      reload();
    });
  }

  function openEdit(lead: AiScoutLead) {
    setEditing(lead);
    setEditSubject(lead.emailSubject);
    setEditBody(lead.emailDraft);
  }

  function saveEdit() {
    if (!editing) return;
    startTransition(async () => {
      const res = await updateLeadDraftAction({
        leadId: editing.id,
        emailDraft: editBody,
        emailSubject: editSubject || undefined,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setEditing(null);
      setInfo("Bozza aggiornata.");
      reload();
    });
  }

  function approveAndSend(lead: AiScoutLead) {
    const ok = window.confirm(
      `Inviare l'email a ${lead.email || "(email mancante)"} per ${lead.companyName}?`
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await sendLeadEmailAction({
        leadId: lead.id,
        webmailAccountId: useSystemSmtp ? null : accountId || null,
        useSystemSmtp,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setInfo(`Email inviata a ${lead.companyName}.`);
      reload();
    });
  }

  function reject(lead: AiScoutLead) {
    const ok = window.confirm(`Scartare il lead ${lead.companyName}?`);
    if (!ok) return;
    startTransition(async () => {
      const res = await rejectLeadAction({ leadId: lead.id });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setInfo("Lead scartato.");
      reload();
    });
  }

  return (
    <div className="space-y-4">
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

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-3 text-sm font-semibold text-[var(--foreground)]">
          Avvia scouting AI
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-[var(--muted)]">
            Categoria prodotto
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              placeholder="es. Olio Extravergine"
            />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs text-[var(--muted)]">
            Regione / zona
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
              placeholder="es. Sicilia"
            />
          </label>
          <button
            type="button"
            disabled={pending || !category.trim() || !region.trim()}
            onClick={runScout}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <FaMagnifyingGlass size={12} />
            Avvia Scouting AI
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={runDrafts}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-slate-50 disabled:opacity-50"
          >
            <FaWandMagicSparkles size={12} />
            Genera bozze email
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Richiede <code className="text-[11px]">GEMINI_API_KEY</code>. Verifica
          sempre aziende ed email prima dell&apos;invio.
        </p>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
        <h2 className="mb-3 text-sm font-semibold">Mittente invio</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={useSystemSmtp}
              onChange={() => setUseSystemSmtp(true)}
            />
            SMTP di sistema (OTP / notifiche)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              checked={!useSystemSmtp}
              onChange={() => setUseSystemSmtp(false)}
              disabled={accounts.length === 0}
            />
            Casella webmail
          </label>
          {!useSystemSmtp ? (
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label || a.email} ({a.email})
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 font-medium">Azienda</th>
              <th className="px-3 py-2 font-medium">Categoria</th>
              <th className="px-3 py-2 font-medium">Località</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Bozza</th>
              <th className="px-3 py-2 font-medium">Stato</th>
              <th className="px-3 py-2 font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-[var(--muted)]"
                >
                  Nessun lead. Avvia uno scouting per iniziare.
                </td>
              </tr>
            ) : (
              items.map((lead) => (
                <tr key={lead.id} className="align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium text-[var(--foreground)]">
                      {lead.companyName}
                    </div>
                    {lead.websiteOrSocial ? (
                      <a
                        href={
                          lead.websiteOrSocial.startsWith("http")
                            ? lead.websiteOrSocial
                            : `https://${lead.websiteOrSocial}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-700 hover:underline"
                      >
                        {lead.websiteOrSocial}
                      </a>
                    ) : null}
                    {lead.contextNotes ? (
                      <p className="mt-1 max-w-xs text-xs text-[var(--muted)]">
                        {lead.contextNotes}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{lead.productCategory || "—"}</td>
                  <td className="px-3 py-3">{lead.location || "—"}</td>
                  <td className="px-3 py-3">
                    {lead.email || (
                      <span className="text-amber-700">Da completare</span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {lead.emailDraft ? (
                      <p className="max-w-sm whitespace-pre-wrap text-xs text-[var(--muted)] line-clamp-4">
                        {lead.emailSubject ? (
                          <span className="font-medium text-[var(--foreground)]">
                            {lead.emailSubject}
                            {"\n"}
                          </span>
                        ) : null}
                        {lead.emailDraft}
                      </p>
                    ) : (
                      <span className="text-xs text-[var(--muted)]">
                        Non generata
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                        lead.status === "SENT"
                          ? "bg-emerald-100 text-emerald-800"
                          : lead.status === "REJECTED"
                            ? "bg-slate-100 text-slate-600"
                            : "bg-amber-100 text-amber-900"
                      }`}
                    >
                      {STATUS_LABEL[lead.status] ?? lead.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1.5">
                      <button
                        type="button"
                        disabled={pending || lead.status === "SENT"}
                        onClick={() => openEdit(lead)}
                        className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-40"
                      >
                        <FaPen size={10} />
                        Modifica bozza
                      </button>
                      <button
                        type="button"
                        disabled={pending || lead.status === "SENT"}
                        onClick={() => approveAndSend(lead)}
                        className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 disabled:opacity-40"
                      >
                        <FaCheck size={10} />
                        Approva e invia
                      </button>
                      <button
                        type="button"
                        disabled={pending || lead.status === "SENT"}
                        onClick={() => reject(lead)}
                        className="inline-flex items-center gap-1.5 rounded border border-red-200 px-2 py-1 text-xs text-red-800 hover:bg-red-50 disabled:opacity-40"
                      >
                        <FaTrash size={10} />
                        Scarta
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white p-4 shadow-xl">
            <h3 className="mb-1 text-base font-semibold">
              Modifica bozza — {editing.companyName}
            </h3>
            <p className="mb-3 text-xs text-[var(--muted)]">
              <FaEnvelope className="mr-1 inline" size={10} />
              {editing.email || "Email da completare sul lead"}
            </p>
            <label className="mb-2 block text-xs text-[var(--muted)]">
              Oggetto
              <input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <label className="mb-3 block text-xs text-[var(--muted)]">
              Corpo email
              <textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                rows={12}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={saveEdit}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Salva
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
