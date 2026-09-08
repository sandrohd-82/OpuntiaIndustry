"use client";

import { useEffect, useState, useTransition } from "react";
import { upsertFoglioLavorazioneAction } from "@/app/actions/produzione-aree";
import {
  avviaEsecuzioneProcessoAction,
  listProcessiPerFoglioAction,
  registraPesataAction,
} from "@/app/actions/produzione-foglio-processi";
import {
  formatKg,
  labelEsecuzioneStato,
  type FoglioProcessoDisponibile,
} from "@/lib/produzione/foglio-processi";
import type { FoglioLavorazione } from "@/lib/produzione/fogli-lavorazione";
import { formatTempoMedio } from "@/lib/produzione/processi";

type Props = {
  foglio: FoglioLavorazione;
  filtraAreaId?: string;
};

export function FoglioProcessiPanel({ foglio, filtraAreaId }: Props) {
  const [items, setItems] = useState<FoglioProcessoDisponibile[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [kgObiettivo, setKgObiettivo] = useState("");
  const [kgPesata, setKgPesata] = useState("");
  const [attivitaPesata, setAttivitaPesata] = useState("");

  function applyItems(next: FoglioProcessoDisponibile[]) {
    const filtered = filtraAreaId
      ? next.filter((p) => !p.areaId || p.areaId === filtraAreaId)
      : next;
    setItems(filtered);
    if (openId) {
      const current = next.find((p) => p.processoId === openId);
      const firstPesata = current?.passi.find((s) =>
        s.scripts.some((x) => x.funzione === "pesata")
      );
      if (firstPesata && !attivitaPesata) {
        setAttivitaPesata(firstPesata.attivitaId);
      }
    }
  }

  function load() {
    startTransition(async () => {
      const res = await listProcessiPerFoglioAction(foglio.id);
      if (!res.success) {
        setError(res.error);
        setReady(true);
        return;
      }
      setError(null);
      applyItems(res.items);
      setReady(true);
    });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foglio.id]);

  async function ensureFoglioDb() {
    const sync = await upsertFoglioLavorazioneAction({
      id: foglio.id,
      codice: foglio.label,
      descrizione: foglio.descrizione,
      prodotto: foglio.prodotto,
      stato: foglio.stato,
      startedAt: foglio.startedAt,
      expectedEndAt: foglio.expectedEndAt,
      closedAt: foglio.closedAt,
      note: foglio.note,
      motivo: foglio.motivo,
      ordineId: foglio.ordineId,
      ordineLabel: foglio.ordineLabel,
      lottoId: foglio.lottoId,
      lottoLabel: foglio.lottoLabel,
      codiceProdottoUscita: foglio.codiceProdottoUscita,
    });
    return sync;
  }

  function toggle(processoId: string) {
    setOpenId((prev) => (prev === processoId ? null : processoId));
    const item = items.find((p) => p.processoId === processoId);
    const firstPesata = item?.passi.find((s) =>
      s.scripts.some((x) => x.funzione === "pesata")
    );
    setAttivitaPesata(firstPesata?.attivitaId ?? "");
    setKgObiettivo(item?.esecuzione ? String(item.esecuzione.kgObiettivo) : "");
    setKgPesata("");
  }

  function avvia(processoId: string, hasPesata: boolean) {
    startTransition(async () => {
      const sync = await ensureFoglioDb();
      if (!sync.success) {
        setError(sync.error);
        return;
      }
      const obiettivo = Number(kgObiettivo) || 0;
      if (hasPesata && obiettivo <= 0) {
        setError("Indica il totale da caricare (kg) prima di avviare.");
        return;
      }
      const res = await avviaEsecuzioneProcessoAction({
        foglioId: foglio.id,
        processoId,
        kgObiettivo: obiettivo,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      applyItems(res.items);
    });
  }

  function registra(esecuzioneId: string) {
    startTransition(async () => {
      const kg = Number(kgPesata);
      if (!attivitaPesata) {
        setError("Seleziona l'attività di pesata.");
        return;
      }
      if (!(kg > 0)) {
        setError("Inserisci un peso maggiore di zero.");
        return;
      }
      const res = await registraPesataAction({
        esecuzioneId,
        attivitaId: attivitaPesata,
        kg,
      });
      if (!res.success) {
        setError(res.error);
        return;
      }
      setError(null);
      setKgPesata("");
      applyItems(res.items);
    });
  }

  if (!ready) {
    return (
      <p className="text-xs text-[var(--muted)]">Caricamento processi…</p>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
      <h3 className="text-sm font-semibold">Processi sul foglio</h3>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Seleziona un processo in elenco. Se un’attività ha lo script Pesata, il
        gestionale richiede e salva ogni peso (registro immutabile).
      </p>
      {error ? (
        <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Nessun processo in elenco disponibile.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const open = openId === item.processoId;
            const esec = item.esecuzione;
            return (
              <li
                key={item.processoId}
                className="rounded-lg border border-[var(--border)]"
              >
                <button
                  type="button"
                  onClick={() => toggle(item.processoId)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {item.codice}
                    </span>
                    <span className="ml-2 font-medium">{item.nome}</span>
                    {item.areaNome ? (
                      <span className="ml-2 text-xs text-[var(--muted)]">
                        · {item.areaNome}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    {esec
                      ? `${labelEsecuzioneStato(esec.stato)} · ${formatKg(esec.kgCaricati)}${
                          esec.kgObiettivo > 0
                            ? ` / ${formatKg(esec.kgObiettivo)}`
                            : ""
                        } kg`
                      : item.hasPesata
                        ? "Attende pesata"
                        : "Non avviato"}
                  </span>
                </button>
                {open ? (
                  <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
                    {item.descrizione ? (
                      <p className="text-xs text-[var(--muted)]">
                        {item.descrizione}
                      </p>
                    ) : null}
                    <ol className="space-y-1 text-sm">
                      {item.passi.map((passo, index) => (
                        <li key={passo.id}>
                          <span className="tabular-nums text-[var(--muted)]">
                            {index + 1}.
                          </span>{" "}
                          <span className="font-medium">
                            {passo.attivitaNome}
                          </span>
                          <span className="ml-2 text-xs text-[var(--muted)]">
                            {formatTempoMedio(
                              passo.tempoMedioValore,
                              passo.tempoMedioUnita,
                              passo.tempoOgniValore,
                              passo.tempoOgniUnita
                            )}
                          </span>
                          {passo.scripts.length > 0 ? (
                            <span className="ml-2 text-xs text-[var(--primary)]">
                              Script:{" "}
                              {passo.scripts.map((s) => s.nome).join(", ")}
                            </span>
                          ) : null}
                        </li>
                      ))}
                      {item.passi.length === 0 ? (
                        <li className="text-[var(--muted)]">
                          Nessuna attività in composizione.
                        </li>
                      ) : null}
                    </ol>

                    {!esec ? (
                      <div className="flex flex-wrap items-end gap-2">
                        {item.hasPesata ? (
                          <label className="text-xs text-[var(--muted)]">
                            Totale da caricare (kg)
                            <input
                              type="number"
                              min={0}
                              step="0.001"
                              value={kgObiettivo}
                              onChange={(e) => setKgObiettivo(e.target.value)}
                              className="mt-1 w-40 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => avvia(item.processoId, item.hasPesata)}
                          className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {pending ? "Avvio…" : "Avvia processo"}
                        </button>
                      </div>
                    ) : null}

                    {esec && item.hasPesata ? (
                      <div className="space-y-2 rounded-md bg-slate-50 p-3">
                        <p className="text-xs font-medium">
                          Caricato {formatKg(esec.kgCaricati)}
                          {esec.kgObiettivo > 0
                            ? ` / ${formatKg(esec.kgObiettivo)}`
                            : ""}{" "}
                          kg
                        </p>
                        {esec.stato === "in_corso" ? (
                          <div className="flex flex-wrap items-end gap-2">
                            {item.passi.filter((p) =>
                              p.scripts.some((s) => s.funzione === "pesata")
                            ).length > 1 ? (
                              <label className="text-xs text-[var(--muted)]">
                                Attività
                                <select
                                  value={attivitaPesata}
                                  onChange={(e) =>
                                    setAttivitaPesata(e.target.value)
                                  }
                                  className="mt-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                                >
                                  {item.passi
                                    .filter((p) =>
                                      p.scripts.some(
                                        (s) => s.funzione === "pesata"
                                      )
                                    )
                                    .map((p) => (
                                      <option key={p.id} value={p.attivitaId}>
                                        {p.attivitaNome}
                                      </option>
                                    ))}
                                </select>
                              </label>
                            ) : null}
                            <label className="text-xs text-[var(--muted)]">
                              Pesata (kg)
                              <input
                                type="number"
                                min={0}
                                step="0.001"
                                value={kgPesata}
                                onChange={(e) => setKgPesata(e.target.value)}
                                className="mt-1 w-32 rounded-md border border-[var(--border)] px-2 py-1.5 text-sm"
                              />
                            </label>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => registra(esec.id)}
                              className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                              {pending ? "Registrazione…" : "Registra pesata"}
                            </button>
                          </div>
                        ) : (
                          <p className="text-xs text-emerald-700">
                            Obiettivo raggiunto. Le pesate restano in registro.
                          </p>
                        )}
                        {item.pesate.length > 0 ? (
                          <ul className="space-y-0.5 text-xs text-[var(--muted)]">
                            {item.pesate.map((pesata, index) => (
                              <li key={pesata.id}>
                                #{index + 1} · {formatKg(pesata.kg)} kg ·{" "}
                                {new Date(pesata.createdAt).toLocaleString(
                                  "it-IT"
                                )}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
