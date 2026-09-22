"use client";

import Link from "next/link";
import { FaArrowDown, FaArrowUp } from "react-icons/fa6";
import {
  buildMexLogAvvio,
  type MexLogRiga,
} from "@/lib/action/iot-mex";
import type { ActionEssiccatoreAzione } from "@/lib/action/azioni-immediate";

function StatoBadge({ stato }: { stato: MexLogRiga["stato"] }) {
  if (stato === "inviato") {
    return (
      <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
        Inviato
      </span>
    );
  }
  if (stato === "ricevuto") {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
        Ricevuto
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
      In attesa
    </span>
  );
}

export function IotMexExchangeLog({
  azione,
}: {
  azione: ActionEssiccatoreAzione;
}) {
  const rows = buildMexLogAvvio(azione);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">Avvio registrato · scambio Mex</p>
        <p className="mt-1 text-emerald-800">
          Quattro messaggi in uscita (Action). Stesso Mex per WiFi, XBee e
          LoRa: classe I, UID 8 byte (SH+SL). Le risposte in ingresso restano
          in attesa finché il dispositivo non è collegato.
        </p>
      </div>

      <ol className="space-y-2">
        {rows.map((row) => {
          const out = row.verso === "out";
          return (
            <li
              key={row.id}
              className={`rounded-lg border px-3 py-2.5 ${
                out
                  ? "border-sky-200 bg-sky-50/70"
                  : "border-dashed border-slate-300 bg-slate-50"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    out ? "text-sky-800" : "text-slate-600"
                  }`}
                >
                  {out ? <FaArrowUp size={10} /> : <FaArrowDown size={10} />}
                  {out ? "OUT" : "IN"}
                </span>
                <span className="rounded bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-white">
                  {row.frame.codice}
                </span>
                <span className="text-sm font-medium">{row.titolo}</span>
                <StatoBadge stato={row.stato} />
              </div>
              <p className="mt-1 text-xs text-slate-600">{row.dettaglio}</p>
              <p className="mt-1 font-mono text-[11px] tracking-wide text-slate-800">
                {row.frame.hexSpaced}
              </p>
              <p className="text-[11px] text-slate-500">
                CLS {row.frame.cls} · SH {row.frame.uidHigh} · SL{" "}
                {row.frame.uidLow} · LEN {row.frame.len} · CHK{" "}
                {row.frame.chk.toString(16).toUpperCase().padStart(2, "0")} ·{" "}
                {row.frame.valido ? "integrità ok" : "checksum non valido"}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-[var(--muted)]">
        Codifica e significato:{" "}
        <Link
          href="/app/archivio/iot/leggenda-mex"
          className="font-medium text-[var(--primary)] hover:underline"
        >
          Archivio → IoT → Leggenda Mex
        </Link>
      </p>
    </div>
  );
}
