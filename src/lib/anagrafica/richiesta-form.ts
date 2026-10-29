export type SedeAnagraficaForm = {
  nazione: string;
  provincia: string;
  localita: string;
  citta: string;
  cap: string;
  indirizzo: string;
  telefono: string;
};

export type FonteMagazzino = "" | "legale" | "amministrativa" | "altra";

export type AnagraficaFormPayload = {
  ragioneSociale: string;
  partitaIva: string;
  codiceFiscale: string;
  sdiCode: string;
  pec: string;
  telefono: string;
  email: string;
  respAcquistiNome: string;
  respAcquistiTel: string;
  respAcquistiEmail: string;
  respTecnicoNome: string;
  respTecnicoTel: string;
  respTecnicoEmail: string;
  legaleCognome: string;
  legaleNome: string;
  legaleTel: string;
  legaleEmail: string;
  bancaAppoggio: string;
  bancaFiliale: string;
  bancaBic: string;
  bancaIban: string;
  sedeLegale: SedeAnagraficaForm;
  sedeAmmUgualeLegale: boolean;
  sedeAmministrativa: SedeAnagraficaForm;
  sedeMagFonte: FonteMagazzino;
  sedeMagazzino: SedeAnagraficaForm;
  titolareCognome: string;
  titolareNome: string;
  titolareCf: string;
  titolareDocumentoTipo: string;
  titolareDocumentoNumero: string;
  consensoTrattamento: boolean;
  campiModificati: CampoAnagrafica[];
};

export const CAMPI_ANAGRAFICA = [
  "ragioneSociale",
  "partitaIva",
  "codiceFiscale",
  "sdiCode",
  "pec",
  "telefono",
  "email",
  "respAcquistiNome",
  "respAcquistiTel",
  "respAcquistiEmail",
  "respTecnicoNome",
  "respTecnicoTel",
  "respTecnicoEmail",
  "legaleCognome",
  "legaleNome",
  "legaleTel",
  "legaleEmail",
  "bancaAppoggio",
  "bancaFiliale",
  "bancaBic",
  "bancaIban",
  "sedeLegale",
  "sedeAmmUgualeLegale",
  "sedeAmministrativa",
  "sedeMagFonte",
  "sedeMagazzino",
  "consensoTrattamento",
] as const;

export type CampoAnagrafica = (typeof CAMPI_ANAGRAFICA)[number];

export const DOCUMENTI_TITOLARE = [
  "Carta d'identità",
  "Passaporto",
  "Patente",
] as const;

export function sedeVuota(): SedeAnagraficaForm {
  return {
    nazione: "Italia",
    provincia: "",
    localita: "",
    citta: "",
    cap: "",
    indirizzo: "",
    telefono: "",
  };
}

export function formVuoto(): AnagraficaFormPayload {
  return {
    ragioneSociale: "",
    partitaIva: "",
    codiceFiscale: "",
    sdiCode: "",
    pec: "",
    telefono: "",
    email: "",
    respAcquistiNome: "",
    respAcquistiTel: "",
    respAcquistiEmail: "",
    respTecnicoNome: "",
    respTecnicoTel: "",
    respTecnicoEmail: "",
    legaleCognome: "",
    legaleNome: "",
    legaleTel: "",
    legaleEmail: "",
    bancaAppoggio: "",
    bancaFiliale: "",
    bancaBic: "",
    bancaIban: "",
    sedeLegale: sedeVuota(),
    sedeAmmUgualeLegale: false,
    sedeAmministrativa: sedeVuota(),
    sedeMagFonte: "",
    sedeMagazzino: sedeVuota(),
    titolareCognome: "",
    titolareNome: "",
    titolareCf: "",
    titolareDocumentoTipo: "",
    titolareDocumentoNumero: "",
    consensoTrattamento: false,
    campiModificati: [],
  };
}

function testo(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function sedeDa(value: unknown): SedeAnagraficaForm {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    nazione: testo(row.nazione, 80) || "Italia",
    provincia: testo(row.provincia, 80),
    localita: testo(row.localita, 120),
    citta: testo(row.citta, 120),
    cap: testo(row.cap, 16),
    indirizzo: testo(row.indirizzo, 200),
    telefono: testo(row.telefono, 40),
  };
}

export function normalizzaForm(value: unknown): AnagraficaFormPayload {
  const base = formVuoto();
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const fonte = testo(row.sedeMagFonte, 20);
  return {
    ...base,
    ragioneSociale: testo(row.ragioneSociale, 200),
    partitaIva: testo(row.partitaIva, 28).toUpperCase(),
    codiceFiscale: testo(row.codiceFiscale, 16).toUpperCase(),
    sdiCode: testo(row.sdiCode, 7).toUpperCase(),
    pec: testo(row.pec, 160),
    telefono: testo(row.telefono, 40),
    email: testo(row.email, 160),
    respAcquistiNome: testo(row.respAcquistiNome, 160),
    respAcquistiTel: testo(row.respAcquistiTel, 40),
    respAcquistiEmail: testo(row.respAcquistiEmail, 160),
    respTecnicoNome: testo(row.respTecnicoNome, 160),
    respTecnicoTel: testo(row.respTecnicoTel, 40),
    respTecnicoEmail: testo(row.respTecnicoEmail, 160),
    legaleCognome: testo(row.legaleCognome, 80),
    legaleNome: testo(row.legaleNome, 80),
    legaleTel: testo(row.legaleTel, 40),
    legaleEmail: testo(row.legaleEmail, 160),
    bancaAppoggio: testo(row.bancaAppoggio, 160),
    bancaFiliale: testo(row.bancaFiliale, 160),
    bancaBic: testo(row.bancaBic, 11).replace(/\s+/g, "").toUpperCase(),
    bancaIban: testo(row.bancaIban, 42).replace(/\s+/g, "").toUpperCase(),
    sedeLegale: sedeDa(row.sedeLegale),
    sedeAmmUgualeLegale: row.sedeAmmUgualeLegale === true,
    sedeAmministrativa: sedeDa(row.sedeAmministrativa),
    sedeMagFonte:
      fonte === "legale" || fonte === "amministrativa" || fonte === "altra"
        ? fonte
        : "",
    sedeMagazzino: sedeDa(row.sedeMagazzino),
    titolareCognome: testo(row.titolareCognome, 80),
    titolareNome: testo(row.titolareNome, 80),
    titolareCf: testo(row.titolareCf, 16).toUpperCase(),
    titolareDocumentoTipo: testo(row.titolareDocumentoTipo, 40),
    titolareDocumentoNumero: testo(row.titolareDocumentoNumero, 40),
    consensoTrattamento: row.consensoTrattamento === true,
    campiModificati: campiModificatiDa(row.campiModificati),
  };
}

function campiModificatiDa(value: unknown): CampoAnagrafica[] {
  if (!Array.isArray(value)) return [];
  const ammessi = new Set<string>(CAMPI_ANAGRAFICA);
  const visti = new Set<CampoAnagrafica>();
  for (const voce of value) {
    const campo = String(voce);
    if (ammessi.has(campo)) visti.add(campo as CampoAnagrafica);
  }
  return [...visti];
}

function emailOk(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function ibanOk(value: string): boolean {
  const iban = value.replace(/\s+/g, "").toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban);
}

export type StatoRichiestaPubblica =
  | "compilazione"
  | "pdf_pronto"
  | "firmata"
  | "COMPLETED"
  | "scaduta"
  | "annullata";

export type PassoAnagrafica = "anagrafica" | "privacy" | "condizioni" | "completato";

export type VistaPubblica = {
  stato: StatoRichiestaPubblica;
  passo: PassoAnagrafica;
  form: AnagraficaFormPayload;
  scadeAt: string;
  ragioneSociale: string;
  faseTest: boolean;
  emailInvio: string;
  emailFirma: string;
  firmatarioSuggerito: string;
  copie: {
    anagrafica: boolean;
    privacy: boolean;
    condizioni: boolean;
  };
};

export function erroriPdf(form: AnagraficaFormPayload): string[] {
  const errori: string[] = [];
  if (!form.ragioneSociale) errori.push("Manca la ragione sociale.");
  const piva = form.partitaIva.replace(/^IT/, "");
  const cf = form.codiceFiscale;
  if (!piva && !cf) {
    errori.push("Serve la partita IVA oppure il codice fiscale.");
  }
  if (piva && !/^\d{11}$/.test(piva) && !/^[A-Z]{2}[A-Z0-9]{5,13}$/.test(form.partitaIva)) {
    errori.push("La partita IVA non è nel formato atteso.");
  }
  if (cf && !/^(\d{11}|[A-Z0-9]{16})$/.test(cf)) {
    errori.push("Il codice fiscale deve essere di 11 o 16 caratteri.");
  }
  const sdi = form.sdiCode;
  if (sdi && !/^[A-Z0-9]{7}$/.test(sdi)) {
    errori.push("Il codice destinatario deve essere di 7 caratteri.");
  }
  if (!sdi && !form.pec) {
    errori.push("Serve il codice destinatario oppure la PEC.");
  }
  if (sdi === "0000000" && !form.pec) {
    errori.push("Con codice destinatario 0000000 la PEC è obbligatoria.");
  }
  if (form.pec && !emailOk(form.pec)) errori.push("La PEC non è un indirizzo valido.");
  if (!form.telefono || form.telefono.replace(/\D/g, "").length < 6) {
    errori.push("Manca il numero di telefono.");
  }
  if (!form.email || !emailOk(form.email)) errori.push("Manca l'e-mail.");
  if (!form.legaleCognome || !form.legaleNome) {
    errori.push("Mancano cognome e nome del legale rappresentante.");
  }
  if (!form.legaleTel || form.legaleTel.replace(/\D/g, "").length < 6) {
    errori.push("Manca il telefono del legale rappresentante.");
  }
  if (!form.legaleEmail || !emailOk(form.legaleEmail)) {
    errori.push("Manca l'e-mail del legale rappresentante.");
  }
  if (!form.bancaAppoggio) errori.push("Manca la banca di appoggio.");
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(form.bancaBic)) {
    errori.push("Il BIC non è valido.");
  }
  if (!ibanOk(form.bancaIban)) errori.push("L'IBAN non è valido.");
  const legale = form.sedeLegale;
  if (!legale.indirizzo || !legale.nazione || !legale.cap || !legale.citta) {
    errori.push("La sede legale deve avere via, nazione, CAP e città.");
  }
  if (form.respAcquistiEmail && !emailOk(form.respAcquistiEmail)) {
    errori.push("L'e-mail del responsabile acquisti non è valida.");
  }
  if (form.respTecnicoEmail && !emailOk(form.respTecnicoEmail)) {
    errori.push("L'e-mail del responsabile tecnico non è valida.");
  }
  if (!form.consensoTrattamento) {
    errori.push("Serve l'accettazione dei termini e del trattamento dati.");
  }
  return errori;
}

export const MESSAGGIO_DATI_OBBLIGATORI =
  "Completa i dati obbligatori prima di chiedere il codice.";

/** Campi che bloccano la richiesta del codice, consenso escluso. */
export function campiDaCompletare(form: AnagraficaFormPayload): string[] {
  const mancanti: string[] = [];
  if (!form.ragioneSociale) mancanti.push("ragioneSociale");
  const piva = form.partitaIva.replace(/^IT/, "");
  const cf = form.codiceFiscale;
  if (!piva && !cf) {
    mancanti.push("partitaIva", "codiceFiscale");
  }
  if (piva && !/^\d{11}$/.test(piva) && !/^[A-Z]{2}[A-Z0-9]{5,13}$/.test(form.partitaIva)) {
    mancanti.push("partitaIva");
  }
  if (cf && !/^(\d{11}|[A-Z0-9]{16})$/.test(cf)) {
    mancanti.push("codiceFiscale");
  }
  const sdi = form.sdiCode;
  if (sdi && !/^[A-Z0-9]{7}$/.test(sdi)) mancanti.push("sdiCode");
  if (!sdi && !form.pec) mancanti.push("sdiCode", "pec");
  if (sdi === "0000000" && !form.pec) mancanti.push("pec");
  if (form.pec && !emailOk(form.pec)) mancanti.push("pec");
  if (!form.telefono || form.telefono.replace(/\D/g, "").length < 6) {
    mancanti.push("telefono");
  }
  if (!form.email || !emailOk(form.email)) mancanti.push("email");
  if (!form.legaleCognome) mancanti.push("legaleCognome");
  if (!form.legaleNome) mancanti.push("legaleNome");
  if (!form.legaleTel || form.legaleTel.replace(/\D/g, "").length < 6) {
    mancanti.push("legaleTel");
  }
  if (!form.legaleEmail || !emailOk(form.legaleEmail)) mancanti.push("legaleEmail");
  if (!form.bancaAppoggio) mancanti.push("bancaAppoggio");
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(form.bancaBic)) {
    mancanti.push("bancaBic");
  }
  if (!ibanOk(form.bancaIban)) mancanti.push("bancaIban");
  const legale = form.sedeLegale;
  if (!legale.indirizzo) mancanti.push("sedeLegale.indirizzo");
  if (!legale.nazione) mancanti.push("sedeLegale.nazione");
  if (!legale.cap) mancanti.push("sedeLegale.cap");
  if (!legale.citta) mancanti.push("sedeLegale.citta");
  if (form.respAcquistiEmail && !emailOk(form.respAcquistiEmail)) {
    mancanti.push("respAcquistiEmail");
  }
  if (form.respTecnicoEmail && !emailOk(form.respTecnicoEmail)) {
    mancanti.push("respTecnicoEmail");
  }
  return mancanti;
}

export function emailAnagraficaValida(value: string): boolean {
  return emailOk(value.trim());
}

export function emailRegistrateAnagrafica(invio: string, form: AnagraficaFormPayload): string[] {
  const viste = new Map<string, string>();
  for (const raw of [
    invio,
    form.email,
    form.pec,
    form.legaleEmail,
    form.respAcquistiEmail,
    form.respTecnicoEmail,
  ]) {
    const testoMail = raw.trim();
    if (!emailOk(testoMail)) continue;
    const chiave = testoMail.toLowerCase();
    if (!viste.has(chiave)) viste.set(chiave, testoMail);
  }
  return [...viste.values()];
}
