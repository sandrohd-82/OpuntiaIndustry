import type { StatoAbilitazioneFornitore } from "@/lib/amministrazione/requisiti-fornitore";
import {
  unitaMateriaPrimaValida,
  type UnitaMateriaPrima,
} from "@/lib/amministrazione/materie-prime";
import { normalizzaUnitaApprovvigionamento } from "@/lib/produzione/unita-approvvigionamento";

export type StatoOrdineApprovvigionamento =
  | "bozza"
  | "pubblicato"
  | "da_ripubblicare"
  | "annullato";

export type RigaPubblicata = {
  materiaPrimaId: string;
  codice: string;
  nome: string;
  quantita: number;
  unitaMisura: string;
  note: string;
};

export type QuadriApprovvigionamento = {
  documento: "Bozza" | "Pubblicato" | "Revisione da pubblicare" | "Annullato";
  notifica:
    | "Notifica da inviare"
    | "Notifica in corso"
    | "Notifica inviata"
    | "Notifica fallita/incerta"
    | null;
  presaVisione: "In attesa di presa visione" | "Visionato" | null;
};

/** Documento, notifica e presa visione restano tre informazioni distinte. */
export function quadriApprovvigionamento(input: {
  stato: StatoOrdineApprovvigionamento;
  notifica: "assente" | "non_inviata" | "in_invio" | "inviata" | "fallita" | "incerta";
  visionato: boolean;
}): QuadriApprovvigionamento {
  let documento: QuadriApprovvigionamento["documento"] = "Bozza";
  if (input.stato === "pubblicato") documento = "Pubblicato";
  if (input.stato === "da_ripubblicare") documento = "Revisione da pubblicare";
  if (input.stato === "annullato") documento = "Annullato";
  let notifica: QuadriApprovvigionamento["notifica"] = null;
  if (input.notifica === "non_inviata") notifica = "Notifica da inviare";
  if (input.notifica === "in_invio") notifica = "Notifica in corso";
  if (input.notifica === "inviata") notifica = "Notifica inviata";
  if (input.notifica === "fallita" || input.notifica === "incerta") {
    notifica = "Notifica fallita/incerta";
  }
  let presaVisione: QuadriApprovvigionamento["presaVisione"] = null;
  if (input.stato !== "bozza" && input.stato !== "annullato") {
    presaVisione = input.visionato ? "Visionato" : "In attesa di presa visione";
  }
  return { documento, notifica, presaVisione };
}

export function differenzeApprovvigionamento(input: {
  dataPrima: string;
  dataDopo: string;
  righePrima: readonly RigaPubblicata[];
  righeDopo: readonly RigaPubblicata[];
}): string[] {
  const voci: string[] = [];
  if (input.dataPrima !== input.dataDopo) {
    voci.push(`Consegna ${input.dataPrima} diventa ${input.dataDopo}`);
  }
  const prima = new Map(input.righePrima.map((riga) => [riga.materiaPrimaId, riga]));
  const dopo = new Map(input.righeDopo.map((riga) => [riga.materiaPrimaId, riga]));
  for (const [id, riga] of dopo) {
    const vecchia = prima.get(id);
    if (!vecchia) {
      voci.push(`Aggiunta ${riga.codice}`);
      continue;
    }
    if (vecchia.quantita !== riga.quantita || vecchia.unitaMisura !== riga.unitaMisura) {
      voci.push(
        `${riga.codice}: ${vecchia.quantita} ${vecchia.unitaMisura} diventa ${riga.quantita} ${riga.unitaMisura}`
      );
    }
  }
  for (const [id, riga] of prima) {
    if (!dopo.has(id)) voci.push(`Tolta ${riga.codice}`);
  }
  return voci;
}

/** La conferma di una versione non copre la successiva. */
export function presaVisioneCopre(confermataVersioneId: string, versioneRichiestaId: string): boolean {
  return confermataVersioneId === versioneRichiestaId;
}

export type RuoloVersionePortale = "corrente" | "storica";

/** La versione corrente è solo l'ultima pubblicata. Le altre restano storiche. */
export function ruoloVersionePortale(
  numero: number,
  versionePubblicata: number | null
): RuoloVersionePortale {
  return versionePubblicata != null && numero === versionePubblicata ? "corrente" : "storica";
}

export function etichettaVersionePortale(ruolo: RuoloVersionePortale): string {
  return ruolo === "corrente" ? "Versione pubblicata corrente" : "Versione storica superata";
}

/** Una versione superata o una consegna annullata non si accettano. */
export function versioneAccettabile(input: {
  ruolo: RuoloVersionePortale;
  annullata: boolean;
  giaRisposta: boolean;
}): { ok: true } | { ok: false; motivo: string } {
  if (input.annullata) {
    return { ok: false, motivo: "Consegna annullata. Questa versione non è più valida." };
  }
  if (input.ruolo !== "corrente") {
    return { ok: false, motivo: "Versione storica superata. Non va accettata." };
  }
  if (input.giaRisposta) {
    return { ok: false, motivo: "Questa versione ha già una risposta." };
  }
  return { ok: true };
}

export function meseDaData(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return `${iso.slice(0, 7)}-01`;
}

export const AVVISO_BOZZA_NON_PUBBLICATA =
  "In Produzione ci sono modifiche non ancora pubblicate.";

type CoperturaVersione = { versioneId?: string };

/** Una presa del piano copre solo le versioni presenti nel suo snapshot. */
export function presaCheCopreVersione(input: {
  versioneId: string;
  dirette: readonly { versioneId: string; profileId: string; at: string }[];
  piani: readonly {
    profileId: string;
    at: string;
    copertura: readonly CoperturaVersione[] | null;
  }[];
}): { profileId: string; at: string; origine: "ordine" | "piano" } | null {
  const diretta = input.dirette.find((voce) => voce.versioneId === input.versioneId);
  if (diretta) return { profileId: diretta.profileId, at: diretta.at, origine: "ordine" };
  const piano = input.piani.find((voce) =>
    (voce.copertura ?? []).some((riga) => riga.versioneId === input.versioneId)
  );
  if (!piano) return null;
  return { profileId: piano.profileId, at: piano.at, origine: "piano" };
}

export type RigaApprovvigionamento = {
  materiaPrimaId: string;
  codice: string;
  quantita: number;
  unitaMisura: string;
};

export function giornoValido(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const anno = Number(match[1]);
  const mese = Number(match[2]);
  const giorno = Number(match[3]);
  const data = new Date(Date.UTC(anno, mese - 1, giorno));
  return (
    data.getUTCFullYear() === anno &&
    data.getUTCMonth() === mese - 1 &&
    data.getUTCDate() === giorno
  );
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  if (!giornoValido(iso)) throw new Error("Data non valida");
  const [anno, mese, giorno] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno + giorni));
  const m = String(data.getUTCMonth() + 1).padStart(2, "0");
  const d = String(data.getUTCDate()).padStart(2, "0");
  return `${data.getUTCFullYear()}-${m}-${d}`;
}

export function differenzaGiorni(da: string, a: string): number {
  if (!giornoValido(da) || !giornoValido(a)) throw new Error("Data non valida");
  const [ya, ma, daG] = da.split("-").map(Number);
  const [yb, mb, db] = a.split("-").map(Number);
  const inizio = Date.UTC(ya, ma - 1, daG);
  const fine = Date.UTC(yb, mb - 1, db);
  return Math.round((fine - inizio) / 86_400_000);
}

/** Lunedì della settimana che contiene la data. */
export function lunediSettimana(iso: string): string {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(anno, mese - 1, giorno));
  const feriale = data.getUTCDay();
  const delta = feriale === 0 ? -6 : 1 - feriale;
  return aggiungiGiorni(iso, delta);
}

export function giorniSettimana(lunedi: string): string[] {
  const inizio = lunediSettimana(lunedi);
  return Array.from({ length: 7 }, (_, indice) => aggiungiGiorni(inizio, indice));
}

export function giorniMese(annoMese: string): string[] {
  const match = /^(\d{4})-(\d{2})$/.exec(annoMese);
  if (!match) return [];
  const anno = Number(match[1]);
  const mese = Number(match[2]);
  const primo = `${match[1]}-${match[2]}-01`;
  if (!giornoValido(primo)) return [];
  const ultimo = new Date(Date.UTC(anno, mese, 0)).getUTCDate();
  return Array.from({ length: ultimo }, (_, indice) =>
    aggiungiGiorni(primo, indice)
  );
}

export function unitaCoerente(
  unitaCatalogo: string | null | undefined,
  unitaRichiesta: string
): unitaCatalogo is UnitaMateriaPrima {
  return unitaMateriaPrimaValida(unitaCatalogo) && unitaCatalogo === unitaRichiesta;
}

export function rigaOrdineValida(input: {
  materiaPrimaId: string;
  quantita: number;
  unitaCatalogo: string | null;
  unitaRichiesta: string;
}): { ok: true } | { ok: false; motivo: string } {
  if (!input.materiaPrimaId) return { ok: false, motivo: "Materia prima mancante." };
  if (!(input.quantita > 0) || !Number.isFinite(input.quantita)) {
    return { ok: false, motivo: "La quantità deve essere positiva." };
  }
  const unita = normalizzaUnitaApprovvigionamento(input.unitaRichiesta);
  if (!unita.ok) return unita;
  return { ok: true };
}

/** La nuova consegna usa materia, unità e tipo scelti, non la prima riga del piano. */
export function consegnaSelezionataValida(input: {
  materiaPrimaId: string;
  quantita: number;
  unitaCatalogo: string | null;
  unitaRichiesta: string;
  tipoQuantita: string;
  data: string;
}): { ok: true; tipoQuantita: "precisa" | "stimata" } | { ok: false; motivo: string } {
  const riga = rigaOrdineValida({
    materiaPrimaId: input.materiaPrimaId,
    quantita: input.quantita,
    unitaCatalogo: input.unitaCatalogo,
    unitaRichiesta: input.unitaRichiesta,
  });
  if (!riga.ok) return riga;
  if (input.tipoQuantita !== "precisa" && input.tipoQuantita !== "stimata") {
    return { ok: false, motivo: "Indica se la quantità è precisa o stimata." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.data)) {
    return { ok: false, motivo: "Data non valida." };
  }
  return { ok: true, tipoQuantita: input.tipoQuantita };
}

export function fornitoreAssegnabile(input: {
  tipologie: readonly string[];
  codiciAssociati: readonly string[];
  codiciRichiesti: readonly string[];
  stato: StatoAbilitazioneFornitore;
}): { ok: true } | { ok: false; motivo: string } {
  if (!input.tipologie.includes("materia_prima")) {
    return { ok: false, motivo: "Il fornitore non è di materia prima." };
  }
  if (input.stato === "sospeso") {
    return { ok: false, motivo: "Il fornitore è sospeso." };
  }
  if (input.stato === "incompleto") {
    return { ok: false, motivo: "Il fornitore non è abilitato." };
  }
  const associati = new Set(input.codiciAssociati);
  const mancanti = input.codiciRichiesti.filter((codice) => !associati.has(codice));
  if (mancanti.length > 0) {
    return { ok: false, motivo: "Il fornitore non tratta tutte le materie scelte." };
  }
  if (input.codiciRichiesti.length === 0) {
    return { ok: false, motivo: "Serve almeno una materia prima." };
  }
  return { ok: true };
}

export function puoGestireApprovvigionamento(soggetto: {
  superadmin: boolean;
  aree: readonly string[];
}): boolean {
  return (
    soggetto.superadmin ||
    soggetto.aree.includes("produzione") ||
    soggetto.aree.includes("amministrazione")
  );
}

/** Settimana intera se i giorni stanno in un lunedì-domenica, altrimenti il mese. */
export function classificaProgrammazione(date: readonly string[]):
  | { tipo: "settimana" | "piano"; inizio: string; fine: string }
  | { tipo: "errore"; motivo: string } {
  const uniche = dateUniche(date);
  if (!uniche.length) {
    return { tipo: "errore", motivo: "Il piano deve contenere almeno un giorno." };
  }
  const inizioSettimana = lunediSettimana(uniche[0]);
  const fineSettimana = aggiungiGiorni(inizioSettimana, 6);
  if (uniche.every((giorno) => giorno >= inizioSettimana && giorno <= fineSettimana)) {
    return { tipo: "settimana", inizio: inizioSettimana, fine: fineSettimana };
  }
  const mese = uniche[0].slice(0, 7);
  if (!uniche.every((giorno) => giorno.slice(0, 7) === mese)) {
    return {
      tipo: "errore",
      motivo: "Un piano resta nella stessa settimana o nello stesso mese.",
    };
  }
  const giorni = giorniMese(mese);
  return {
    tipo: "piano",
    inizio: giorni[0] ?? uniche[0],
    fine: giorni[giorni.length - 1] ?? uniche[0],
  };
}

export function dateUniche(date: readonly string[]): string[] {
  return [...new Set(date.filter(giornoValido))].sort();
}

export type BozzaCopia = {
  origineId: string;
  dataConsegna: string;
  chiave: string;
};

export function copiaOrdineSuData(input: {
  origineId: string;
  data: string;
  chiave: string;
}): BozzaCopia {
  if (!giornoValido(input.data)) throw new Error("Data non valida");
  return {
    origineId: input.origineId,
    dataConsegna: input.data,
    chiave: input.chiave,
  };
}

export function copiaSettimana(input: {
  origineLunedi: string;
  destinazioneLunedi: string;
  ordini: readonly { id: string; dataConsegna: string }[];
  chiave: string;
}): BozzaCopia[] {
  const origine = lunediSettimana(input.origineLunedi);
  const destinazione = lunediSettimana(input.destinazioneLunedi);
  const fine = aggiungiGiorni(origine, 6);
  return input.ordini
    .filter((ordine) => ordine.dataConsegna >= origine && ordine.dataConsegna <= fine)
    .map((ordine) => ({
      origineId: ordine.id,
      dataConsegna: aggiungiGiorni(
        destinazione,
        differenzaGiorni(origine, ordine.dataConsegna)
      ),
      chiave: input.chiave,
    }));
}

/** La seconda chiamata con la stessa chiave non crea un altro ordine. */
export function registraConChiave<T>(
  registro: Map<string, T>,
  chiave: string,
  crea: () => T
): { valore: T; nuova: boolean } {
  const gia = registro.get(chiave);
  if (gia) return { valore: gia, nuova: false };
  const valore = crea();
  registro.set(chiave, valore);
  return { valore, nuova: true };
}

export function etichettaStatoOrdine(stato: StatoOrdineApprovvigionamento): string {
  return quadriApprovvigionamento({ stato, notifica: "assente", visionato: false }).documento;
}

export type TipoQuantitaApprovvigionamento = "precisa" | "stimata";
export type CadenzaApprovvigionamento = "regolare" | "personalizzata";

export const MASSIMO_CONSEGNE_PIANO = 200;

export function dateRegolari(inizio: string, fine: string, ogniGiorni: number): string[] {
  if (!giornoValido(inizio) || !giornoValido(fine) || fine < inizio) return [];
  if (!Number.isInteger(ogniGiorni) || ogniGiorni < 1) return [];
  const date: string[] = [];
  let cursore = inizio;
  while (cursore <= fine && date.length <= MASSIMO_CONSEGNE_PIANO) {
    date.push(cursore);
    cursore = aggiungiGiorni(cursore, ogniGiorni);
  }
  return date;
}

/** 0 domenica … 6 sabato, in UTC, come il resto delle date del calendario. */
export function indiceGiornoSettimana(iso: string): number {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return new Date(Date.UTC(anno, mese - 1, giorno)).getUTCDay();
}

export const NOMI_GIORNO_SETTIMANA = [
  "domenica",
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
] as const;

export type FrequenzaProcedura = "ogni_n" | "giorni_fissi" | "manuale";

function periodoConsegne(
  inizio: string,
  fine: string
): { ok: true } | { ok: false; motivo: string } {
  if (!giornoValido(inizio) || !giornoValido(fine)) {
    return { ok: false, motivo: "Indica data inizio e data fine." };
  }
  if (fine < inizio) return { ok: false, motivo: "La data fine precede la data inizio." };
  return { ok: true };
}

function giorniConsentitiValidi(
  giorni: readonly number[]
): { ok: true; valori: Set<number> } | { ok: false; motivo: string } {
  const valori = new Set(giorni.filter((giorno) => Number.isInteger(giorno) && giorno >= 0 && giorno <= 6));
  if (valori.size === 0) {
    return { ok: false, motivo: "Seleziona almeno un giorno della settimana." };
  }
  return { ok: true, valori };
}

/** Primo giorno del periodo che cade in un giorno consentito. */
export function primoGiornoUtile(
  inizio: string,
  fine: string,
  giorniConsentiti: readonly number[]
): string | null {
  const periodo = periodoConsegne(inizio, fine);
  if (!periodo.ok) return null;
  const consentiti = giorniConsentitiValidi(giorniConsentiti);
  if (!consentiti.ok) return null;
  let cursore = inizio;
  while (cursore <= fine) {
    if (consentiti.valori.has(indiceGiornoSettimana(cursore))) return cursore;
    cursore = aggiungiGiorni(cursore, 1);
  }
  return null;
}

/**
 * Ogni N giorni di calendario, ancorati alla prima consegna.
 * Un giorno non consentito si salta e non si sposta: la ricorrenza successiva resta sulla sequenza originale.
 */
export function dateOgniNGiorni(input: {
  inizio: string;
  fine: string;
  primaConsegna: string;
  ogniGiorni: number;
  giorniConsentiti: readonly number[];
}): { ok: true; date: string[]; escluse: string[] } | { ok: false; motivo: string } {
  const periodo = periodoConsegne(input.inizio, input.fine);
  if (!periodo.ok) return periodo;
  if (!giornoValido(input.primaConsegna)) {
    return { ok: false, motivo: "Indica la data della prima consegna." };
  }
  if (input.primaConsegna < input.inizio) {
    return { ok: false, motivo: "La prima consegna non può precedere la data iniziale." };
  }
  if (input.primaConsegna > input.fine) {
    return { ok: false, motivo: "La prima consegna è fuori dal periodo." };
  }
  if (!Number.isInteger(input.ogniGiorni) || input.ogniGiorni < 1) {
    return { ok: false, motivo: "Indica ogni quanti giorni ripetere la consegna." };
  }
  const consentiti = giorniConsentitiValidi(input.giorniConsentiti);
  if (!consentiti.ok) return consentiti;
  const date: string[] = [];
  const escluse: string[] = [];
  let cursore = input.primaConsegna;
  let passi = 0;
  while (cursore <= input.fine && passi <= MASSIMO_CONSEGNE_PIANO) {
    if (consentiti.valori.has(indiceGiornoSettimana(cursore))) date.push(cursore);
    else escluse.push(cursore);
    cursore = aggiungiGiorni(cursore, input.ogniGiorni);
    passi += 1;
  }
  if (cursore <= input.fine) {
    return { ok: false, motivo: "La pianificazione supera 200 consegne." };
  }
  if (date.length === 0) {
    return { ok: false, motivo: "Nessuna consegna cade in un giorno consentito." };
  }
  return { ok: true, date, escluse };
}

/** Tutte le occorrenze dei giorni scelti, dentro il periodo, senza date prima o dopo. */
export function dateGiorniFissi(input: {
  inizio: string;
  fine: string;
  giorni: readonly number[];
}): { ok: true; date: string[] } | { ok: false; motivo: string } {
  const periodo = periodoConsegne(input.inizio, input.fine);
  if (!periodo.ok) return periodo;
  const consentiti = giorniConsentitiValidi(input.giorni);
  if (!consentiti.ok) return consentiti;
  const date: string[] = [];
  let cursore = input.inizio;
  while (cursore <= input.fine) {
    if (consentiti.valori.has(indiceGiornoSettimana(cursore))) {
      date.push(cursore);
      if (date.length > MASSIMO_CONSEGNE_PIANO) {
        return { ok: false, motivo: "La pianificazione supera 200 consegne." };
      }
    }
    cursore = aggiungiGiorni(cursore, 1);
  }
  if (date.length === 0) {
    return { ok: false, motivo: "Nessun giorno selezionato cade nel periodo." };
  }
  return { ok: true, date };
}

export type ConsegnaAnteprima = {
  data: string;
  quantita: number;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  unitaMisura: string;
};

/** Solo calcolo. Non scrive ordini, piani o notifiche. */
export function anteprimaConsegne(input: {
  operazione: "singolo" | "pianificazione";
  data?: string;
  inizio?: string;
  fine?: string;
  cadenza?: CadenzaApprovvigionamento;
  ogniGiorni?: number;
  dateScelte?: readonly string[];
  frequenza?: FrequenzaProcedura;
  primaConsegna?: string;
  giorniConsentiti?: readonly number[];
  quantita: number;
  copiaQuantita: boolean;
  quantitaPerData?: Readonly<Record<string, number>>;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  unitaMisura: string;
}): { ok: true; consegne: ConsegnaAnteprima[]; escluse: string[] } | { ok: false; motivo: string } {
  if (input.tipoQuantita !== "precisa" && input.tipoQuantita !== "stimata") {
    return { ok: false, motivo: "Indica se la quantità è precisa o stimata." };
  }
  const unita = normalizzaUnitaApprovvigionamento(input.unitaMisura);
  if (!unita.ok) return { ok: false, motivo: "Indica l'unità di misura." };
  let date: string[] = [];
  let escluse: string[] = [];
  if (input.operazione === "singolo") {
    if (!input.data || !giornoValido(input.data)) {
      return { ok: false, motivo: "Indica la data di consegna." };
    }
    date = [input.data];
  } else if (input.frequenza === "ogni_n") {
    let prima = "";
    if (input.primaConsegna && giornoValido(input.primaConsegna)) prima = input.primaConsegna;
    else prima = primoGiornoUtile(input.inizio ?? "", input.fine ?? "", input.giorniConsentiti ?? []) ?? "";
    const generate = dateOgniNGiorni({
      inizio: input.inizio ?? "",
      fine: input.fine ?? "",
      primaConsegna: prima,
      ogniGiorni: input.ogniGiorni ?? 0,
      giorniConsentiti: input.giorniConsentiti ?? [],
    });
    if (!generate.ok) return generate;
    date = generate.date;
    escluse = generate.escluse;
  } else if (input.frequenza === "giorni_fissi") {
    const generate = dateGiorniFissi({
      inizio: input.inizio ?? "",
      fine: input.fine ?? "",
      giorni: input.giorniConsentiti ?? [],
    });
    if (!generate.ok) return generate;
    date = generate.date;
  } else {
    if (!input.inizio || !input.fine || !giornoValido(input.inizio) || !giornoValido(input.fine)) {
      return { ok: false, motivo: "Indica data inizio e data fine." };
    }
    if (input.fine < input.inizio) {
      return { ok: false, motivo: "La data fine precede la data inizio." };
    }
    if (input.frequenza === "manuale" || input.cadenza === "personalizzata") {
      date = dateUniche(input.dateScelte ?? []).filter(
        (giorno) => giorno >= input.inizio! && giorno <= input.fine!
      );
      if (!date.length) {
        return { ok: false, motivo: "Seleziona almeno una data nel periodo." };
      }
    } else {
      if (!input.ogniGiorni || !Number.isInteger(input.ogniGiorni) || input.ogniGiorni < 1) {
        return { ok: false, motivo: "Indica ogni quanti giorni ripetere la consegna." };
      }
      date = dateRegolari(input.inizio, input.fine, input.ogniGiorni);
    }
  }
  if (date.length > MASSIMO_CONSEGNE_PIANO) {
    return { ok: false, motivo: "La pianificazione supera 200 consegne." };
  }
  const consegne: ConsegnaAnteprima[] = [];
  for (const data of date) {
    const propria = input.quantitaPerData?.[data];
    let quantita: number | undefined;
    if (propria != null && Number.isFinite(propria)) quantita = propria;
    else if (input.copiaQuantita) quantita = input.quantita;
    if (!(typeof quantita === "number") || !(quantita > 0) || !Number.isFinite(quantita)) {
      return { ok: false, motivo: `Indica la quantità del ${data}.` };
    }
    consegne.push({
      data,
      quantita,
      tipoQuantita: input.tipoQuantita,
      unitaMisura: unita.sigla,
    });
  }
  return { ok: true, consegne, escluse };
}

export type VoceRiepilogo = {
  chiave: string;
  etichetta: string;
  valore: number | null;
  unita: string | null;
  disponibile: boolean;
  motivo: string | null;
};

export type RigaRiepilogoApprovvigionamento = {
  ordineId: string;
  materiaId: string;
  unita: string;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  pianificata: number;
  ordinata: number | null;
  confermata: number | null;
  arrivata: number | null;
  arrivataMancante: boolean;
  accettata: number | null;
  respinta: number | null;
  scaricata: number | null;
  lottiCollegati: boolean;
  unitaLottoDiversa: boolean;
};

function voce(
  chiave: string,
  etichetta: string,
  valore: number | null,
  unita: string | null,
  motivo: string | null
): VoceRiepilogo {
  return {
    chiave,
    etichetta,
    valore,
    unita,
    disponibile: motivo == null,
    motivo,
  };
}

function somma(valori: readonly (number | null)[]): number {
  return valori.reduce<number>((totale, valore) => totale + (valore ?? 0), 0);
}

/**
 * Ordinato, confermato, arrivato e lotti sono della consegna, non della riga ripetuta.
 * La quantità pianificata resta la somma delle righe. Una versione storica non entra.
 */
export function righeSenzaDuplicati(
  righe: readonly RigaRiepilogoApprovvigionamento[]
): RigaRiepilogoApprovvigionamento[] {
  const gia = new Map<string, RigaRiepilogoApprovvigionamento>();
  return righe.map((riga) => {
    const chiave = `${riga.ordineId}|${riga.materiaId}|${riga.unita}`;
    const prima = gia.get(chiave);
    if (prima) {
      return {
        ...riga,
        ordinata: 0,
        confermata: 0,
        arrivata: 0,
        arrivataMancante: prima.arrivataMancante || riga.arrivataMancante,
        accettata: 0,
        respinta: 0,
        scaricata: 0,
        lottiCollegati: prima.lottiCollegati,
        unitaLottoDiversa: prima.unitaLottoDiversa || riga.unitaLottoDiversa,
      };
    }
    gia.set(chiave, riga);
    return riga;
  });
}

/** Non somma unità diverse e non sostituisce un collegamento mancante con zero. */
export function riepilogoApprovvigionamento(input: {
  righe: readonly RigaRiepilogoApprovvigionamento[];
  giacenza: { quantita: number; unita: string } | null;
  motivoGiacenza: string | null;
}): { consegne: number; voci: VoceRiepilogo[] } {
  const righe = righeSenzaDuplicati(input.righe);
  const consegne = new Set(righe.map((riga) => riga.ordineId)).size;
  const unita = [...new Set(righe.map((riga) => riga.unita).filter(Boolean))];
  if (righe.length > 0 && unita.length !== 1) {
    const motivo = "Unità diverse: non si sommano.";
    return {
      consegne,
      voci: [
        voce("pianificata_precisa", "Quantità pianificata precisa", null, null, motivo),
        voce("pianificata_stimata", "Quantità pianificata stimata", null, null, motivo),
        voce("ordinata", "Quantità ordinata", null, null, motivo),
        voce("confermata", "Quantità confermata", null, null, motivo),
        voce("arrivata", "Quantità arrivata", null, null, motivo),
        voce("accettata", "Quantità accettata", null, null, motivo),
        voce("respinta", "Quantità respinta", null, null, motivo),
        voce("scaricata", "Quantità scaricata per produzione", null, null, motivo),
        voce("giacenza", "Giacenza residua", null, null, input.motivoGiacenza ?? motivo),
      ],
    };
  }
  const unitaUnica = unita[0] ?? null;
  const precise = righe.filter((riga) => riga.tipoQuantita === "precisa");
  const stimate = righe.filter((riga) => riga.tipoQuantita === "stimata");
  const arrivoMancante = righe.some((riga) => riga.arrivataMancante);
  const senzaLotti = righe.length > 0 && righe.every((riga) => !riga.lottiCollegati);
  const unitaLottoDiversa = righe.some((riga) => riga.unitaLottoDiversa);
  let motivoLotti: string | null = null;
  if (unitaLottoDiversa) motivoLotti = "Unità del lotto diversa. Nessuna conversione.";
  else if (senzaLotti) motivoLotti = "Nessun lotto LM- collegato a queste consegne.";
  const giacenzaOk =
    input.giacenza != null && (unitaUnica == null || input.giacenza.unita === unitaUnica);
  return {
    consegne,
    voci: [
      voce(
        "pianificata_precisa",
        "Quantità pianificata precisa",
        somma(precise.map((riga) => riga.pianificata)),
        unitaUnica,
        null
      ),
      voce(
        "pianificata_stimata",
        "Quantità pianificata stimata",
        somma(stimate.map((riga) => riga.pianificata)),
        unitaUnica,
        null
      ),
      voce(
        "ordinata",
        "Quantità ordinata",
        somma(righe.map((riga) => riga.ordinata)),
        unitaUnica,
        null
      ),
      voce(
        "confermata",
        "Quantità confermata",
        somma(righe.map((riga) => riga.confermata)),
        unitaUnica,
        null
      ),
      voce(
        "arrivata",
        "Quantità arrivata",
        arrivoMancante ? null : somma(righe.map((riga) => riga.arrivata)),
        unitaUnica,
        arrivoMancante ? "Una consegna non ha ancora la quantità arrivata." : null
      ),
      voce(
        "accettata",
        "Quantità accettata",
        motivoLotti ? null : somma(righe.map((riga) => riga.accettata)),
        unitaUnica,
        motivoLotti
      ),
      voce(
        "respinta",
        "Quantità respinta",
        motivoLotti ? null : somma(righe.map((riga) => riga.respinta)),
        unitaUnica,
        motivoLotti
      ),
      voce(
        "scaricata",
        "Quantità scaricata per produzione",
        motivoLotti ? null : somma(righe.map((riga) => riga.scaricata)),
        unitaUnica,
        motivoLotti
      ),
      voce(
        "giacenza",
        "Giacenza residua",
        giacenzaOk ? input.giacenza!.quantita : null,
        giacenzaOk ? input.giacenza!.unita : null,
        giacenzaOk
          ? null
          : (input.motivoGiacenza ??
            "Seleziona una materia: la giacenza è del catalogo e non si converte.")
      ),
    ],
  };
}

export type ConsegnaSalvataResoconto = {
  ordineId: string;
  data: string;
  materiaId: string;
  materia: string;
  unita: string;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  pianificata: number;
  ordinata: number;
  confermata: number;
  arrivata: number | null;
  arrivataMancante: boolean;
  accettata: number | null;
  respinta: number | null;
  scaricata: number | null;
  lottiCollegati: boolean;
  unitaLottoDiversa: boolean;
};

export type ConsegnaAnteprimaResoconto = {
  data: string;
  materiaId: string;
  materia: string;
  unita: string;
  tipoQuantita: TipoQuantitaApprovvigionamento;
  quantita: number;
};

export type GruppoResocontoApprovvigionamento = {
  materiaId: string;
  materia: string;
  unita: string;
  consegneSalvate: number;
  consegneAnteprima: number;
  precisaSalvata: number;
  stimataSalvata: number;
  precisaAnteprima: number;
  stimataAnteprima: number;
  ordinata: number;
  confermata: number;
  arrivata: number | null;
  motivoArrivo: string | null;
  accettata: number | null;
  respinta: number | null;
  scaricata: number | null;
  motivoLotti: string | null;
};

/** L'anteprima non salvata non entra nei filtri che non la riguardano. */
export function anteprimaEsclusaDalFiltro(input: {
  attiva: boolean;
  materiaId: string;
  fornitoreId: string;
  filtroMateria: string;
  filtroFornitore: string;
  filtroStato: string;
  filtroPiano: string;
}): string | null {
  if (!input.attiva) return null;
  if (input.filtroMateria && input.filtroMateria !== input.materiaId) {
    return "L'anteprima non è nel filtro materia. Il resoconto non la include.";
  }
  if (input.filtroFornitore && input.filtroFornitore !== input.fornitoreId) {
    return "L'anteprima non è nel filtro fornitore. Il resoconto non la include.";
  }
  if (input.filtroStato && input.filtroStato !== "bozza") {
    return "L'anteprima è una bozza non salvata e non entra nello stato filtrato.";
  }
  if (input.filtroPiano) {
    return "L'anteprima non appartiene alla pianificazione filtrata. Il resoconto non la include.";
  }
  return null;
}

/**
 * Somma l'anteprima non salvata accanto agli ordini già registrati.
 * Una consegna già salvata, stessa data materia e unità, non viene contata due volte.
 * L'anteprima non diventa quantità ordinata, confermata o di magazzino.
 * Unità diverse restano in gruppi separati.
 */
export function resocontoConAnteprima(input: {
  salvate: readonly ConsegnaSalvataResoconto[];
  anteprima: readonly ConsegnaAnteprimaResoconto[];
}): { consegnePreviste: number; gruppi: GruppoResocontoApprovvigionamento[] } {
  const giaSalvata = new Set(
    input.salvate
      .filter((riga) => riga.data)
      .map((riga) => `${riga.data}|${riga.materiaId}|${riga.unita}`)
  );
  const anteprimaNuova = input.anteprima.filter(
    (consegna) => !giaSalvata.has(`${consegna.data}|${consegna.materiaId}|${consegna.unita}`)
  );
  const chiavi = new Set<string>();
  for (const riga of input.salvate) chiavi.add(`${riga.materiaId}|${riga.unita}`);
  for (const consegna of anteprimaNuova) chiavi.add(`${consegna.materiaId}|${consegna.unita}`);
  const gruppi: GruppoResocontoApprovvigionamento[] = [];
  for (const chiave of chiavi) {
    const salvate = input.salvate.filter((riga) => `${riga.materiaId}|${riga.unita}` === chiave);
    const previste = anteprimaNuova.filter(
      (consegna) => `${consegna.materiaId}|${consegna.unita}` === chiave
    );
    const esempio = salvate[0] ?? previste[0];
    if (!esempio) continue;
    const arrivoMancante = salvate.some((riga) => riga.arrivataMancante);
    const unitaLottoDiversa = salvate.some((riga) => riga.unitaLottoDiversa);
    const senzaLotti = salvate.length > 0 && salvate.every((riga) => !riga.lottiCollegati);
    let motivoLotti: string | null = null;
    if (unitaLottoDiversa) motivoLotti = "Unità del lotto diversa. Nessuna conversione.";
    else if (senzaLotti) motivoLotti = "Nessun lotto LM- collegato a queste consegne.";
    const sommaSalvata = (tipo: TipoQuantitaApprovvigionamento) =>
      salvate
        .filter((riga) => riga.tipoQuantita === tipo)
        .reduce((totale, riga) => totale + riga.pianificata, 0);
    const sommaPrevista = (tipo: TipoQuantitaApprovvigionamento) =>
      previste
        .filter((consegna) => consegna.tipoQuantita === tipo)
        .reduce((totale, consegna) => totale + consegna.quantita, 0);
    gruppi.push({
      materiaId: esempio.materiaId,
      materia: esempio.materia,
      unita: esempio.unita,
      consegneSalvate: new Set(salvate.map((riga) => riga.ordineId)).size,
      consegneAnteprima: previste.length,
      precisaSalvata: sommaSalvata("precisa"),
      stimataSalvata: sommaSalvata("stimata"),
      precisaAnteprima: sommaPrevista("precisa"),
      stimataAnteprima: sommaPrevista("stimata"),
      ordinata: salvate.reduce((totale, riga) => totale + riga.ordinata, 0),
      confermata: salvate.reduce((totale, riga) => totale + riga.confermata, 0),
      arrivata: arrivoMancante
        ? null
        : salvate.reduce((totale, riga) => totale + (riga.arrivata ?? 0), 0),
      motivoArrivo: arrivoMancante ? "Una consegna non ha ancora la quantità arrivata." : null,
      accettata: motivoLotti
        ? null
        : salvate.reduce((totale, riga) => totale + (riga.accettata ?? 0), 0),
      respinta: motivoLotti
        ? null
        : salvate.reduce((totale, riga) => totale + (riga.respinta ?? 0), 0),
      scaricata: motivoLotti
        ? null
        : salvate.reduce((totale, riga) => totale + (riga.scaricata ?? 0), 0),
      motivoLotti,
    });
  }
  gruppi.sort((a, b) => `${a.materia}|${a.unita}`.localeCompare(`${b.materia}|${b.unita}`));
  return {
    consegnePreviste:
      new Set(input.salvate.map((riga) => riga.ordineId)).size + anteprimaNuova.length,
    gruppi,
  };
}
