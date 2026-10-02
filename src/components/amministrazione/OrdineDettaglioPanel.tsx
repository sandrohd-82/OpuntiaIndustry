"use client";

import { useEffect, useState } from "react";
import { FaFilePdf } from "react-icons/fa6";
import { listCorrieriAction } from "@/app/actions/imballaggi-spedizioni";
import { listSediAttiveAction } from "@/app/actions/impostazioni-sedi";
import { getOrdineAllegatoSignedUrlAction } from "@/app/actions/ordini";
import { getPrenotazioneSpedizioneMailAction } from "@/app/actions/spedizione-mail";
import { labelSede } from "@/lib/impostazioni/sedi";
import type { SpedizioneMailPrenotazione } from "@/lib/amministrazione/spedizione-mail";
import { OrdineAuditLogModal } from "@/components/amministrazione/OrdineAuditLogModal";
import {
  formatOperatoreQuando,
  imponibileRiga,
  hintStatoOrdine,
  labelDocumentoStato,
  labelStatoOrdine,
  labelTipoOrdine,
  labelTipoPagamento,
  totaleRiga,
  totaleTrasporto,
  type Ordine,
} from "@/lib/amministrazione/ordini";

function formatEuro(value: number) {
  return value.toLocaleString("it-IT", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(isoDate: string | null) {
  if (!isoDate) return "—";
  try {
    return new Date(isoDate).toLocaleDateString("it-IT");
  } catch {
    return isoDate;
  }
}

function AllegatoLink({
  label,
  path,
  fileName,
}: {
  label: string;
  path: string;
  fileName: string;
}) {
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const result = await getOrdineAllegatoSignedUrlAction(path);
    setBusy(false);
    if (result.success) window.open(result.url, "_blank", "noopener,noreferrer");
  }
  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:underline disabled:opacity-60"
    >
      <FaFilePdf />
      {busy ? "Apertura…" : `${label}: ${fileName}`}
    </button>
  );
}

function testoTracking(
  mail: SpedizioneMailPrenotazione | null | undefined
): string {
  if (mail === undefined) return "Caricamento…";
  if (!mail || (!mail.allegaTracking && mail.stato !== "inviata" && !mail.oggetto)) {
    return mail ? "No. Il tracking non viene inviato al cliente." : "Non impostata";
  }
  const email = mail.destinatarioEmail.trim()
    ? ` a ${mail.destinatarioEmail.trim()}`
    : "";
  if (mail.stato === "inviata") return `Sì. Mail già inviata${email}.`;
  if (!mail.trackingUrl.trim()) {
    return `Sì. Bozza in attesa del tracking${email}.`;
  }
  return `Sì. Bozza pronta con il tracking${email}.`;
}

function labelCarico(ordine: Ordine): string {
  if (ordine.spedizioneACarico === "cliente") return "Cliente";
  if (ordine.spedizioneACarico === "agrinsicilia") return "Agrinsicilia";
  if (ordine.spedizioneACarico === "diviso") {
    return ordine.spedizionePctAgrinsicilia == null
      ? "Diviso"
      : `Diviso · Agrinsicilia ${ordine.spedizionePctAgrinsicilia}%`;
  }
  return "Non indicato";
}

type Props = {
  ordine: Ordine;
  onEdit?: () => void;
};

export function OrdineDettaglioPanel({ ordine, onEdit }: Props) {
  const [auditOpen, setAuditOpen] = useState(false);
  const [sedeLabel, setSedeLabel] = useState("");
  const [corriereNome, setCorriereNome] = useState("");
  const [mail, setMail] = useState<SpedizioneMailPrenotazione | null | undefined>(
    undefined
  );

  useEffect(() => {
    let cancel = false;
    setMail(undefined);
    setSedeLabel("");
    setCorriereNome("");
    void getPrenotazioneSpedizioneMailAction({
      entityType: "ordine",
      entityId: ordine.id,
    }).then((res) => {
      if (!cancel) setMail(res.success ? res.item : null);
    });
    void listSediAttiveAction().then((res) => {
      if (cancel || !res.success) return;
      const sede = res.sedi.find((s) => s.id === ordine.sedePartenzaId);
      setSedeLabel(
        sede ? labelSede(sede) : ordine.sedePartenzaId ? "Sede non trovata" : ""
      );
    });
    if (ordine.corriereId) {
      void listCorrieriAction().then((res) => {
        if (cancel || !res.success) return;
        const trovato = res.items.find((c) => c.id === ordine.corriereId);
        setCorriereNome(trovato?.nome ?? "Corriere scelto");
      });
    }
    return () => {
      cancel = true;
    };
  }, [ordine.id, ordine.sedePartenzaId, ordine.corriereId]);
  const creatoLine = formatOperatoreQuando(
    ordine.createdByLabel,
    ordine.createdAt
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
            Dettaglio ordine
          </p>
          <p className="mt-0.5 font-mono text-sm font-semibold text-[var(--primary)]">
            {ordine.numeroInterno}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--primary-hover)]"
            >
              Modifica ordine
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="font-semibold text-slate-800">
          {labelTipoOrdine(ordine.tipo)} ·{" "}
          <span title={hintStatoOrdine(ordine.stato)}>
            {ordine.scontoApprovazioneStato === "in_attesa"
              ? "In attesa sconto"
              : labelStatoOrdine(ordine.stato)}
          </span>{" "}
          · V
          {ordine.versione} {labelDocumentoStato(ordine.documentoStato)}
        </span>
        <span className="text-[var(--muted)]" aria-hidden>
          ·
        </span>
        <span className="text-[var(--muted)]">Creato da: {creatoLine}</span>
        {ordine.processedAt ? (
          <>
            <span className="text-[var(--muted)]" aria-hidden>
              ·
            </span>
            <span className="text-[var(--muted)]">
              Processato da:{" "}
              {formatOperatoreQuando(
                ordine.processedByLabel,
                ordine.processedAt
              )}
            </span>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setAuditOpen(true)}
          className="text-sm font-medium text-[var(--primary)] underline-offset-2 hover:underline"
        >
          Mostra tutti
        </button>
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Cliente
          </dt>
          <dd className="mt-0.5 font-medium">
            {ordine.clienteCodiceTarga
              ? `${ordine.clienteCodiceTarga} — ${ordine.cliente}`
              : ordine.cliente}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            N. ordine del cliente
          </dt>
          <dd className="mt-0.5">{ordine.numeroCliente || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Data ordine
          </dt>
          <dd className="mt-0.5">{formatDate(ordine.dataOrdine)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Data consegna
          </dt>
          <dd className="mt-0.5">{formatDate(ordine.dataConsegna)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Totale
          </dt>
          <dd className="mt-0.5 font-semibold tabular-nums">
            {formatEuro(ordine.importoEuro)}
          </dd>
        </div>
        {ordine.scontoExtraPct > 0 ? (
          <div>
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Sconto extra
            </dt>
            <dd className="mt-0.5">
              {ordine.scontoExtraPct.toLocaleString("it-IT")}%
              {ordine.prezzoListinoUnitario != null
                ? ` (listino ${formatEuro(ordine.prezzoListinoUnitario)})`
                : ""}
              {ordine.scontoApprovazioneStato === "in_attesa"
                ? " · in attesa di firma"
                : ordine.scontoApprovazioneStato === "approvata"
                  ? " · approvato"
                  : ""}
              {ordine.scontoSuddivisioneAttiva
                ? ` · Agrinsicilia ${ordine.scontoQuotaAziendaPct.toLocaleString("it-IT")}% · commerciale ${ordine.scontoQuotaCommercialePct.toLocaleString("it-IT")}%${
                    ordine.scontoSuddivisioneStato === "in_attesa"
                      ? " · suddivisione in attesa"
                      : ordine.scontoSuddivisioneStato === "approvata"
                        ? " · suddivisione approvata"
                        : ""
                  }`
                : ""}
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Origine
          </dt>
          <dd className="mt-0.5">
            {ordine.origineStorico === "chiusura"
              ? "Chiusura automatica"
              : ordine.origineStorico === "manuale"
                ? "Inserimento manuale"
                : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Tipo pagamento
          </dt>
          <dd className="mt-0.5">
            {labelTipoPagamento(ordine.tipoPagamento)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Pagato
          </dt>
          <dd className="mt-0.5">
            {ordine.pagato ? (
              <span className="font-medium text-emerald-700">Sì</span>
            ) : (
              <span className="font-medium text-amber-700">No</span>
            )}
            {ordine.dataPagamento
              ? ` · ${formatDate(ordine.dataPagamento)}`
              : null}
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Destinatario
          </dt>
          <dd className="mt-0.5">{ordine.destinatario.trim() || "Non indicato"}</dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Indirizzo di spedizione
          </dt>
          <dd className="mt-0.5 whitespace-pre-wrap">
            {ordine.indirizzoSpedizione.trim() || "Non indicato"}
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Luogo di partenza
          </dt>
          <dd className="mt-0.5">
            {ordine.sedePartenzaId
              ? sedeLabel || "Caricamento…"
              : "Non indicato"}
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Tracking al cliente
          </dt>
          <dd className="mt-0.5">{testoTracking(mail)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Foglio di via
          </dt>
          <dd className="mt-0.5">
            {mail?.letteraViaName
              ? `${mail.letteraViaName}. Resta in Agrinsicilia.`
              : "Non caricato. Resta solo per Agrinsicilia."}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Spedizione a carico
          </dt>
          <dd className="mt-0.5">{labelCarico(ordine)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Corriere
          </dt>
          <dd className="mt-0.5">
            {ordine.corriereDaCompilare
              ? "Si sceglie dopo"
              : corriereNome ||
                (ordine.corriereId ? "Corriere scelto" : "Non indicato")}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Consegna
          </dt>
          <dd className="mt-0.5">
            {ordine.consegnaTipo === "asap"
              ? "Prima possibile"
              : ordine.consegnaTipo === "data"
                ? `In data ${formatDate(ordine.dataConsegna)}`
                : "Non indicata"}
            {ordine.urgente ? " · Urgente" : ""}
            {ordine.usaMagazzino ? " · Da magazzino" : ""}
            {ordine.usaSabato ? " · Anche il sabato" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Data stimata
          </dt>
          <dd className="mt-0.5">{formatDate(ordine.dataConsegnaStimata)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Disponibilità presunta
          </dt>
          <dd className="mt-0.5">
            {formatDate(ordine.dataDisponibilitaPresunta)}
          </dd>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <dt className="text-xs font-medium uppercase text-[var(--muted)]">
            Giorni di produzione
          </dt>
          <dd className="mt-0.5">
            {ordine.giorniProduzione.length
              ? ordine.giorniProduzione.map((g) => formatDate(g)).join(", ")
              : "Non indicati"}
          </dd>
        </div>
        {ordine.tipoPagamento === "dilazionato" && ordine.noteRateizzazione ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-medium uppercase text-[var(--muted)]">
              Piano rateizzazione
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap">
              {ordine.noteRateizzazione}
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-col gap-1">
        {ordine.offerta ? (
          <AllegatoLink
            label="Offerta interna"
            path={ordine.offerta.storagePath}
            fileName={ordine.offerta.fileName}
          />
        ) : (
          <p className="text-xs text-[var(--muted)]">Nessuna offerta allegata</p>
        )}
        {ordine.ordineClienteDoc ? (
          <AllegatoLink
            label="Ordine del cliente"
            path={ordine.ordineClienteDoc.storagePath}
            fileName={ordine.ordineClienteDoc.fileName}
          />
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Nessun ordine cliente allegato
          </p>
        )}
        {ordine.ricevutaPagamento ? (
          <AllegatoLink
            label="Ricevuta pagamento"
            path={ordine.ricevutaPagamento.storagePath}
            fileName={ordine.ricevutaPagamento.fileName}
          />
        ) : (
          <p className="text-xs text-[var(--muted)]">
            Nessuna ricevuta di pagamento allegata
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Prodotto</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Prezzo</th>
              <th className="px-3 py-2">IVA %</th>
              <th className="px-3 py-2 text-right">Totale</th>
            </tr>
          </thead>
          <tbody>
            {ordine.righe.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-4 text-center text-xs text-[var(--muted)]"
                >
                  Nessuna riga prodotto
                </td>
              </tr>
            ) : (
              ordine.righe.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">
                    {r.prodottoCodice} — {r.prodottoNome}
                    {r.note?.trim() ? (
                      <div className="mt-0.5 text-xs text-[var(--muted)]">
                        Nota: {r.note.trim()}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {r.quantita} {r.unitaMisura}
                    {r.lottoCodice?.trim() ? (
                      <div className="font-mono text-[10px] text-[var(--muted)]">
                        Lotto {r.lottoCodice.trim()}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {formatEuro(r.prezzoUnitario)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.ivaPercentuale}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatEuro(totaleRiga(r))}
                    <div className="text-[10px] text-[var(--muted)]">
                      Imp. {formatEuro(imponibileRiga(r))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-3 text-sm">
        <p className="font-semibold">Trasporto</p>
        <p className="mt-1 text-[var(--muted)]">
          {ordine.trasporto.azienda || "—"} · Imponibile{" "}
          {formatEuro(ordine.trasporto.imponibile)} · IVA{" "}
          {ordine.trasporto.ivaPercentuale}% · Totale{" "}
          <span className="font-medium text-slate-800">
            {formatEuro(totaleTrasporto(ordine.trasporto))}
          </span>
        </p>
      </div>

      {ordine.note ? (
        <p className="text-sm text-[var(--muted)]">
          <span className="font-medium text-slate-700">Note: </span>
          {ordine.note}
        </p>
      ) : null}

      {auditOpen ? (
        <OrdineAuditLogModal
          ordineId={ordine.id}
          numeroInterno={ordine.numeroInterno}
          onClose={() => setAuditOpen(false)}
        />
      ) : null}
    </div>
  );
}
