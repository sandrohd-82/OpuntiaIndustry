import type { StatoAbilitazioneFornitore } from "@/lib/amministrazione/requisiti-fornitore";
import {
  unitaMateriaPrimaValida,
  type UnitaMateriaPrima,
} from "@/lib/amministrazione/materie-prime";

export type StatoOrdineApprovvigionamento = "bozza" | "pubblicato" | "da_ripubblicare";

export type RigaPubblicata = {
  materiaPrimaId: string;
  codice: string;
  nome: string;
  quantita: number;
  unitaMisura: string;
  note: string;
};

export type QuadriApprovvigionamento = {
  documento: "Bozza" | "Pubblicato" | "Revisione da pubblicare";
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
  let notifica: QuadriApprovvigionamento["notifica"] = null;
  if (input.notifica === "non_inviata") notifica = "Notifica da inviare";
  if (input.notifica === "in_invio") notifica = "Notifica in corso";
  if (input.notifica === "inviata") notifica = "Notifica inviata";
  if (input.notifica === "fallita" || input.notifica === "incerta") {
    notifica = "Notifica fallita/incerta";
  }
  let presaVisione: QuadriApprovvigionamento["presaVisione"] = null;
  if (input.stato !== "bozza") {
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
  if (!unitaMateriaPrimaValida(input.unitaCatalogo)) {
    return {
      ok: false,
      motivo: "La materia prima non ha un'unità di misura in catalogo.",
    };
  }
  if (!unitaCoerente(input.unitaCatalogo, input.unitaRichiesta)) {
    return { ok: false, motivo: "L'unità non coincide con il catalogo." };
  }
  return { ok: true };
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
