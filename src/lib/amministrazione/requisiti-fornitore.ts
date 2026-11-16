export const TIPOLOGIE_FORNITORE = [
  "servizio",
  "prodotto",
  "materia_prima",
  "contributo",
] as const;

export type TipologiaFornitore = (typeof TIPOLOGIE_FORNITORE)[number];

export type NaturaRequisito =
  | "presa_visione"
  | "consenso_privacy"
  | "accettazione_contrattuale"
  | "controllo_interno";

export type RequisitoCatalogo = {
  id: string;
  natura: NaturaRequisito;
  tipologie: readonly TipologiaFornitore[];
  validitaGiorni: number | null;
};

export type EccezioneRequisito = {
  requisitoId: string;
  modalita: "aggiunto" | "escluso";
};

export type VoceAbilitazione = {
  id: string;
  natura: NaturaRequisito;
  validitaGiorni: number | null;
  /** Ultima versione pubblicata che il fornitore deve avere. Nullo per il controllo interno. */
  versioneRichiestaId: string | null;
  distribuita: boolean;
  versioneSoddisfattaId: string | null;
  soddisfattoAt: string | null;
  controlloEsito: "conforme" | "non_conforme" | null;
  controlloAt: string | null;
};

export type StatoAbilitazioneFornitore = "abilitato" | "incompleto" | "sospeso";

export function tipologiaFornitoreValida(valore: string): valore is TipologiaFornitore {
  return (TIPOLOGIE_FORNITORE as readonly string[]).includes(valore);
}

export function requisitiApplicabili(input: {
  tipologieFornitore: readonly string[];
  catalogo: readonly RequisitoCatalogo[];
  eccezioni: readonly EccezioneRequisito[];
}): RequisitoCatalogo[] {
  const tipi = new Set(input.tipologieFornitore);
  const eccezione = new Map(input.eccezioni.map((riga) => [riga.requisitoId, riga.modalita]));
  return input.catalogo.filter((requisito) => {
    const mode = eccezione.get(requisito.id);
    if (mode === "escluso") return false;
    if (mode === "aggiunto") return true;
    return requisito.tipologie.some((tipo) => tipi.has(tipo));
  });
}

/**
 * Stessa regola di approvvigionamento_entro_validita:
 * un giorno dura 24 ore UTC e, senza scadenza, basta l'istante di conferma.
 */
export function dentroValidita(
  iso: string | null,
  giorni: number | null,
  oraIso: string
): boolean {
  if (!iso) return false;
  const inizio = Date.parse(iso);
  const ora = Date.parse(oraIso);
  if (Number.isNaN(inizio) || Number.isNaN(ora)) return false;
  if (giorni == null) return true;
  if (!Number.isInteger(giorni) || giorni <= 0) return false;
  return inizio + giorni * 86_400_000 >= ora;
}

export function requisitoSoddisfatto(voce: VoceAbilitazione, oraIso: string): boolean {
  if (voce.natura === "controllo_interno") {
    return (
      voce.controlloEsito === "conforme" &&
      dentroValidita(voce.controlloAt, voce.validitaGiorni, oraIso)
    );
  }
  if (!voce.distribuita || !voce.versioneRichiestaId) return false;
  if (voce.versioneSoddisfattaId !== voce.versioneRichiestaId) return false;
  return dentroValidita(voce.soddisfattoAt, voce.validitaGiorni, oraIso);
}

export function valutaAbilitazione(input: {
  oraIso: string;
  sospeso: boolean;
  voci: readonly VoceAbilitazione[];
}): { stato: StatoAbilitazioneFornitore; mancanti: string[] } {
  const mancanti = input.voci
    .filter((voce) => !requisitoSoddisfatto(voce, input.oraIso))
    .map((voce) => voce.id);
  if (input.sospeso) return { stato: "sospeso", mancanti };
  if (mancanti.length > 0) return { stato: "incompleto", mancanti };
  return { stato: "abilitato", mancanti: [] };
}

export function sospesoDaEventi(
  eventi: readonly { tipo: "sospensione" | "riabilitazione"; at: string }[]
): boolean {
  const ordinati = [...eventi].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const ultimo = ordinati[ordinati.length - 1];
  return ultimo?.tipo === "sospensione";
}

/** Presa visione, consenso e accettazione non si sostituiscono e non sono una firma. */
export function attoCopreNatura(
  atto: NaturaRequisito,
  requisito: NaturaRequisito
): boolean {
  return (
    atto === requisito &&
    atto !== "controllo_interno"
  );
}

export function attoEFirma(_natura: NaturaRequisito): boolean {
  return false;
}

export function avvisoEmailELettura(): boolean {
  return false;
}

export function etichettaNaturaRequisito(natura: NaturaRequisito): string {
  if (natura === "presa_visione") return "Presa visione";
  if (natura === "consenso_privacy") return "Consenso privacy";
  if (natura === "accettazione_contrattuale") return "Accettazione contrattuale";
  return "Controllo interno";
}

export function etichettaStatoAbilitazione(stato: StatoAbilitazioneFornitore): string {
  if (stato === "abilitato") return "Abilitato";
  if (stato === "sospeso") return "Sospeso";
  return "Incompleto";
}
