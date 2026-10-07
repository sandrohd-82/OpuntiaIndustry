"use client";

import { useEffect, useState } from "react";
import { FaPlus } from "react-icons/fa6";
import { ActionGate } from "@/components/layout/ActionAccessProvider";
import { PageLoading } from "@/components/ui/BusyIndicator";
import { AZ } from "@/lib/auth/action-access";
import { approveScontoSuddivisionePreventivoRigaAction } from "@/app/actions/sconto-suddivisione";
import {
  apriPdfPreventivoEmessoAction,
  listPreventiviAction,
  setPreventivoStatoAction,
} from "@/app/actions/preventivi";
import { createClient } from "@/lib/supabase/client";
import { PreventivoCalcoloSpedizioneSheet } from "@/components/amministrazione/PreventivoCalcoloSpedizioneSheet";
import { OrdiniAttesaCalcoloSpedizione } from "@/components/amministrazione/OrdineCalcoloSpedizioneSheet";
import { PreventivoFormModal } from "@/components/amministrazione/PreventivoFormModal";
import { AccettazioneSeniorBar } from "@/components/amministrazione/AccettazioneSeniorBar";
import { accettazioneSeniorBloccaInvio } from "@/lib/amministrazione/accettazione-senior";
import {
  PREVENTIVO_CONSEGNA_LABEL,
  PREVENTIVO_RACCOLTA_LABEL,
  PREVENTIVO_RACCOLTE,
  PREVENTIVO_STATO_LABEL,
  notifyPreventiviSpedizioneNav,
  type Preventivo,
  type PreventivoRaccolta,
  type PreventivoStato,
} from "@/lib/amministrazione/preventivi";
import { labelTipoPagamento } from "@/lib/amministrazione/ordini";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("it-IT");
  } catch {
    return iso;
  }
}

function statoClass(stato: PreventivoStato) {
  if (stato === "accettato") return "bg-emerald-50 text-emerald-800";
  if (stato === "inviato") return "bg-sky-50 text-sky-800";
  if (stato === "in_attesa_spedizione") return "bg-amber-50 text-amber-900";
  if (stato === "respinto") return "bg-red-50 text-red-700";
  return "bg-slate-100 text-slate-700";
}

export function PreventiviBoard({
  raccoltaFissa,
  archivio = false,
}: {
  raccoltaFissa?: PreventivoRaccolta;
  archivio?: boolean;
} = {}) {
  const [items, setItems] = useState<Preventivo[]>([]);
  const [conteggi, setConteggi] = useState<Record<PreventivoRaccolta, number>>({
    da_completare: 0,
    inviati: 0,
    accettati: 0,
  });
  const [raccolta, setRaccolta] = useState<PreventivoRaccolta>(
    raccoltaFissa ?? "da_completare"
  );
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [completaItem, setCompletaItem] = useState<Preventivo | null>(null);
  const [dettaglioItem, setDettaglioItem] = useState<Preventivo | null>(null);

  async function reload(next = raccolta) {
    const res = await listPreventiviAction({ raccolta: next, archivio });
    if (res.success) {
      setItems(res.items);
      setConteggi(res.conteggi);
      setError(null);
      notifyPreventiviSpedizioneNav();
    } else {
      setError(res.error);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void reload(raccolta).finally(() => {
      if (!cancelled) setReady(true);
    });
    const supabase = createClient();
    const channel = supabase
      .channel(`preventivi-board-${archivio ? "archivio" : "operativi"}-${raccolta}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "preventivi" },
        () => {
          if (!cancelled) void reload(raccolta);
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
    // reload legge la raccolta corrente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raccolta, archivio]);

  async function changeStato(id: string, stato: PreventivoStato) {
    const res = await setPreventivoStatoAction({ id, stato });
    if (!res.success) {
      setError(res.error);
      return;
    }
    await reload();
  }

  if (!ready) {
    return <PageLoading label="Caricamento preventivi" />;
  }

  return (
    <div className="space-y-4">
      {raccoltaFissa ? null : (
        <div className="flex flex-wrap gap-2">
          {PREVENTIVO_RACCOLTE.map((nome) => (
            <button
              key={nome}
              type="button"
              onClick={() => {
                setReady(false);
                setRaccolta(nome);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                raccolta === nome
                  ? "bg-[var(--primary)] text-white"
                  : "border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]"
              }`}
            >
              {PREVENTIVO_RACCOLTA_LABEL[nome]}
              <span className="ml-2 tabular-nums">{conteggi[nome]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          {archivio
            ? "Preventivi creati da più di 30 giorni. Da completare, Inviati e Accettati sono raccolte di questa pagina."
            : raccolta === "da_completare"
              ? "Bozze e preventivi in attesa del costo spedizione. Gli ordini diretti in attesa dello stesso calcolo sono nel riquadro sopra. Restano qui 30 giorni dalla creazione, poi passano in Archivio."
              : raccolta === "inviati"
                ? "Preventivi inviati o respinti. Restano qui 30 giorni dalla creazione, poi passano in Archivio."
                : "Preventivi accettati. Restano qui 30 giorni dalla creazione, poi passano in Archivio."}
        </p>
        {archivio ? null : (
        <ActionGate actionKey={AZ.creaPreventivo}>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          <FaPlus size={14} />
          Nuovo preventivo
        </button>
        </ActionGate>
        )}
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {archivio ? null : <OrdiniAttesaCalcoloSpedizione />}

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--card)] p-10 text-center">
          <p className="text-sm font-medium">Nessun preventivo</p>
          {archivio ? null : (
          <ActionGate actionKey={AZ.creaPreventivo}>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-medium text-white"
          >
            <FaPlus size={14} />
            Nuovo preventivo
          </button>
          </ActionGate>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">N.</th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Cliente
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Data
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Prodotti
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Consegna
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Pagamento
                </th>
                <th className="px-4 py-3 font-medium text-[var(--muted)]">
                  Stato
                </th>
                <th className="px-4 py-3 text-right font-medium text-[var(--muted)]">
                  Azioni
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-mono font-semibold">
                    {item.numeroInterno}
                  </td>
                  <td className="px-4 py-3">{item.cliente}</td>
                  <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                    {formatDate(item.dataPreventivo)}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {item.righe
                      .map((r) => `${r.prodottoCodice} ${r.quantita} ${r.unitaMisura}`)
                      .join(" · ")}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {PREVENTIVO_CONSEGNA_LABEL[item.consegnaMetodo]}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {labelTipoPagamento(item.tipoPagamento)}
                    {item.giorniConsegna
                      ? ` · consegna ${item.giorniConsegna}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statoClass(item.stato)}`}
                    >
                      {accettazioneSeniorBloccaInvio(item.accettazioneSeniorStato)
                        ? item.accettazioneSeniorStato === "rifiutata"
                          ? "Rifiutato dal senior"
                          : "In attesa del senior"
                        : PREVENTIVO_STATO_LABEL[item.stato]}
                    </span>
                    <AccettazioneSeniorBar
                      entity="preventivo"
                      id={item.id}
                      stato={item.accettazioneSeniorStato}
                      nota={item.accettazioneSeniorNota}
                      puoRispondere={item.accettazioneSeniorPuoRispondere}
                      onDone={() => void reload()}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setDettaglioItem(item);
                          setError(null);
                        }}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium"
                      >
                        Dettagli
                      </button>
                      {item.pdfEmessi.map((doc) => (
                        <button
                          key={doc.id}
                          type="button"
                          onClick={() => {
                            void apriPdfPreventivoEmessoAction(doc.id).then((res) => {
                              if (!res.success) {
                                setError(res.error);
                                return;
                              }
                              window.open(res.url, "_blank", "noopener,noreferrer");
                            });
                          }}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium"
                        >
                          {item.pdfEmessi.length > 1
                            ? `PDF v${doc.versione}`
                            : "PDF inviato"}
                        </button>
                      ))}
                      <ActionGate actionKey={AZ.creaPreventivo}>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(item.id);
                            setError(null);
                          }}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs font-medium"
                        >
                          Modifica
                        </button>
                      </ActionGate>
                      {item.righe
                        .filter((r) => r.scontoSuddivisioneStato === "in_attesa")
                        .map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() =>
                              void approveScontoSuddivisionePreventivoRigaAction(
                                r.id
                              ).then((res) => {
                                if (!res.success) {
                                  setError(res.error);
                                  return;
                                }
                                void reload();
                              })
                            }
                            className="rounded-lg bg-sky-700 px-2 py-1 text-xs text-white"
                          >
                            Approva suddivisione {r.prodottoCodice}
                          </button>
                        ))}
                      {item.stato === "in_attesa_spedizione" &&
                      !accettazioneSeniorBloccaInvio(item.accettazioneSeniorStato) ? (
                        item.spedizioneInCorso ? (
                          <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-500">
                            Inserimento in corso
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCompletaItem(item);
                              setError(null);
                            }}
                            className="rounded-lg bg-amber-700 px-2 py-1 text-xs text-white"
                          >
                            Inserisci spedizione e completa
                          </button>
                        )
                      ) : null}
                      {item.stato === "creato" &&
                      !accettazioneSeniorBloccaInvio(item.accettazioneSeniorStato) ? (
                        <button
                          type="button"
                          onClick={() => void changeStato(item.id, "inviato")}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-xs"
                        >
                          Segna inviato
                        </button>
                      ) : null}
                      {item.stato === "inviato" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void changeStato(item.id, "accettato")}
                            className="rounded-lg bg-emerald-700 px-2 py-1 text-xs text-white"
                          >
                            Accettato
                          </button>
                          <button
                            type="button"
                            onClick={() => void changeStato(item.id, "respinto")}
                            className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-700"
                          >
                            Respinto
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dettaglioItem ? (
        <PreventivoCalcoloSpedizioneSheet
          item={dettaglioItem}
          modo="dettagli"
          onClose={() => setDettaglioItem(null)}
        />
      ) : null}

      {completaItem ? (
        <PreventivoCalcoloSpedizioneSheet
          item={completaItem}
          onClose={() => setCompletaItem(null)}
          onCompleted={(message) => {
            setCompletaItem(null);
            setNotice(message);
            void reload();
          }}
        />
      ) : null}

      {editingId ? (
        <PreventivoFormModal
          preventivoId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={(item) => {
            if (item.stato === "in_attesa_spedizione") {
              notifyPreventiviSpedizioneNav();
            }
            void reload();
          }}
        />
      ) : null}

      {creating ? (
        <PreventivoFormModal
          onClose={() => setCreating(false)}
          onSaved={(item) => {
            if (item.stato === "in_attesa_spedizione") {
              setRaccolta("da_completare");
              setNotice(
                `${item.numeroInterno} in elenco, in attesa di inserimento costo spedizione.`
              );
              notifyPreventiviSpedizioneNav();
            }
            void reload(
              item.stato === "in_attesa_spedizione" ? "da_completare" : raccolta
            );
          }}
        />
      ) : null}
    </div>
  );
}
