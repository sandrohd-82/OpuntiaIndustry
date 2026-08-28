"use client";

import { useEffect, useState, useTransition } from "react";
import { FaArrowUpRightFromSquare, FaChevronDown, FaRotate } from "react-icons/fa6";
import {
  checkShippingTrackingAction,
  getShippingTrackingAction,
} from "@/app/actions/shipping-tracking";
import {
  formatUltimoAggiornamento,
  SHIPPING_STATUS_BADGE,
  SHIPPING_STATUS_LABEL,
  type ShippingStatus,
  type ShippingTracking,
  type ShippingTrackingLog,
} from "@/lib/shipping/tracking";

type Props = {
  trackingId: string;
  /** Auto-check al mount (con throttle server). */
  autoCheck?: boolean;
  compact?: boolean;
  onError?: (msg: string) => void;
};

function formatLogWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("it-IT", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ShippingTrackingCard({
  trackingId,
  autoCheck = true,
  compact = false,
  onError,
}: Props) {
  const [item, setItem] = useState<ShippingTracking | null>(null);
  const [logs, setLogs] = useState<ShippingTrackingLog[]>([]);
  const [ultimoLabel, setUltimoLabel] = useState("Caricamento…");
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      if (autoCheck) {
        const res = await checkShippingTrackingAction({
          trackingId,
          force: false,
        });
        if (cancelled) return;
        if (!res.success) {
          onError?.(res.error);
          const fallback = await getShippingTrackingAction(trackingId);
          if (!cancelled && fallback.success) {
            setItem(fallback.item);
            setLogs(fallback.logs);
            setUltimoLabel(fallback.ultimoAggiornamentoLabel);
          }
          setLoaded(true);
          return;
        }
        setItem(res.item);
        setLogs(res.logs);
        setUltimoLabel(res.ultimoAggiornamentoLabel);
        setLoaded(true);
        return;
      }

      const res = await getShippingTrackingAction(trackingId);
      if (cancelled) return;
      if (!res.success) {
        onError?.(res.error);
        setLoaded(true);
        return;
      }
      setItem(res.item);
      setLogs(res.logs);
      setUltimoLabel(res.ultimoAggiornamentoLabel);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount per trackingId
  }, [trackingId, autoCheck]);

  function refresh() {
    startTransition(async () => {
      const res = await checkShippingTrackingAction({
        trackingId,
        force: true,
      });
      if (!res.success) {
        onError?.(res.error);
        return;
      }
      setItem(res.item);
      setLogs(res.logs);
      setUltimoLabel(res.ultimoAggiornamentoLabel);
    });
  }

  if (!loaded && !item) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
        Caricamento tracking…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800">
        Tracking non disponibile
      </div>
    );
  }

  const status = item.currentStatus as ShippingStatus;
  const badge = SHIPPING_STATUS_BADGE[status];

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full flex-col gap-2 px-3 py-2.5 text-left hover:bg-slate-50/80"
        aria-expanded={expanded}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
            {SHIPPING_STATUS_LABEL[status]}
          </span>
          <span className="font-medium text-slate-900">
            {item.carrier}
            {item.trackingCode ? (
              <span className="ml-1 font-mono text-[10px] text-slate-500">
                {item.trackingCode}
              </span>
            ) : null}
          </span>
          <FaChevronDown
            size={10}
            className={`ml-auto shrink-0 text-slate-400 transition ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
        <p className="text-[10px] text-slate-500">
          {ultimoLabel || formatUltimoAggiornamento(item.lastCheckedAt)}
        </p>
        {item.lastCheckNote ? (
          <p className="text-[10px] text-slate-600">{item.lastCheckNote}</p>
        ) : null}
      </button>

      <div className="flex flex-wrap gap-2 border-t border-[var(--border)] px-3 py-2">
        <button
          type="button"
          disabled={pending}
          onClick={(e) => {
            e.stopPropagation();
            refresh();
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
        >
          <FaRotate size={10} className={pending ? "animate-spin" : ""} />
          Ricarica / Aggiorna
        </button>
        <a
          href={item.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-medium text-sky-900 hover:bg-sky-100"
        >
          Vai al sito del corriere
          <FaArrowUpRightFromSquare size={9} />
        </a>
      </div>

      {expanded ? (
        <div className="border-t border-[var(--border)] bg-slate-50/80 px-3 py-2">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Storico controlli
          </p>
          {logs.length === 0 ? (
            <p className="text-[11px] text-slate-500">Nessun log ancora.</p>
          ) : (
            <ol className="space-y-2">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-800">
                      {SHIPPING_STATUS_LABEL[log.status]}
                    </span>
                    <time
                      dateTime={log.createdAt}
                      className="text-[10px] text-slate-500"
                    >
                      {formatLogWhen(log.createdAt)}
                    </time>
                  </div>
                  {typeof log.details.note === "string" && log.details.note ? (
                    <p className="mt-0.5 text-[10px] text-slate-600">
                      {log.details.note}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}
