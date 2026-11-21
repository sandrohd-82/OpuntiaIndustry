"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadClienteSchedaCompletaAction } from "@/app/actions/anagrafica-documenti";
import { caricaSchedaCompletaInizialeAction } from "@/app/actions/scheda-completa-iniziale";
import {
  ContestoMisuraScheda,
  generazioneSchedaDaMontare,
  osservaAzioneScheda,
  segnaChiusuraSchedaCompleta,
  segnaDatiBaseScheda,
  segnaMontaggioSchedaCompleta,
  useValoreMisuraScheda,
} from "@/components/diagnostica/misura-scheda-completa";
import { rispostaAncoraValida } from "@/lib/diagnostica/scheda-completa";
import { AnagraficaDocumentiPanel } from "@/components/amministrazione/AnagraficaDocumentiPanel";
import {
  AnagraficaSchedaDetail,
  type AnagraficaSchedaDetailModel,
  type PacchettoSezioniScheda,
} from "@/components/amministrazione/AnagraficaSchedaDetail";
import { AnagraficaSchedaSection } from "@/components/amministrazione/AnagraficaSchedaSection";
import type {
  AnagraficaDocumento,
  ClienteSchedaFatturaSlim,
  ClienteSchedaOrdineSlim,
} from "@/lib/amministrazione/anagrafica-documenti";
import { useAnagraficaPrivileges } from "@/components/layout/ActionAccessProvider";
import {
  formatCommercialeAssegnazione,
  isCommercialOwnRecord,
} from "@/lib/auth/commerciale";
import type { Cliente } from "@/lib/amministrazione/clienti";
import type { ProdottoProprio } from "@/lib/amministrazione/prodotti-propri";

function euro(n: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(n);
}

function dataIt(iso: string): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : iso;
}

export function ClienteSchedaCompletaModal({
  cliente,
  prodottiByCode,
  lineageIds,
  onClose,
  embedded = false,
}: {
  cliente: Cliente;
  prodottiByCode: Map<string, ProdottoProprio>;
  lineageIds: string[];
  onClose: () => void;
  embedded?: boolean;
}) {
  const priv = useAnagraficaPrivileges("cliente");
  const canEdit = priv.canEdit(
    cliente.createdBy,
    isCommercialOwnRecord({
      userId: priv.userId,
      createdBy: cliente.createdBy,
      commercialeId: cliente.commercialeId,
      affiancatoId: cliente.affiancatoId,
      commercialePersonaId: cliente.commercialePersonaId,
      affiancatoPersonaId: cliente.affiancatoPersonaId,
      lineageIds,
    })
  );
  const ricordata = useRef<{ clienteId: string; generazione: number | null } | null>(
    null
  );
  if (!ricordata.current || ricordata.current.clienteId !== cliente.id) {
    ricordata.current = {
      clienteId: cliente.id,
      generazione: generazioneSchedaDaMontare(cliente.id),
    };
  }
  const generazione = ricordata.current.generazione;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const misura = useValoreMisuraScheda(generazione);
  const [error, setError] = useState<string | null>(null);
  const [verificaOk, setVerificaOk] = useState(false);
  const [documenti, setDocumenti] = useState<AnagraficaDocumento[] | null>(
    null
  );
  const [ordini, setOrdini] = useState<ClienteSchedaOrdineSlim[]>([]);
  const [fatture, setFatture] = useState<ClienteSchedaFatturaSlim[]>([]);
  const [pacchetto, setPacchetto] = useState<PacchettoSezioniScheda | null>(null);
  const idVivo = useRef(cliente.id);
  const montato = useRef(true);
  idVivo.current = cliente.id;

  useEffect(() => {
    montato.current = true;
    return () => {
      montato.current = false;
    };
  }, []);

  function reload() {
    const idRichiesta = cliente.id;
    void osservaAzioneScheda(
      generazione,
      "scheda",
      () => loadClienteSchedaCompletaAction(idRichiesta),
      (res) => (res.success ? "ok" : "errore")
    ).then((res) => {
      if (
        !rispostaAncoraValida({
          attiva: montato.current,
          idRichiesta,
          idCorrente: idVivo.current,
        })
      ) {
        return;
      }
      if (!res.success) {
        setVerificaOk(false);
        setError(res.error);
        return;
      }
      setError(null);
      setDocumenti(res.documenti);
      setOrdini(res.ordini);
      setFatture(res.fatture);
      setVerificaOk(true);
    });
  }

  // canEdit si legge all'avvio: un aggiornamento successivo non riesegue le sei letture.
  useEffect(() => {
    let attiva = true;
    const idRichiesta = cliente.id;
    setVerificaOk(false);
    setError(null);
    setDocumenti(null);
    setOrdini([]);
    setFatture([]);
    setPacchetto(null);
    void osservaAzioneScheda(
      generazione,
      "scheda",
      () =>
        caricaSchedaCompletaInizialeAction({
          clienteId: idRichiesta,
          includiRiepilogo: canEditRef.current,
        }),
      (res) => (res.scheda.success ? "ok" : "errore")
    ).then((res) => {
      if (
        !rispostaAncoraValida({
          attiva: attiva && montato.current,
          idRichiesta,
          idCorrente: idVivo.current,
        })
      ) {
        return;
      }
      setPacchetto({
        id: idRichiesta,
        extra: res.extra,
        schede: res.schede,
        referenti: res.referenti,
        riepilogo: res.riepilogo,
        allerte: res.allerte,
      });
      if (!res.scheda.success) {
        setVerificaOk(false);
        setError(res.scheda.error);
        return;
      }
      setError(null);
      setDocumenti(res.scheda.documenti);
      setOrdini(res.scheda.ordini);
      setFatture(res.scheda.fatture);
      setVerificaOk(true);
    });
    return () => {
      attiva = false;
    };
  }, [cliente.id, generazione]);

  useLayoutEffect(() => {
    if (generazione == null) return;
    segnaMontaggioSchedaCompleta(generazione);
    segnaDatiBaseScheda(generazione);
    return () => segnaChiusuraSchedaCompleta(generazione);
  }, [generazione, cliente.id]);

  const model: AnagraficaSchedaDetailModel = {
    id: cliente.id,
    kind: "cliente",
    codiceTarga: cliente.codiceTarga,
    ragioneSociale: cliente.ragioneSociale,
    partitaIva: cliente.partitaIva,
    codiceFiscale: cliente.codiceFiscale,
    isPrivato: cliente.isPrivato,
    email: cliente.email,
    pec: cliente.pec,
    sdiCode: cliente.sdiCode,
    telefono: cliente.telefono,
    sitoWeb: cliente.sitoWeb,
    emailGeneriche: cliente.emailGeneriche,
    telefoniGenerici: cliente.telefoniGenerici,
    sitiWebGenerici: cliente.sitiWebGenerici,
    sedeAmministrativa: cliente.sedeAmministrativa,
    sedeMagazzino: cliente.sedeMagazzino,
    consegneAltraAzienda: cliente.consegneAltraAzienda,
    prodotti: cliente.prodottiAcquistati,
    prodottiLabel: "Prodotti acquistati",
    commercialeLabel: formatCommercialeAssegnazione(cliente),
    cancellazionePrenotata: cliente.cancellazionePrenotata,
  };

  const modifiche = canEdit && verificaOk;
  const body = (
    <div className="space-y-4">
        <AnagraficaSchedaDetail
          attesaSezioni
          letturaCoordinata
          pacchetto={pacchetto}
          model={model}
          prodottiByCode={prodottiByCode}
          canEditReferenti={modifiche}
          richiediAnagrafica={canEdit}
          modificheAbilitate={verificaOk}
          hideDocumenti
        />
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
        {documenti === null && !error ? (
          <p role="status" className="text-sm text-[var(--muted)]">
            Caricamento documenti, ordini e fatture…
          </p>
        ) : null}
        {documenti !== null ? (
          <div className="space-y-4">
            <AnagraficaDocumentiPanel
              clienteId={cliente.id}
              canEdit={modifiche}
              items={documenti}
              onChanged={reload}
            />
            <AnagraficaSchedaSection title="Ordini" tone="ordini">
              {ordini.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">Nessun ordine.</p>
              ) : (
                <ul className="divide-y divide-blue-100 rounded-lg border border-white/80 bg-white">
                  {ordini.map((o) => (
                    <li
                      key={o.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{o.numeroInterno}</span>
                      <span className="text-xs uppercase text-slate-600">
                        {o.tipo}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {dataIt(o.dataOrdine)}
                      </span>
                      <span className="text-xs">{o.stato}</span>
                      <span className="tabular-nums">{euro(o.importoEuro)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AnagraficaSchedaSection>
            <AnagraficaSchedaSection title="Fatture emesse" tone="fatture">
              {fatture.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  Nessuna fattura emessa.
                </p>
              ) : (
                <ul className="divide-y divide-rose-100 rounded-lg border border-white/80 bg-white">
                  {fatture.map((f) => (
                    <li
                      key={f.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{f.numeroInterno}</span>
                      <span className="text-xs uppercase text-slate-600">
                        {f.tipoDocumento === "nota_credito"
                          ? "Nota di credito"
                          : "Fattura"}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {dataIt(f.dataEmissione)}
                      </span>
                      <span className="text-xs">{f.statoPagamento}</span>
                      <span className="tabular-nums">{euro(f.totale)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </AnagraficaSchedaSection>
          </div>
        ) : null}
    </div>
  );

  const contenuto = embedded ? (
    body
  ) : (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Scheda completa</h2>
            <p className="text-sm text-[var(--muted)]">
              {cliente.codiceTarga} · {cliente.ragioneSociale}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
          >
            Chiudi
          </button>
        </div>
        {body}
      </div>
    </div>
  );

  return (
    <ContestoMisuraScheda.Provider value={misura}>{contenuto}</ContestoMisuraScheda.Provider>
  );
}
