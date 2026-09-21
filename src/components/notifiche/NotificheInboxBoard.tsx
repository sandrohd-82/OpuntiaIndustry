"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  deleteNotificaAction,
  listNotificheAction,
  markNotificaReadByIdAction,
  type NotificaInboxRiga,
} from "@/app/actions/notifiche";
import {
  decidePasswordResetInboxAction,
  listPasswordResetRichiesteAction,
} from "@/app/actions/password-reset";
import type { PasswordResetRichiesta } from "@/lib/auth/password-reset";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";
import { NOTIFICA_TIPO_LABELS, type NotificaTipo } from "@/lib/notifiche/types";

type Filtro = "tutte" | "non_lette" | "lette";

function tipoLabel(tipo: string): string {
  return (
    NOTIFICA_TIPO_LABELS[tipo as NotificaTipo] ??
    tipo
  );
}

export function NotificheInboxBoard({
  isSuperAdmin,
}: {
  isSuperAdmin: boolean;
}) {
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") ?? "";
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [items, setItems] = useState<NotificaInboxRiga[]>([]);
  const [richieste, setRichieste] = useState<
    Record<string, PasswordResetRichiesta>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const res = await listNotificheAction(filtro);
    if (!res.success) {
      setError(res.error);
      setItems([]);
      return;
    }
    setError(null);
    setItems(res.items);
    const ids = res.items
      .map((n) => n.entityId)
      .filter((id): id is string => Boolean(id));
    if (ids.length && isSuperAdmin) {
      const map = await listPasswordResetRichiesteAction(ids);
      setRichieste(map);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void reload().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro, isSuperAdmin]);

  const focused = useMemo(
    () => items.find((n) => n.entityId === focus) ?? null,
    [items, focus]
  );

  async function markRead(id: string) {
    setBusyId(id);
    const res = await markNotificaReadByIdAction(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    notifyNotificheNav();
    await reload();
  }

  async function remove(id: string) {
    setBusyId(id);
    const res = await deleteNotificaAction(id);
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    notifyNotificheNav();
    await reload();
  }

  async function decide(richiestaId: string, approva: boolean) {
    setBusyId(richiestaId);
    const res = await decidePasswordResetInboxAction({
      richiestaId,
      approva,
    });
    setBusyId(null);
    if (!res.success) {
      setError(res.error);
      return;
    }
    notifyNotificheNav();
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["tutte", "Tutte"],
            ["non_lette", "Non lette"],
            ["lette", "Lette"],
          ] as const
        ).map(([key, lab]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFiltro(key)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filtro === key
                ? "border-emerald-800 bg-emerald-50 font-medium text-emerald-950"
                : "border-[var(--border)] bg-white hover:bg-slate-50"
            }`}
          >
            {lab}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="text-sm text-[var(--muted)]">Caricamento notifiche…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          Nessuna notifica in questo filtro.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const richiestaId =
              (typeof n.payload.richiestaId === "string" &&
                n.payload.richiestaId) ||
              n.entityId;
            const req = richiestaId ? richieste[richiestaId] : null;
            const showDecide =
              isSuperAdmin &&
              n.tipo === "sicurezza" &&
              req?.stato === "in_attesa";
            const highlight = focused?.id === n.id;
            return (
              <li
                key={n.id}
                className={`rounded-xl border px-4 py-3 ${
                  highlight
                    ? "border-emerald-700 bg-emerald-50"
                    : n.readAt
                      ? "border-[var(--border)] bg-white"
                      : "border-slate-300 bg-slate-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      {tipoLabel(n.tipo)}
                      {n.readAt ? " · Letta" : " · Non letta"}
                    </p>
                    <p className="mt-0.5 font-medium text-slate-900">{n.title}</p>
                    {n.body ? (
                      <p className="mt-1 text-sm text-slate-700">{n.body}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-500">
                      {n.createdAt
                        ? new Date(n.createdAt).toLocaleString("it-IT")
                        : ""}
                    </p>
                    {req && req.stato !== "in_attesa" ? (
                      <p className="mt-1 text-xs font-medium text-slate-600">
                        Richiesta {req.stato.replace("_", " ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {showDecide ? (
                      <>
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void decide(req.id, true)}
                          className="rounded-md bg-emerald-800 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-60"
                        >
                          Sì
                        </button>
                        <button
                          type="button"
                          disabled={busyId !== null}
                          onClick={() => void decide(req.id, false)}
                          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 disabled:opacity-60"
                        >
                          No
                        </button>
                      </>
                    ) : null}
                    {!n.readAt ? (
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => void markRead(n.id)}
                        className="rounded-md px-2 py-1 text-xs text-slate-700 hover:bg-white"
                      >
                        Segna letta
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void remove(n.id)}
                      className="rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                    >
                      Elimina
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
