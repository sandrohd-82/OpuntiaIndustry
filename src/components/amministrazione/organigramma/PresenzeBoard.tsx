"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { FaArrowsRotate, FaUserCheck, FaUserClock, FaUserXmark } from "react-icons/fa6";
import {
  getPresenzeEnvAction,
  linkFluidaOperatoriAction,
  listPresenzeOggiAction,
  syncPresenzeAction,
} from "@/app/actions/presenze";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { AZ } from "@/lib/auth/action-access";
import {
  formatOraIt,
  formatOreMinuti,
  presenzaStatoLabel,
  type PresenzaGiorno,
} from "@/lib/hr/presenze";

function statoClass(stato: PresenzaGiorno["stato"]): string {
  if (stato === "presente") return "bg-emerald-50 text-emerald-800";
  if (stato === "uscito") return "bg-slate-100 text-slate-700";
  if (stato === "assente") return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export function PresenzeBoard() {
  const [giorno, setGiorno] = useState("");
  const [items, setItems] = useState<PresenzaGiorno[]>([]);
  const [presenti, setPresenti] = useState(0);
  const [usciti, setUsciti] = useState(0);
  const [assenti, setAssenti] = useState(0);
  const [minutiTotali, setMinutiTotali] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const giornoRef = useRef(giorno);
  giornoRef.current = giorno;

  function load(day?: string) {
    startTransition(async () => {
      const [env, listed] = await Promise.all([
        getPresenzeEnvAction(),
        listPresenzeOggiAction(day ? { giorno: day } : {}),
      ]);
      setConfigured(env.configured);
      if (!listed.success) {
        setError(listed.error);
        return;
      }
      setError(null);
      setGiorno(listed.giorno);
      setItems(listed.items);
      setPresenti(listed.summary.presenti);
      setUsciti(listed.summary.usciti);
      setAssenti(listed.summary.assenti);
      setMinutiTotali(listed.summary.minutiTotali);
      setLastSyncedAt(listed.lastSyncedAt);
    });
  }

  useEffect(() => {
    load();
    const t = window.setInterval(() => load(giornoRef.current || undefined), 60_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    startTransition(async () => {
      const res = await syncPresenzeAction(giorno ? { giorno } : {});
      if (!res.success) {
        setError(res.error);
        return;
      }
      load(res.giorno);
    });
  }

  const lastSyncLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "mai";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">
            Timbrature da Fluida (Zucchetti). Ogni operatore è riconosciuto
            dalla matricola a 6 caratteri. Default: oggi. Aggiornamento
            automatico ogni 15 minuti + pulsante manuale.
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Ultima sync: {lastSyncLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-[var(--muted)]">
            Giorno
            <input
              type="date"
              value={giorno}
              onChange={(e) => load(e.target.value)}
              className="mt-1 block rounded-md border border-[var(--border)] bg-white px-2.5 py-1.5 text-sm"
            />
          </label>
          <ActionGate actionKey={AZ.sincronizzaPresenze}>
            <button
              type="button"
              onClick={sync}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)] disabled:opacity-60"
            >
              <FaArrowsRotate size={13} className={pending ? "animate-spin" : ""} />
              Sincronizza presenze
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await linkFluidaOperatoriAction();
                  if (!res.success) {
                    setError(res.error);
                    setInfo(null);
                    return;
                  }
                  setError(null);
                  const leftover = res.unmatchedFluida.length
                    ? ` Non abbinati: ${res.unmatchedFluida.join(", ")}.`
                    : "";
                  setInfo(
                    `Fluida ha ${res.fluidaCount} persone. Collegate: ${res.matched}. Matricole inviate: ${res.pushed}.${leftover}`
                  );
                  load(giorno || undefined);
                });
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
            >
              Invia matricole a Fluida
            </button>
          </ActionGate>
        </div>
      </div>

      {!configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Manca la configurazione Fluida sul server. Incolla
          <code className="mx-1 rounded bg-white px-1">FLUIDA_API_KEY</code>
          e
          <code className="mx-1 rounded bg-white px-1">FLUIDA_COMPANY_ID</code>
          in <code className="rounded bg-white px-1">.env.local</code> e su Vercel,
          poi fai Redeploy.
        </div>
      ) : null}

      {info ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {info}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Kpi
          icon={<FaUserCheck className="text-emerald-600" />}
          label="Presenti ora"
          value={String(presenti)}
        />
        <Kpi
          icon={<FaUserClock className="text-slate-600" />}
          label="Usciti"
          value={String(usciti)}
        />
        <Kpi
          icon={<FaUserXmark className="text-amber-600" />}
          label="Assenti"
          value={String(assenti)}
        />
        <Kpi
          icon={<FaUserClock className="text-[var(--primary)]" />}
          label="Ore totali"
          value={formatOreMinuti(minutiTotali)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Dipendente</th>
              <th className="px-4 py-3 font-medium">Matricola</th>
              <th className="px-4 py-3 font-medium">Codice fiscale</th>
              <th className="px-4 py-3 font-medium">Ingresso</th>
              <th className="px-4 py-3 font-medium">Uscita</th>
              <th className="px-4 py-3 font-medium">Ore</th>
              <th className="px-4 py-3 font-medium">Stato</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                  {pending
                    ? "Caricamento…"
                    : "Nessuna presenza per questo giorno. Sincronizza per scaricare le timbrature."}
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-medium">{row.nomeCompleto}</td>
                  <td className="px-4 py-3 font-mono text-xs tracking-wide">
                    {row.matricola || "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {row.codiceFiscale || "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatOraIt(row.ingressoAt)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatOraIt(row.uscitaAt)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.minutiLavorati ? formatOreMinuti(row.minutiLavorati) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statoClass(row.stato)}`}
                    >
                      {presenzaStatoLabel(row.stato)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-[var(--muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
