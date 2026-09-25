import type { Cliente } from "@/lib/amministrazione/clienti";
import {
  destinatarioFromCliente,
  type FatturaA4Riga,
  type FatturaDestinatarioSnapshot,
} from "@/lib/amministrazione/fattura-a4-documento";
import { emptySede, normalizeSede } from "@/lib/amministrazione/fornitori";
import type { OrdinePagamentoPiano } from "@/lib/amministrazione/ordine-pagamento-piano";
import {
  emptyTrasporto,
  type Ordine,
  type OrdineTipoPagamento,
} from "@/lib/amministrazione/ordini";
import {
  fasciaScontoExtra as fasciaFromPct,
  parseScontoExtraPct as parsePct,
} from "@/lib/amministrazione/sconto-fuori-listino";

/**
 * Finché è false, wizard ordine + fattura A4 non scrivono su DB / FiC / SDI.
 * Riattivare solo quando l’utente chiede il salvataggio definitivo.
 */
export const ORDINI_PERSISTENZA_DEFINITIVA = false;

export const ORDINI_PERSISTENZA_BLOCCATA_MSG =
  "Salvataggio definitivo disattivato: ordine e fattura restano solo in sessione del browser.";

export const ORDINE_SESSIONE_KEY = "opuntia.ordine.sessione-provvisoria";

export type OrdineSessioneFattura = {
  numeroFattura: string;
  dataDocumento: string;
  destinatario: FatturaDestinatarioSnapshot;
  righe: FatturaA4Riga[];
  noteDocumento: string;
  piano: OrdinePagamentoPiano;
  invioEmail: string;
  intenzione: "bozza" | "salvata" | "inviata-prova";
  contributoSpedizioneRimosso?: boolean;
};

export type OrdineSessione = {
  ordine: Ordine;
  fattura: OrdineSessioneFattura | null;
  updatedAt?: string;
};

export function loadOrdineSessione(): OrdineSessione | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ORDINE_SESSIONE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OrdineSessione;
    if (!parsed?.ordine?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOrdineSessione(sessione: OrdineSessione): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      ORDINE_SESSIONE_KEY,
      JSON.stringify({ ...sessione, updatedAt: new Date().toISOString() })
    );
  } catch {
    /* quota / private mode */
  }
}

export function destinatarioSessioneDaCliente(
  cliente: Cliente | null,
  fallbackNome: string
): FatturaDestinatarioSnapshot {
  if (cliente) return destinatarioFromCliente(cliente);
  return {
    ragioneSociale: fallbackNome.trim() || "Destinatario",
    partitaIva: "",
    codiceFiscale: "",
    sede: normalizeSede(emptySede()),
    email: "",
  };
}

export function buildOrdineSessioneLocale(input: {
  existingId?: string | null;
  numeroInterno: string;
  clienteId: string | null;
  clienteNome: string;
  clienteTarga: string;
  dataOrdine: string;
  tipo: "vendita" | "campionatura";
  prodottoId: string;
  prodottoCodice: string;
  prodottoNome: string;
  quantita: number;
  unitaMisura: Ordine["righe"][number]["unitaMisura"];
  prezzoNetto: number;
  prezzoListino: number | null;
  scontoExtraPct: number;
  importoEuro: number;
  tipoPagamento: OrdineTipoPagamento;
  pagamentoModalita: "unica" | "dilazione";
  destinatario: string;
  indirizzoSpedizione: string;
}): Ordine {
  const now = new Date().toISOString();
  const id = input.existingId || crypto.randomUUID();
  const pct = parsePct(input.scontoExtraPct);
  const numero = input.numeroInterno.trim() || `Or-sessione/${id.slice(0, 4)}`;
  return {
    id,
    numeroInterno: numero,
    numero,
    numeroCliente: "",
    clienteId: input.clienteId,
    cliente: input.clienteNome,
    clienteCodiceTarga: input.clienteTarga || "C000",
    dataOrdine: input.dataOrdine,
    dataConsegna: null,
    dataDisponibilitaPresunta: null,
    stato: "in_attesa",
    tipo: input.tipo,
    processedAt: null,
    processedBy: null,
    processedByLabel: null,
    origineStorico: null,
    sourceOrdineId: null,
    trasporto: emptyTrasporto(),
    importoEuro: input.importoEuro,
    note: "",
    tipoPagamento: input.tipoPagamento,
    pagamentoModalita: input.pagamentoModalita,
    pagato: false,
    dataPagamento: null,
    noteRateizzazione: "",
    ricevutaPagamento: null,
    offerta: null,
    ordineClienteDoc: null,
    versione: 1,
    documentoStato: "bozza",
    consegnaTipo: "asap",
    urgente: false,
    usaMagazzino: false,
    usaSabato: false,
    dataConsegnaStimata: null,
    destinatario: input.destinatario,
    indirizzoSpedizione: input.indirizzoSpedizione,
    capacitaSnapshot: { sessione: true },
    isTest: true,
    scontoExtraPct: pct,
    scontoFascia: fasciaFromPct(pct),
    scontoApprovazioneStato: "non_richiesta",
    prezzoListinoUnitario: input.prezzoListino,
    righe: [
      {
        id: `${id}-r1`,
        prodottoId: input.prodottoId,
        prodottoCodice: input.prodottoCodice,
        prodottoNome: input.prodottoNome,
        quantita: input.quantita,
        unitaMisura: input.unitaMisura,
        lottoCodice: "",
        prezzoUnitario: input.prezzoNetto,
        ivaPercentuale: input.tipo === "campionatura" ? 0 : 22,
      },
    ],
    createdAt: now,
    updatedAt: now,
    createdBy: null,
    updatedBy: null,
    createdByLabel: null,
    updatedByLabel: null,
    deletedAt: null,
  };
}

export function emailsDaCliente(cliente: Cliente | null): string[] {
  if (!cliente) return [];
  const raw = [cliente.email, cliente.pec, ...(cliente.emailGeneriche ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const v = String(e ?? "").trim().toLowerCase();
    if (!v.includes("@") || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}
