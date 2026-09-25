"use client";

import { useEffect, useId, useState } from "react";
import { listPreventivoCommercialiRiferimentoAction } from "@/app/actions/preventivi";
import {
  getFatturaA4ContextAction,
  saveFatturaDaOrdineAction,
} from "@/app/actions/fattura-da-ordine";
import { FatturaA4PiePagina } from "@/components/amministrazione/FatturaA4PiePagina";
import { OrdinePagamentoPianoFields } from "@/components/amministrazione/OrdinePagamentoPianoFields";
import { PreventivoA4Letterhead } from "@/components/amministrazione/PreventivoA4Letterhead";
import { PreventivoEditModal } from "@/components/amministrazione/PreventivoEditModal";
import { PreventivoDocQa } from "@/components/amministrazione/PreventivoDocPencil";
import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  applyTotaleToPiano,
  emptyPagamentoPiano,
  type OrdinePagamentoPiano,
} from "@/lib/amministrazione/ordine-pagamento-piano";
import { formatDestinatarioIndirizzo } from "@/lib/amministrazione/preventivo-letterhead";
import type { PreventivoCommercialeRiferimento } from "@/lib/amministrazione/preventivo-commerciale-riferimento";

type Props = {
  ordineId: string;
  pianoIniziale?: OrdinePagamentoPiano | null;
  onClose: () => void;
  onSaved?: (info: { fatturaId: string; inviata: boolean }) => void;
};

function euro(n: number) {
  return n.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function FatturaA4Modal({
  ordineId,
  pianoIniziale,
  onClose,
  onSaved,
}: Props) {
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [numero, setNumero] = useState("N/ANNO");
  const [dataDocumento, setDataDocumento] = useState("");
  const [imponibile, setImponibile] = useState(0);
  const [imposta, setImposta] = useState(0);
  const [totale, setTotale] = useState(0);
  const [righe, setRighe] = useState<
    Array<{
      codice: string;
      descrizione: string;
      quantita: number;
      unitaMisura: string;
      prezzoUnitario: number;
      ivaPercentuale: number;
    }>
  >([]);
  const [piano, setPiano] = useState<OrdinePagamentoPiano>(emptyPagamentoPiano());
  const [fatturaId, setFatturaId] = useState<string | null>(null);
  const [commerciale, setCommerciale] =
    useState<PreventivoCommercialeRiferimento | null>(null);
  const [commerciali, setCommerciali] = useState<
    PreventivoCommercialeRiferimento[]
  >([]);
  const [editPagamento, setEditPagamento] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inviaEmail, setInviaEmail] = useState(true);
  const [emails, setEmails] = useState<string[]>([]);
  const [emailSel, setEmailSel] = useState("");
  const [emailNuova, setEmailNuova] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [ctx, comm] = await Promise.all([
        getFatturaA4ContextAction({ ordineId }),
        listPreventivoCommercialiRiferimentoAction(),
      ]);
      if (cancelled) return;
      if (!ctx.success) {
        setError(ctx.error);
        setLoading(false);
        return;
      }
      setCliente(ctx.cliente);
      setNumero(ctx.numeroFattura);
      setDataDocumento(ctx.dataDocumento);
      setImponibile(ctx.imponibile);
      setImposta(ctx.imposta);
      setTotale(ctx.totale);
      setRighe(ctx.righe);
      setFatturaId(ctx.fatturaEsistenteId);
      const nextPiano = applyTotaleToPiano(
        pianoIniziale ?? ctx.piano,
        ctx.totale
      );
      setPiano(nextPiano);
      setEmails(ctx.emails);
      setEmailSel(ctx.emails[0] ?? "");
      setInviaEmail(ctx.emails.length > 0);
      if (comm.success) {
        setCommerciali(comm.items);
        setCommerciale(comm.items[0] ?? null);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ordineId, pianoIniziale]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving && !confirmOpen && !editPagamento) {
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
  }, [onClose, saving, confirmOpen, editPagamento]);

  const dest = cliente
    ? formatDestinatarioIndirizzo(cliente.sedeAmministrativa)
    : null;
  const ivaPct = righe.find((r) => r.ivaPercentuale > 0)?.ivaPercentuale ?? 22;

  async function persist(inviaOra: boolean) {
    const email = inviaEmail
      ? (emailNuova.trim() || emailSel).toLowerCase()
      : "";
    if (inviaEmail && !email.includes("@")) {
      setError("Seleziona o aggiungi l’email a cui inviare la fattura.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await saveFatturaDaOrdineAction({
      ordineId,
      fatturaId,
      dataDocumento,
      invioEmail: email,
      inviaOra,
      sendToSdi: inviaOra,
      piano,
      noteDocumento: "",
    });
    setSaving(false);
    if (!res.success) {
      setError(res.error);
      return;
    }
    setFatturaId(res.fatturaId);
    setNumero(res.numeroFattura);
    setConfirmOpen(false);
    if (res.inviata) {
      setMsg(
        `Fattura ${res.numeroFattura} salvata e inviata` +
          (res.courtesyEmailSent && email ? ` a ${email}` : "") +
          (res.sdiSent ? " · SDI tramite Fatture in Cloud." : ".") +
          (res.warning ? ` ${res.warning}` : "")
      );
    } else {
      setMsg(
        `Fattura ${res.numeroFattura} salvata. Potrai inviarla in un secondo momento da Fatture emesse.`
      );
    }
    onSaved?.({ fatturaId: res.fatturaId, inviata: res.inviata });
  }

  return (
    <div
      className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/65 px-3 py-6 sm:px-6"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 print:hidden">
        <h2 id={titleId} className="text-sm font-semibold text-white">
          Fattura da ordine
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
            disabled={saving || loading || !cliente}
            className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Salva fattura
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
            />

            <section className="mt-5">
              <div className="grid grid-cols-2 gap-6 text-[12px] leading-[1.45]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                    Destinatario
                  </p>
                  <p className="mt-1 font-semibold uppercase">
                    {cliente?.ragioneSociale}
                  </p>
                  <PreventivoDocQa
                    domanda="P.IVA"
                    risposta={cliente?.partitaIva || "—"}
                  />
                  <PreventivoDocQa
                    domanda="CF"
                    risposta={cliente?.codiceFiscale || "—"}
                  />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                    Sede
                  </p>
                  <p className="mt-1">{dest?.via || "—"}</p>
                  <p>{dest?.capCitta || "—"}</p>
                </div>
              </div>
            </section>

            <div className="mt-8 border-t border-slate-200 pt-5">
              <table className="w-full text-left text-[11px]">
                <thead className="border-b border-slate-300 text-slate-600">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">Prodotto</th>
                    <th className="py-1.5 pr-2 font-medium">Qty</th>
                    <th className="py-1.5 pr-2 font-medium">Prezzo</th>
                    <th className="py-1.5 font-medium">IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {righe.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">
                        {r.codice} — {r.descrizione}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {r.quantita} {r.unitaMisura}
                      </td>
                      <td className="py-1.5 pr-2 tabular-nums">
                        {euro(r.prezzoUnitario)} €
                      </td>
                      <td className="py-1.5 tabular-nums">{r.ivaPercentuale}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 h-px w-full bg-slate-900" />
            </div>

            <FatturaA4PiePagina
              piano={piano}
              onEditPagamento={() => setEditPagamento(true)}
              numero={numero}
              dataDocumento={dataDocumento}
              ivaPercentuale={ivaPct}
              imponibile={imponibile}
              totaleIva={imposta}
              totale={totale}
            />
          </div>
        </article>
      )}

      {editPagamento ? (
        <PreventivoEditModal
          title="Pagamento e dilazione"
          onClose={() => setEditPagamento(false)}
          onConfirm={() => setEditPagamento(false)}
        >
          <OrdinePagamentoPianoFields
            piano={piano}
            onChange={setPiano}
            totale={totale}
          />
        </PreventivoEditModal>
      ) : null}

      {confirmOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold">Invio fattura</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              La fattura viene sempre salvata. Scegli se inviarla subito
              (email + Fatture in Cloud / SDI) o in un secondo momento.
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
                {saving ? "Salvataggio…" : "Salva, invia dopo"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void persist(true)}
                className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-sm font-medium text-white"
              >
                {saving ? "Invio…" : "Salva e invia subito"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
