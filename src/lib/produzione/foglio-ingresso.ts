import type { SoggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso";
import { eUtenteInternoHaccp } from "@/lib/produzione/fornitore-accesso";
import {
  processoControlloBySlug,
  vociProcesso,
  type VoceControllo,
} from "@/lib/produzione/controllo-processi";

export type StatoFoglioIngresso =
  | "aperto"
  | "in_compilazione"
  | "in_attesa"
  | "partito"
  | "arrivato"
  | "chiuso";

export type VistaFoglio = "produzione" | "fornitore";

export type ValoreRispostaFoglio =
  | { tipo: "controllo"; esito: "conforme" | "non_conforme"; nota: string }
  | { tipo: "dato_testo"; testo: string }
  | { tipo: "dato_numero"; valore: number; unita: "n" | "kg" }
  | { tipo: "segnalazione"; presente: boolean; nota: string }
  | { tipo: "contatto"; esito: "carico_possibile" | "in_attesa"; nota: string }
  | { tipo: "lotto"; codice: string }
  | { tipo: "foto"; nome: string; path: string }
  | { tipo: "archivio"; path: string }
  | { tipo: "ddt"; numero: string; data: string; quantita: number }
  | { tipo: "firma"; nome: string; telefono: string; evidenza: "sessione_autenticata" }
  | { tipo: "orario"; iso: string }
  | { tipo: "arrivo"; nota: string };

export const MOTIVO_OTP_SMS =
  "La firma è registrata dall'utente autenticato. L'invio reale dell'SMS OTP non è attivo.";

const CODICI_COMPILABILI = [
  "mezzo",
  "1a",
  "1b",
  "1c",
  "1d",
  "1e",
  "2a",
  "2b",
  "2c",
  "2d",
  "2e",
  "2f",
  "2g",
  "2h",
  "2i",
  "2l",
  "2m",
  "n1",
  "n2",
  "p",
  "q",
] as const;

export const VOCI_PARTENZA = [
  "mezzo",
  "1a",
  "1b",
  "1c",
  "1d",
  "1e",
  "2a",
  "2b",
  "2c",
  "2d",
  "2e",
  "2f",
  "2g",
  "2h",
  "2i",
  "2l",
  "2m",
  "n1",
  "n2",
  "p",
] as const;

const TRANSIZIONI_SOSPESE: ReadonlyArray<
  readonly [StatoFoglioIngresso, StatoFoglioIngresso]
> = [
  ["aperto", "in_compilazione"],
  ["aperto", "in_attesa"],
  ["in_compilazione", "in_attesa"],
  ["in_attesa", "in_compilazione"],
  ["in_attesa", "aperto"],
];

export function catalogoMaterialeIngresso(): VoceControllo[] {
  const processo = processoControlloBySlug("materiale-in-ingresso");
  return processo ? vociProcesso(processo, false) : [];
}

export function voceCompilabile(codice: string): boolean {
  return (CODICI_COMPILABILI as readonly string[]).includes(codice);
}

export function motivoVoceNonAttiva(codice: string): string | null {
  if (voceCompilabile(codice)) return null;
  if (codice === "doc") {
    return "La presa visione è quella delle linee guida distribuite, non una firma duplicata sul carico.";
  }
  return "Voce non presente nel catalogo.";
}

export function fornitoreAperturaFoglio(
  soggetto: SoggettoAccessoFornitore,
  fornitoreRichiestoId: string | null
): { ok: true; fornitoreId: string } | { ok: false; motivo: string } {
  if (eUtenteInternoHaccp(soggetto)) {
    if (!fornitoreRichiestoId) {
      return { ok: false, motivo: "Scegli il fornitore del carico." };
    }
    return { ok: true, fornitoreId: fornitoreRichiestoId };
  }
  if (!soggetto.aree.includes("area-fornitori") || !soggetto.fornitoreCollegatoId) {
    return { ok: false, motivo: "Utente non collegato a un fornitore." };
  }
  if (
    fornitoreRichiestoId != null &&
    fornitoreRichiestoId !== soggetto.fornitoreCollegatoId
  ) {
    return { ok: false, motivo: "Non puoi aprire un foglio per un altro fornitore." };
  }
  return { ok: true, fornitoreId: soggetto.fornitoreCollegatoId };
}

export function puoLeggereFoglio(
  soggetto: SoggettoAccessoFornitore,
  fornitoreFoglioId: string
): boolean {
  if (eUtenteInternoHaccp(soggetto)) return true;
  return (
    soggetto.aree.includes("area-fornitori") &&
    soggetto.fornitoreCollegatoId === fornitoreFoglioId
  );
}

export function transizioneFoglio(
  da: StatoFoglioIngresso,
  a: StatoFoglioIngresso,
  attore: "interno" | "fornitore"
): { ok: true } | { ok: false; motivo: string } {
  if (da === "in_compilazione" && a === "partito") {
    if (attore !== "fornitore") {
      return { ok: false, motivo: "La partenza la registra il fornitore." };
    }
    return { ok: true };
  }
  if (da === "partito" && a === "arrivato") {
    if (attore !== "interno") {
      return { ok: false, motivo: "L'arrivo lo registra il personale interno." };
    }
    return { ok: true };
  }
  if (da === "arrivato" && a === "chiuso") {
    if (attore !== "interno") {
      return { ok: false, motivo: "La chiusura spetta al personale interno." };
    }
    return { ok: true };
  }
  if (da === "partito" || da === "arrivato" || da === "chiuso" || a === "partito" || a === "arrivato" || a === "chiuso") {
    return { ok: false, motivo: "Transizione di stato non consentita." };
  }
  const ammessa = TRANSIZIONI_SOSPESE.some(([origine, destinazione]) => origine === da && destinazione === a);
  if (!ammessa) return { ok: false, motivo: "Transizione di stato non consentita." };
  return { ok: true };
}

export function vociMancantiPartenza(risposteCodici: readonly string[]): string[] {
  const presenti = new Set(risposteCodici);
  return VOCI_PARTENZA.filter((codice) => !presenti.has(codice));
}

export function statoDopoRipresa(haRisposte: boolean): "aperto" | "in_compilazione" {
  return haRisposte ? "in_compilazione" : "aperto";
}

export function versioniCheBloccanoCompilazione(
  applicabili: readonly string[],
  confermateDaUtente: readonly string[]
): string[] {
  const confermate = new Set(confermateDaUtente);
  return applicabili.filter((id) => !confermate.has(id));
}

export function puoRegistrareRisposta(input: {
  codice: string;
  attore: "interno" | "fornitore";
  stato: StatoFoglioIngresso;
  esisteRisposta: boolean;
  motivazione: string;
  presaVisioneCompleta: boolean;
}): { ok: true } | { ok: false; motivo: string } {
  if (input.codice === "q" && input.attore === "interno" && input.stato === "partito") {
    if (input.esisteRisposta && input.motivazione.trim().length < 3) {
      return { ok: false, motivo: "La correzione richiede una motivazione." };
    }
    return { ok: true };
  }
  if (input.stato !== "aperto" && input.stato !== "in_compilazione") {
    return { ok: false, motivo: "Il foglio non è in compilazione." };
  }
  if (!input.presaVisioneCompleta) {
    return { ok: false, motivo: "Prima conferma la presa visione della versione applicabile." };
  }
  const blocco = motivoVoceNonAttiva(input.codice);
  if (blocco) return { ok: false, motivo: blocco };
  if (!voceCompilabile(input.codice)) {
    return { ok: false, motivo: "Questa voce non è compilabile." };
  }
  if (input.attore === "fornitore" && input.codice === "q") {
    return { ok: false, motivo: "La voce q non è del fornitore." };
  }
  if (input.attore === "interno" && input.codice !== "q" && !input.esisteRisposta) {
    return {
      ok: false,
      motivo: "Il personale interno corregge una risposta già registrata dal fornitore.",
    };
  }
  if (input.attore === "interno" && input.codice === "q") {
    return { ok: false, motivo: "L'arrivo si registra quando il carico è partito." };
  }
  if (input.esisteRisposta && input.motivazione.trim().length < 3) {
    return { ok: false, motivo: "La correzione richiede una motivazione." };
  }
  return { ok: true };
}

export function vociIncomplete(risposteCodici: readonly string[]): string[] {
  const presenti = new Set(risposteCodici);
  return CODICI_COMPILABILI.filter((codice) => codice !== "q" && !presenti.has(codice));
}

export function normalizzaValoreRisposta(
  codice: string,
  raw: unknown
): { ok: true; valore: ValoreRispostaFoglio } | { ok: false; motivo: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, motivo: "Valore non valido." };
  }
  const record = raw as Record<string, unknown>;
  if (["mezzo", "1e", "2b", "2g", "2h"].includes(codice)) {
    const nota = typeof record.nota === "string" ? record.nota.trim() : "";
    if (record.esito !== "conforme" && record.esito !== "non_conforme") {
      return { ok: false, motivo: "Indica l'esito del controllo." };
    }
    if (nota.length > 2000) return { ok: false, motivo: "Nota troppo lunga." };
    return { ok: true, valore: { tipo: "controllo", esito: record.esito, nota } };
  }
  if (codice === "2a" || codice === "2c") {
    const testo = typeof record.testo === "string" ? record.testo.trim() : "";
    if (testo.length < 1 || testo.length > 500) {
      return { ok: false, motivo: "Inserisci il dato richiesto." };
    }
    return { ok: true, valore: { tipo: "dato_testo", testo } };
  }
  if (codice === "2d" || codice === "2i" || codice === "2l") {
    const valore = typeof record.valore === "number" ? record.valore : Number(record.valore);
    if (!Number.isFinite(valore) || valore <= 0 || valore > 1000000) {
      return { ok: false, motivo: "Inserisci un numero valido." };
    }
    if ((codice === "2d" || codice === "2i") && !Number.isInteger(valore)) {
      return { ok: false, motivo: "Il numero di contenitori deve essere intero." };
    }
    return {
      ok: true,
      valore: { tipo: "dato_numero", valore, unita: codice === "2l" ? "kg" : "n" },
    };
  }
  if (codice === "2e") {
    const codiceLotto = typeof record.codice === "string" ? record.codice.trim() : "";
    if (codiceLotto.length < 1 || codiceLotto.length > 40) {
      return { ok: false, motivo: "Inserisci il codice lotto dichiarato." };
    }
    return { ok: true, valore: { tipo: "lotto", codice: codiceLotto } };
  }
  if (codice === "1c") {
    const presente = record.presente === true || record.presente === "true";
    const assente = record.presente === false || record.presente === "false";
    const nota = typeof record.nota === "string" ? record.nota.trim() : "";
    if (!presente && !assente) return { ok: false, motivo: "Indica se c'è materiale da rimuovere." };
    if (presente && nota.length < 3) {
      return { ok: false, motivo: "Descrivi il materiale da rimuovere." };
    }
    return { ok: true, valore: { tipo: "segnalazione", presente, nota } };
  }
  if (codice === "1d") {
    const nota = typeof record.nota === "string" ? record.nota.trim() : "";
    if (record.esito !== "carico_possibile" && record.esito !== "in_attesa") {
      return { ok: false, motivo: "Indica l'esito del contatto." };
    }
    if (nota.length < 3) return { ok: false, motivo: "Annota l'esito del contatto." };
    return { ok: true, valore: { tipo: "contatto", esito: record.esito, nota } };
  }
  if (codice === "1a" || codice === "2f") {
    const nome = typeof record.nome === "string" ? record.nome.trim() : "";
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (nome.length < 1 || path.length < 8) {
      return { ok: false, motivo: "Carica una fotografia." };
    }
    return { ok: true, valore: { tipo: "foto", nome, path } };
  }
  if (codice === "1b") {
    const path = typeof record.path === "string" ? record.path.trim() : "";
    if (path.length < 8) return { ok: false, motivo: "Conferma la foto già archiviata." };
    return { ok: true, valore: { tipo: "archivio", path } };
  }
  if (codice === "2m") {
    const numero = typeof record.numero === "string" ? record.numero.trim() : "";
    const data = typeof record.data === "string" ? record.data.trim() : "";
    const quantita = typeof record.quantita === "number" ? record.quantita : Number(record.quantita);
    if (numero.length < 1 || numero.length > 40) {
      return { ok: false, motivo: "Inserisci il numero del DDT." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return { ok: false, motivo: "Inserisci la data del DDT." };
    }
    if (!Number.isFinite(quantita) || quantita <= 0) {
      return { ok: false, motivo: "Inserisci la quantità dichiarata sul DDT." };
    }
    return { ok: true, valore: { tipo: "ddt", numero, data, quantita } };
  }
  if (codice === "n1" || codice === "n2") {
    const nome = typeof record.nome === "string" ? record.nome.trim() : "";
    const telefono = typeof record.telefono === "string" ? record.telefono.trim() : "";
    if (nome.length < 3) return { ok: false, motivo: "Inserisci nome e cognome." };
    if (codice === "n2" && telefono.length < 6) {
      return { ok: false, motivo: "Inserisci il telefono del trasportatore." };
    }
    return {
      ok: true,
      valore: { tipo: "firma", nome, telefono, evidenza: "sessione_autenticata" },
    };
  }
  if (codice === "p") {
    const iso = typeof record.iso === "string" ? record.iso.trim() : "";
    if (Number.isNaN(new Date(iso).getTime())) {
      return { ok: false, motivo: "Inserisci l'ora di partenza." };
    }
    return { ok: true, valore: { tipo: "orario", iso } };
  }
  if (codice === "q") {
    const nota = typeof record.nota === "string" ? record.nota.trim() : "";
    if (nota.length < 3) return { ok: false, motivo: "Annota l'arrivo." };
    return { ok: true, valore: { tipo: "arrivo", nota } };
  }
  return { ok: false, motivo: motivoVoceNonAttiva(codice) ?? "Questa voce non è compilabile." };
}
