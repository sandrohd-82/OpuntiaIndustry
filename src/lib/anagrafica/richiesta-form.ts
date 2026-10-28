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
  bancaAppoggio: string;
  bancaFiliale: string;
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
  "bancaAppoggio",
  "bancaFiliale",
  "bancaIban",
  "sedeLegale",
  "sedeAmmUgualeLegale",
  "sedeAmministrativa",
  "sedeMagFonte",
  "sedeMagazzino",
  "titolareCognome",
  "titolareNome",
  "titolareCf",
  "titolareDocumentoTipo",
  "titolareDocumentoNumero",
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
    bancaAppoggio: "",
    bancaFiliale: "",
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
    bancaAppoggio: testo(row.bancaAppoggio, 160),
    bancaFiliale: testo(row.bancaFiliale, 160),
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
  };
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
  | "scaduta"
  | "annullata";

export type VistaPubblica = {
  stato: StatoRichiestaPubblica;
  form: AnagraficaFormPayload;
  scadeAt: string;
  ragioneSociale: string;
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
  if (!form.email || !emailOk(form.email)) errori.push("Manca l'e-mail.");
  if (!form.bancaAppoggio) errori.push("Manca la banca di appoggio.");
  if (!form.bancaFiliale) errori.push("Manca la filiale.");
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
  if (!form.titolareCognome || !form.titolareNome) {
    errori.push("Mancano cognome e nome del titolare effettivo.");
  }
  if (!/^(\d{11}|[A-Z0-9]{16})$/.test(form.titolareCf)) {
    errori.push("Il codice fiscale del titolare effettivo non è valido.");
  }
  if (!form.titolareDocumentoTipo || !form.titolareDocumentoNumero) {
    errori.push("Mancano tipo e numero del documento del titolare effettivo.");
  }
  return errori;
}
