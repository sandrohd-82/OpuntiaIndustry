"use client";

import { useEffect, useState } from "react";
import {
  enqueueIotCommandAction,
  listIotCommandsAction,
  listIotTelemetryAction,
} from "@/app/actions/produzione-iot";
import { createClient } from "@/lib/supabase/client";
import type { IotCommand, IotDevice, IotTelemetry } from "@/lib/produzione/iot";

type Props = {
  device: IotDevice;
  canCommand?: boolean;
};

export function IoTControlPanel({ device, canCommand = true }: Props) {
  const [telemetry, setTelemetry] = useState<IotTelemetry[]>([]);
  const [commands, setCommands] = useState<IotCommand[]>([]);
  const [status, setStatus] = useState(device.status);
  const [lastPing, setLastPing] = useState(device.lastPing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listIotTelemetryAction(device.id, 8),
      listIotCommandsAction(device.id, 8),
    ]).then(([t, c]) => {
      if (cancelled) return;
      if (t.success) setTelemetry(t.items);
      if (c.success) setCommands(c.items);
    });
    const supabase = createClient();
    const channel = supabase
      .channel(`iot:${device.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "iot_telemetry",
          filter: `device_id=eq.${device.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            device_id: string;
            data: Record<string, unknown>;
            created_at: string;
          };
          setTelemetry((prev) => [
            {
              id: row.id,
              deviceId: row.device_id,
              data: row.data ?? {},
              createdAt: row.created_at,
            },
            ...prev,
          ].slice(0, 8));
          setStatus("ONLINE");
          setLastPing(row.created_at);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "iot_commands",
          filter: `device_id=eq.${device.id}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            device_id: string;
            command: string;
            executed: boolean;
            executed_at: string | null;
            created_at: string;
          };
          if (!row?.id) return;
          const mapped: IotCommand = {
            id: row.id,
            deviceId: row.device_id,
            command: row.command,
            executed: row.executed,
            executedAt: row.executed_at,
            createdAt: row.created_at,
          };
          setCommands((prev) => {
            const rest = prev.filter((x) => x.id !== mapped.id);
            return [mapped, ...rest].slice(0, 8);
          });
          if (mapped.executed) {
            setFlashId(mapped.id);
            window.setTimeout(() => setFlashId((id) => (id === mapped.id ? null : id)), 2500);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "iot_devices",
          filter: `id=eq.${device.id}`,
        },
        (payload) => {
          const row = payload.new as { status?: string; last_ping?: string | null };
          if (row.status === "ONLINE" || row.status === "OFFLINE") {
            setStatus(row.status);
          }
          if (row.last_ping) setLastPing(row.last_ping);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [device.id]);

  const latest = telemetry[0];

  async function send(command: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await enqueueIotCommandAction({ deviceId: device.id, command });
      if (!res.success) setError(res.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invio comando fallito.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Pannello IoT</h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
            status === "ONLINE"
              ? "bg-emerald-100 text-emerald-800"
              : "bg-slate-200 text-slate-600"
          }`}
        >
          {status === "ONLINE" ? "Online" : "Offline"}
        </span>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {device.deviceCode}
        {lastPing
          ? ` · ultimo ping ${new Date(lastPing).toLocaleString("it-IT")}`
          : " · nessun ping"}
      </p>
      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--border)] bg-slate-50 px-3 py-2">
          <p className="text-[10px] uppercase text-[var(--muted)]">Telemetria</p>
          {latest ? (
            <pre className="mt-1 overflow-x-auto text-xs text-slate-800">
              {JSON.stringify(latest.data, null, 2)}
            </pre>
          ) : (
            <p className="mt-1 text-xs text-[var(--muted)]">In attesa di dati dal dispositivo.</p>
          )}
        </div>
        <div>
          {canCommand ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("POWER_ON")}
                className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase text-white disabled:opacity-50"
              >
                Comando On
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void send("POWER_OFF")}
                className="rounded-full bg-slate-400 px-3 py-1.5 text-xs font-semibold uppercase text-white disabled:opacity-50"
              >
                Comando Off
              </button>
            </div>
          ) : null}
          <ul className="mt-2 space-y-1">
            {commands.length === 0 ? (
              <li className="text-xs text-[var(--muted)]">Nessun comando inviato.</li>
            ) : (
              commands.map((c) => (
                <li
                  key={c.id}
                  className={`rounded-md px-2 py-1 text-xs ${
                    flashId === c.id
                      ? "bg-emerald-100 text-emerald-900"
                      : c.executed
                        ? "bg-slate-100 text-slate-700"
                        : "bg-amber-50 text-amber-950"
                  }`}
                >
                  {c.command}
                  {" · "}
                  {c.executed ? "eseguito dal dispositivo" : "in attesa"}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
