"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { listPreventivoCommercialiRiferimentoAction } from "@/app/actions/preventivi";
import {
  getFatturaA4ContextAction,
  saveFatturaDaOrdineAction,
} from "@/app/actions/fattura-da-ordine";
import { FatturaA4PiePagina } from "@/components/amministrazione/FatturaA4PiePagina";
import { OrdinePagamentoPianoFields } from "@/components/amministrazione/OrdinePagamentoPianoFields";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import {
  PreventivoDestinatarioModal,
  PreventivoDestinatarioPicker,
} from "@/components/amministrazione/PreventivoDestinatarioPicker";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
import { FatturaA4RigaEditor } from "@/components/amministrazione/FatturaA4RigaEditor";
import { PreventivoDocField } from "@/components/amministrazione/PreventivoDocPencil";
import { ClearableNumberInput } from "@/components/ui/ClearableNumberInput";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  destinatarioFromCliente,
  destinatarioFromPreventivo,
  destinatarioToPreventivo,
  totalsFromFatturaRighe,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { prezzoScontatoUnitario } from "@/lib/amministrazione/fatture";
import {
  applyTotaleToPiano,
  emptyPagamentoPiano,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  loadOrdineSessione,
  ORDINI_PERSISTENZA_DEFINITIVA,
  saveOrdineSessione,
  type OrdineSessioneFattura,
} from "@/lib/amministrazione/ordine-sessione";
import type { DestinatarioPreventivo } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";

export type FatturaA4SessioneDraft = {
  cliente: Cliente | null;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  piano: OrdinePagamentoPiano;
  emails: string[];
  numeroFattura: string;
  dataDocumento: string;
  noteDocumento: string;
};

type Props = {
  ordineId?: string;
  sessioneDraft?: FatturaA4SessioneDraft | null;
  pianoIniziale?: OrdinePagamentoPiano | null;
  onClose: () => void;
  onSaved?: (info: { fatturaId: string; inviata: boolean }) => void;
};

type EditKind =
  | "data"
  | "commerciale"
  | "destinatario"
  | "intestazione"
  | "prodotto"
  | "note"
  | "pagamento"
  | "totali"
  | null;

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function clienteToPreventivo(c: Cliente): DestinatarioPreventivo {
  return {
    kind: "cliente",
    id: c.id,
    ragioneSociale: c.ragioneSociale,
    partitaIva: c.partitaIva,
    codiceFiscale: c.codiceFiscale,
    codiceTarga: c.codiceTarga,
    email: c.email ?? "",
    sede: c.sedeAmministrativa,
  };
}

export function FatturaA4Modal({
  ordineId,
  sessioneDraft = null,
  pianoIniziale,
  onClose,
  onSaved,
}: Props) {
  const soloSessione =
    !ORDINI_PERSISTENZA_DEFINITIVA || Boolean(sessioneDraft) || !ordineId;
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [destinatario, setDestinatario] =
    useState<FatturaDestinatarioSnapshot | null>(null);
  const [numero, setNumero] = useState("N/ANNO");
  const [dataDocumento, setDataDocumento] = useState("");
  const [righe, setRighe] = useState<FatturaA4Riga[]>([]);
  const [noteDocumento, setNoteDocumento] = useState("");
  const [piano, setPiano] = useState<OrdinePagamentoPiano>(emptyPagamentoPiano());
  const [fatturaId, setFatturaId] = useState<string | null>(null);
  const [commerciale, setCommerciale] =
    useState<PreventivoCommercialeRiferimento | null>(null);
  const [commerciali, setCommerciali] = useState<
    PreventivoCommercialeRiferimento[]
  >([]);
  const [editKind, setEditKind] = useState<EditKind>(null);
  const [editRigaIndex, setEditRigaIndex] = useState<number | null>(null);
  const [draftData, setDraftData] = useState("");
  const [draftCommercialeId, setDraftCommercialeId] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftIva, setDraftIva] = useState<number | "">(22);
  const [draftRiga, setDraftRiga] = useState<FatturaA4Riga | null>(null);
  const [draftIntestazione, setDraftIntestazione] =
    useState<FatturaDestinatarioSnapshot | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviaEmail, setInviaEmail] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailSel, setEmailSel] = useState("");
  const [emailNuova, setEmailNuova] = useState("");

  const totals = useMemo(() => totalsFromFatturaRighe(righe), [righe]);
  const ivaPct =
    righe.find((r) => !r.isSpedizione && r.ivaPercentuale > 0)?.ivaPercentuale ??
    22;

  useEffect(() => {
    setPiano((prev) => applyTotaleToPiano(prev, totals.totale));
  }, [totals.totale]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const comm = await listPreventivoCommercialiRiferimentoAction();
      if (cancelled) return;
      if (comm.success) {
        setCommerciali(comm.items);
        setCommerciale(comm.items[0] ?? null);
      }
      if (soloSessione) {
        const prev = loadOrdineSessione()?.fattura;
        const draft = sessioneDraft;
        const src = prev ??
          (draft
            ? {
                numeroFattura: draft.numeroFattura,
                dataDocumento: draft.dataDocumento,
                destinatario: draft.destinatario,
                righe: draft.righe,
                noteDocumento: draft.noteDocumento,
                piano: draft.piano,
                invioEmail: draft.emails[0] ?? "",
                intenzione: "bozza" as const,
              }
            : null);
        if (!src) {
          setError("Nessuna fattura in sessione.");
          setLoading(false);
          return;
        }
        setCliente(draft?.cliente ?? null);
        setDestinatario(src.destinatario);
        setNumero(src.numeroFattura);
        setDataDocumento(src.dataDocumento);
        setRighe(src.righe);
        setNoteDocumento(src.noteDocumento);
        setFatturaId(null);
        setPiano(pianoIniziale ?? src.piano);
        const mails = draft?.emails ?? [];
        setEmails(mails);
        setEmailSel(src.invioEmail || mails[0] || "");
        setInviaEmail(Boolean(src.invioEmail || mails[0]));
        setLoading(false);
        return;
      }
      if (!ordineId) {
        setError("Ordine non indicato.");
        setLoading(false);
        return;
      }
      const ctx = await getFatturaA4ContextAction({ ordineId });
      if (cancelled) return;
      if (!ctx.success) {
        setError(ctx.error);
        setLoading(false);
        return;
      }
      setCliente(ctx.cliente);
      setDestinatario(ctx.destinatario);
      setNumero(ctx.numeroFattura);
      setDataDocumento(ctx.dataDocumento);
      setRighe(ctx.righe);
      setNoteDocumento(ctx.noteDocumento);
      setFatturaId(ctx.fatturaEsistenteId);
      setPiano(applyTotaleToPiano(pianoIniziale ?? ctx.piano, ctx.totale));
      setEmails(ctx.emails);
      setEmailSel(ctx.emails[0] ?? "");
      setInviaEmail(ctx.emails.length > 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // sessioneDraft solo come fallback al primo open; la fonte è sessionStorage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ordineId, soloSessione]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !confirmOpen && !editKind) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, saving, confirmOpen, editKind]);

  const destPicker = destinatario
    ? destinatarioToPreventivo(
        destinatario,
        cliente ? clienteToPreventivo(cliente) : {
          kind: "cliente",
          id: "",
          ragioneSociale: destinatario.ragioneSociale,
          partitaIva: destinatario.partitaIva,
          codiceFiscale: destinatario.codiceFiscale,
          codiceTarga: "",
          email: destinatario.email,
          sede: destinatario.sede,
        }
      )
    : cliente
      ? clienteToPreventivo(cliente)
      : null;

  async function persist(inviaOra: boolean) {
    if (!destinatario) {
      setError("Intestazione destinatario mancante.");
      return;
    }
    const email = inviaEmail
      ? (emailNuova.trim() || emailSel).toLowerCase()
      : "";
    if (!soloSessione && inviaEmail && !email.includes("@")) {
      setError("Seleziona o aggiungi l’email a cui inviare la fattura.");
      return;
    }
    setSaving(true);
    setError(null);
    if (soloSessione) {
      const prev = loadOrdineSessione();
      if (!prev) {
        setSaving(false);
        setError("Nessun ordine in sessione. Salva prima l’ordine.");
        return;
      }
      const fattura: OrdineSessioneFattura = {
        numeroFattura: numero,
        dataDocumento,
        destinatario,
        righe,
        noteDocumento,
        piano,
        invioEmail: email,
        intenzione: inviaOra ? "inviata-prova" : "salvata",
      };
      saveOrdineSessione({ ordine: prev.ordine, fattura });
      setSaving(false);
      setConfirmOpen(false);
      onSaved?.({ fatturaId: prev.ordine.id, inviata: inviaOra });
      if (inviaOra) {
        onClose();
        return;
      }
      setMsg(`Fattura ${numero} salvata in sessione. Nessun dato sul server.`);
      return;
    }
    if (!ordineId) {
      setSaving(false);
      setError("Ordine non indicato.");
      return;
    }
    const res = await saveFatturaDaOrdineAction({
      ordineId,
      fatturaId,
      dataDocumento,
      invioEmail: email,
      inviaOra,
      sendToSdi: inviaOra,
      piano,
      noteDocumento,
      righe,
      destinatario,
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setFatturaId(res.fatturaId);
    setNumero(res.numeroFattura);
    setConfirmOpen(false);
    onSaved?.({ fatturaId: res.fatturaId, inviata: res.inviata });
    if (res.inviata) {
      onClose();
      return;
    }
    setMsg(
      `Fattura ${res.numeroFattura} salvata. Potrai inviarla in un secondo momento da Fatture emesse.`
    );
  }

  function openEdit(kind: EditKind, rigaIndex?: number) {
    setError(null);
    if (kind === "data") setDraftData(dataDocumento);
    if (kind === "commerciale") setDraftCommercialeId(commerciale?.id ?? "");
    if (kind === "note") setDraftNote(noteDocumento);
    if (kind === "totali") setDraftIva(ivaPct);
    if (kind === "intestazione") {
      setDraftIntestazione(
        destinatario ?? (cliente ? destinatarioFromCliente(cliente) : null)
      );
    }
    if (kind === "prodotto") {
      setEditRigaIndex(rigaIndex ?? null);
      setDraftRiga(
        rigaIndex != null
          ? { ...righe[rigaIndex] }
          : {
              prodottoId: null,
              codice: "",
              descrizione: "",
              quantita: 1,
              unitaMisura: "nr",
              prezzoUnitario: 0,
              scontoPercentuale: 0,
              ivaPercentuale: ivaPct,
              isSpedizione: false,
              note: "",
            }
      );
    }
    setEditKind(kind);
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !editKind) onClose();
      }}
    >
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <h2 id={titleId} className="text-sm font-semibold text-white">
          Fattura da ordine
          {soloSessione ? " · sessione" : ""}
        </h2>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 disabled:opacity-50"
          >
            Chiudi
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={saving || loading || !destinatario}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {soloSessione ? "Salva in sessione" : "Salva fattura"}
          </button>
        </div>
      </div>

      {msg ? (
        <p className="mx-auto mb-3 max-w-[210mm] rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 print:hidden">
          {msg}
        </p>
      ) : null}
      {error ? (
        <p className="mx-auto mb-3 max-w-[210mm] rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 print:hidden">
          {error}
        </p>
      ) : null}
      {soloSessione && !msg ? (
        <p className="mx-auto mb-3 max-w-[210mm] rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 print:hidden">
          Salvataggio solo in sessione: niente database, email o SDI.
        </p>
      ) : null}
      {loading ? (
        <p className="mx-auto max-w-[210mm] text-sm text-white">Caricamento…</p>
      ) : (
        <article
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="paper-invoice-sheet mx-auto w-full max-w-[210mm] bg-white text-slate-900 shadow-[0_8px_30px_rgba(15,23,42,0.18)] ring-1 ring-slate-200"
        >
          <div className="box-border flex min-h-[297mm] flex-col px-[14mm] py-[12mm]">
            <PreventivoA4Letterhead
              numero={numero}
              dataPreventivo={dataDocumento}
              commerciale={commerciale}
              documentoLabel="FATTURA"
              onEditData={() => openEdit("data")}
              onEditCommerciale={() => openEdit("commerciale")}
            />

            {destPicker ? (
              <PreventivoDestinatarioPicker
                value={destPicker}
                onChange={(next) => {
                  if (next) setDestinatario(destinatarioFromPreventivo(next));
                }}
                onEdit={() => openEdit("destinatario")}
              />
            ) : null}
            <p className="mt-1 text-[10px] text-slate-500 print:hidden">
              Intestazione, dicitura, prezzi e sconto possono differire
              dall’ordine. L’ordine non viene modificato.
            </p>

            <div className="mt-8 border-t border-slate-200 pt-5">
              <PreventivoDocField
                label="Modifica prodotti, prezzi e sconto"
                onEdit={() =>
                  openEdit("prodotto", righe.length > 0 ? 0 : undefined)
                }
              >
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-slate-300 text-slate-600">
                    <tr>
                      <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                      <th className="py-1.5 pr-2 font-medium">Qty</th>
                      <th className="py-1.5 pr-2 font-medium">Listino</th>
                      <th className="py-1.5 pr-2 font-medium">Sconto</th>
                      <th className="py-1.5 pr-2 font-medium">Netto</th>
                      <th className="py-1.5 font-medium">IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {righe.map((r, i) => {
                      const netto = prezzoScontatoUnitario(
                        r.prezzoUnitario,
                        r.scontoPercentuale
                      );
                      return (
                        <tr
                          key={`${r.codice}-${i}`}
                          className="cursor-pointer border-b border-slate-100 print:cursor-auto hover:bg-slate-50"
                          onClick={() => openEdit("prodotto", i)}
                        >
                          <td className="py-1.5 pr-2">
                            {r.codice} — {r.descrizione}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {r.quantita} {r.unitaMisura}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {euro(r.prezzoUnitario)} €
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            {r.scontoPercentuale > 0
                              ? `${r.scontoPercentuale} %`
                              : "—"}
                          </td>
                          <td className="py-1.5 pr-2 tabular-nums font-medium">
                            {euro(netto)} €
                          </td>
                          <td className="py-1.5 tabular-nums">
                            {r.ivaPercentuale}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </PreventivoDocField>
              <button
                type="button"
                onClick={() => openEdit("prodotto")}
                className="mt-1 text-[10px] text-slate-400 print:hidden"
              >
                + Aggiungi riga
              </button>
              <PreventivoDocField
                label="Modifica note e dicitura"
                onEdit={() => openEdit("note")}
                className="mt-4"
              >
                <p className="whitespace-pre-line text-[11px] leading-[1.45] text-slate-800">
                  {noteDocumento || "Nessuna nota documento."}
                </p>
              </PreventivoDocField>
              <div className="mt-3 h-px w-full bg-slate-900" />
            </div>

            <FatturaA4PiePagina
              piano={piano}
              onEditPagamento={() => openEdit("pagamento")}
              onEditTotali={() => openEdit("totali")}
              numero={numero}
              dataDocumento={dataDocumento}
              ivaPercentuale={ivaPct}
              imponibile={totals.imponibile}
              totaleIva={totals.imposta}
              totale={totals.totale}
            />
          </div>
        </article>
      )}

      {editKind === "data" ? (
        <PreventivoEditModal
          title="Data fattura"
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            setDataDocumento(draftData);
            setEditKind(null);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Data documento</span>
            <input
              type="date"
              value={draftData}
              onChange={(e) => setDraftData(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}

      {editKind === "commerciale" ? (
        <PreventivoEditModal
          title="Commerciale di riferimento"
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            setCommerciale(
              commerciali.find((c) => c.id === draftCommercialeId) ?? null
            );
            setEditKind(null);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Nome</span>
            <select
              value={draftCommercialeId}
              onChange={(e) => setDraftCommercialeId(e.target.value)}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Seleziona…</option>
              {commerciali.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        </PreventivoEditModal>
      ) : null}

      {editKind === "intestazione" && destPicker ? (
        <PreventivoDestinatarioModal
          value={destPicker}
          onChange={(next) => {
            if (next) setDestinatario(destinatarioFromPreventivo(next));
          }}
          onClose={() => setEditKind(null)}
        />
      ) : null}

      {editKind === "destinatario" && draftIntestazione ? (
        <PreventivoEditModal
          title="Intestazione fattura"
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            if (!draftIntestazione.ragioneSociale.trim()) {
              setError("Inserisci la ragione sociale.");
              return;
            }
            setDestinatario(draftIntestazione);
            setEditKind(null);
          }}
        >
          <p className="text-xs text-slate-500">
            Può differire dall’ordine. L’invio SDI resta sul cliente
            dell’ordine; i dati in fattura sono quelli che imposti qui.
          </p>
          <button
            type="button"
            onClick={() => openEdit("intestazione")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
          >
            Scegli da anagrafica
          </button>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Ragione sociale</span>
            <input
              value={draftIntestazione.ragioneSociale}
              onChange={(e) =>
                setDraftIntestazione({
                  ...draftIntestazione,
                  ragioneSociale: e.target.value,
                })
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">P.IVA</span>
              <input
                value={draftIntestazione.partitaIva}
                onChange={(e) =>
                  setDraftIntestazione({
                    ...draftIntestazione,
                    partitaIva: e.target.value,
                  })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Codice fiscale</span>
              <input
                value={draftIntestazione.codiceFiscale}
                onChange={(e) =>
                  setDraftIntestazione({
                    ...draftIntestazione,
                    codiceFiscale: e.target.value,
                  })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Indirizzo</span>
            <input
              value={draftIntestazione.sede.indirizzo}
              onChange={(e) =>
                setDraftIntestazione({
                  ...draftIntestazione,
                  sede: { ...draftIntestazione.sede, indirizzo: e.target.value },
                })
              }
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">CAP</span>
              <input
                value={draftIntestazione.sede.cap}
                onChange={(e) =>
                  setDraftIntestazione({
                    ...draftIntestazione,
                    sede: { ...draftIntestazione.sede, cap: e.target.value },
                  })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Città</span>
              <input
                value={draftIntestazione.sede.citta}
                onChange={(e) =>
                  setDraftIntestazione({
                    ...draftIntestazione,
                    sede: { ...draftIntestazione.sede, citta: e.target.value },
                  })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Provincia</span>
              <input
                value={draftIntestazione.sede.provincia}
                onChange={(e) =>
                  setDraftIntestazione({
                    ...draftIntestazione,
                    sede: {
                      ...draftIntestazione.sede,
                      provincia: e.target.value,
                    },
                  })
                }
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </PreventivoEditModal>
      ) : null}

      {editKind === "prodotto" && draftRiga ? (
        <PreventivoEditModal
          title={editRigaIndex == null ? "Nuova riga" : "Modifica riga"}
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            if (!draftRiga.descrizione.trim() || !draftRiga.codice.trim()) {
              setError("Codice e dicitura sono obbligatori.");
              return;
            }
            setRighe((prev) => {
              if (editRigaIndex == null) return [...prev, draftRiga];
              return prev.map((r, i) => (i === editRigaIndex ? draftRiga : r));
            });
            setEditKind(null);
          }}
        >
          <FatturaA4RigaEditor
            key={editRigaIndex ?? "nuova"}
            value={draftRiga}
            onChange={setDraftRiga}
          />
          {error && editKind === "prodotto" ? (
            <p className="text-sm text-red-700">{error}</p>
          ) : null}
          {editRigaIndex != null ? (
            <button
              type="button"
              onClick={() => {
                setRighe((prev) => prev.filter((_, i) => i !== editRigaIndex));
                setEditKind(null);
              }}
              className="text-xs text-red-700 underline"
            >
              Rimuovi riga dal documento
            </button>
          ) : null}
        </PreventivoEditModal>
      ) : null}

      {editKind === "note" ? (
        <PreventivoEditModal
          title="Note e dicitura"
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            setNoteDocumento(draftNote);
            setEditKind(null);
          }}
        >
          <textarea
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            rows={5}
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
          />
        </PreventivoEditModal>
      ) : null}

      {editKind === "pagamento" ? (
        <PreventivoEditModal
          title="Pagamento e dilazione"
          onClose={() => setEditKind(null)}
          onConfirm={() => setEditKind(null)}
        >
          <OrdinePagamentoPianoFields
            piano={piano}
            onChange={setPiano}
            totale={totals.totale}
          />
        </PreventivoEditModal>
      ) : null}

      {editKind === "totali" ? (
        <PreventivoEditModal
          title="Aliquota IVA"
          onClose={() => setEditKind(null)}
          onConfirm={() => {
            const n = draftIva === "" ? 22 : Number(draftIva);
            setRighe((prev) =>
              prev.map((r) =>
                r.isSpedizione ? r : { ...r, ivaPercentuale: n }
              )
            );
            setEditKind(null);
          }}
        >
          <label className="block text-sm">
            <span className="mb-1 block font-medium">IVA prodotti (%)</span>
            <ClearableNumberInput
              min={0}
              max={100}
              value={draftIva}
              onValueChange={setDraftIva}
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </PreventivoEditModal>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Invio fattura</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {soloSessione
                ? "Per ora la fattura resta solo in sessione: niente database, email o SDI. Ti dirò io quando salvare in modo definitivo."
                : "La fattura viene sempre salvata come documento proprio (anche se diversa dall’ordine). Scegli se inviarla subito (email + SDI) o dopo."}
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={inviaEmail}
                onChange={(e) => setInviaEmail(e.target.checked)}
              />
              Invia anche per email
            </label>
            {inviaEmail ? (
              <div className="mt-2 space-y-2">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Casella a cui inviare
                  </span>
                  <select
                    value={emailSel}
                    onChange={(e) => setEmailSel(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  >
                    <option value="">Seleziona…</option>
                    {emails.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">
                    Oppure aggiungi email
                  </span>
                  <input
                    type="email"
                    value={emailNuova}
                    onChange={(e) => setEmailNuova(e.target.value)}
                    placeholder="nome@azienda.it"
                    className="w-full rounded-lg border border-[var(--border)] px-3 py-2"
                  />
                </label>
              </div>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm text-red-700">{error}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist(false)}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm"
              >
                {saving
                  ? "Salvataggio…"
                  : soloSessione
                    ? "Salva in sessione"
                    : "Salva, invia dopo"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist(true)}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
              >
                {saving
                  ? "Invio…"
                  : soloSessione
                    ? "Simula invio (sessione)"
                    : "Salva e invia subito"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
