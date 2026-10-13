import type { SedeFornitore } from "@/lib/amministrazione/fornitori";

export type CampoSede = "indirizzo" | "localita" | "citta" | "provincia" | "cap";

export type CampoFormato = {
  campo: CampoSede;
  etichetta: string;
  placeholder: string;
  obbligatorio: boolean;
};

const VIA: CampoFormato = {
  campo: "indirizzo",
  etichetta: "Indirizzo (via e numero)",
  placeholder: "Via e numero",
  obbligatorio: true,
};
const CAP: CampoFormato = {
  campo: "cap",
  etichetta: "Codice postale",
  placeholder: "Codice postale",
  obbligatorio: true,
};
const CITTA: CampoFormato = {
  campo: "citta",
  etichetta: "Città",
  placeholder: "Città",
  obbligatorio: true,
};

function area(
  etichetta: string,
  placeholder: string,
  obbligatorio: boolean
): CampoFormato {
  return { campo: "provincia", etichetta, placeholder, obbligatorio };
}

function luogo(
  etichetta: string,
  placeholder: string,
  obbligatorio: boolean
): CampoFormato {
  return { campo: "localita", etichetta, placeholder, obbligatorio };
}

/** Campi oltre l’Italia. La chiave è il nome italiano usato in anagrafica, oppure l’ISO2. */
const FORMATI: Record<string, CampoFormato[]> = {
  DE: [VIA, CAP, CITTA, area("Land", "Land, se serve", false)],
  AT: [VIA, CAP, CITTA, area("Land", "Land, se serve", false)],
  CH: [VIA, CAP, CITTA, area("Cantone", "Cantone, se serve", false)],
  FR: [VIA, CAP, CITTA],
  MC: [VIA, CAP, CITTA],
  BE: [VIA, CAP, CITTA],
  LU: [VIA, CAP, CITTA],
  NL: [VIA, CAP, CITTA],
  DK: [VIA, CAP, CITTA],
  SE: [VIA, CAP, CITTA],
  NO: [VIA, CAP, CITTA],
  FI: [VIA, CAP, CITTA],
  IS: [VIA, CAP, CITTA],
  PT: [VIA, CAP, CITTA],
  PL: [VIA, CAP, CITTA],
  CZ: [VIA, CAP, CITTA],
  SK: [VIA, CAP, CITTA],
  HU: [VIA, CAP, CITTA],
  SI: [VIA, CAP, CITTA],
  HR: [VIA, CAP, CITTA],
  RO: [VIA, CAP, CITTA],
  BG: [VIA, CAP, CITTA],
  GR: [VIA, CAP, CITTA],
  EE: [VIA, CAP, CITTA],
  LV: [VIA, CAP, CITTA],
  LT: [VIA, CAP, CITTA],
  MT: [VIA, CAP, CITTA],
  CY: [VIA, CAP, CITTA],
  SM: [VIA, CAP, CITTA],
  VA: [VIA, CAP, CITTA],
  LI: [VIA, CAP, CITTA],
  AD: [VIA, CAP, CITTA],
  ES: [VIA, CAP, CITTA, area("Provincia", "Provincia", true)],
  GB: [VIA, CITTA, area("Contea", "Contea, se serve", false), CAP],
  IE: [VIA, CITTA, area("Contea", "Contea, se serve", false), { ...CAP, obbligatorio: false, etichetta: "Eircode", placeholder: "Eircode, se c’è" }],
  US: [VIA, CITTA, area("Stato", "Stato", true), { ...CAP, etichetta: "ZIP", placeholder: "ZIP" }],
  CA: [VIA, CITTA, area("Provincia", "Provincia", true), CAP],
  AU: [VIA, { ...CITTA, etichetta: "Città / sobborgo", placeholder: "Città o sobborgo" }, area("Stato", "Stato", true), CAP],
  NZ: [VIA, CITTA, CAP],
  MX: [VIA, luogo("Colonia", "Colonia", false), CITTA, area("Stato", "Stato", true), CAP],
  BR: [VIA, luogo("Quartiere", "Quartiere", false), CITTA, area("Stato", "Stato", true), { ...CAP, etichetta: "CEP", placeholder: "CEP" }],
  AR: [VIA, CITTA, area("Provincia", "Provincia", true), CAP],
  CL: [VIA, luogo("Comune", "Comune", false), CITTA, area("Regione", "Regione", false), CAP],
  JP: [CAP, area("Prefettura", "Prefettura", true), CITTA, luogo("Distretto", "Distretto", false), VIA],
  CN: [area("Provincia", "Provincia", true), CITTA, luogo("Distretto", "Distretto", false), VIA, CAP],
  KR: [area("Provincia", "Provincia", false), CITTA, luogo("Distretto", "Distretto", false), VIA, CAP],
  TW: [CITTA, luogo("Distretto", "Distretto", false), VIA, CAP],
  IN: [VIA, luogo("Località", "Località", false), CITTA, area("Stato", "Stato", true), { ...CAP, etichetta: "PIN", placeholder: "PIN" }],
  ZA: [VIA, luogo("Sobborgo", "Sobborgo", false), CITTA, area("Provincia", "Provincia", false), CAP],
  AE: [VIA, CITTA, area("Emirato", "Emirato", true)],
  HK: [VIA, luogo("Distretto", "Distretto", true)],
  SG: [VIA, CAP],
  RU: [VIA, CITTA, area("Regione", "Regione", false), CAP],
  UA: [VIA, CITTA, area("Oblast", "Oblast", false), CAP],
  TR: [VIA, luogo("Mahalle", "Quartiere", false), CITTA, area("Provincia", "Provincia", true), CAP],
};

const NOME_ISO: Record<string, string> = {
  italia: "IT",
  italy: "IT",
  it: "IT",
  germania: "DE",
  germany: "DE",
  de: "DE",
  austria: "AT",
  at: "AT",
  svizzera: "CH",
  switzerland: "CH",
  ch: "CH",
  francia: "FR",
  france: "FR",
  fr: "FR",
  monaco: "MC",
  belgio: "BE",
  belgium: "BE",
  be: "BE",
  lussemburgo: "LU",
  lu: "LU",
  "paesi bassi": "NL",
  olanda: "NL",
  netherlands: "NL",
  nl: "NL",
  danimarca: "DK",
  dk: "DK",
  svezia: "SE",
  se: "SE",
  norvegia: "NO",
  no: "NO",
  finlandia: "FI",
  fi: "FI",
  islanda: "IS",
  portogallo: "PT",
  portugal: "PT",
  pt: "PT",
  polonia: "PL",
  poland: "PL",
  pl: "PL",
  cechia: "CZ",
  "repubblica ceca": "CZ",
  cz: "CZ",
  slovacchia: "SK",
  sk: "SK",
  ungheria: "HU",
  hu: "HU",
  slovenia: "SI",
  si: "SI",
  croazia: "HR",
  hr: "HR",
  romania: "RO",
  ro: "RO",
  bulgaria: "BG",
  bg: "BG",
  grecia: "GR",
  gr: "GR",
  estonia: "EE",
  ee: "EE",
  lettonia: "LV",
  lv: "LV",
  lituania: "LT",
  lt: "LT",
  malta: "MT",
  mt: "MT",
  cipro: "CY",
  cy: "CY",
  "san marino": "SM",
  sm: "SM",
  "città del vaticano": "VA",
  vaticano: "VA",
  va: "VA",
  liechtenstein: "LI",
  li: "LI",
  andorra: "AD",
  ad: "AD",
  spagna: "ES",
  spain: "ES",
  es: "ES",
  "regno unito": "GB",
  "gran bretagna": "GB",
  inghilterra: "GB",
  uk: "GB",
  gb: "GB",
  irlanda: "IE",
  ireland: "IE",
  ie: "IE",
  "stati uniti": "US",
  "stati uniti d'america": "US",
  usa: "US",
  us: "US",
  canada: "CA",
  ca: "CA",
  australia: "AU",
  au: "AU",
  "nuova zelanda": "NZ",
  nz: "NZ",
  messico: "MX",
  mx: "MX",
  brasile: "BR",
  brazil: "BR",
  br: "BR",
  argentina: "AR",
  ar: "AR",
  cile: "CL",
  cl: "CL",
  giappone: "JP",
  japan: "JP",
  jp: "JP",
  cina: "CN",
  china: "CN",
  cn: "CN",
  "corea del sud": "KR",
  corea: "KR",
  kr: "KR",
  taiwan: "TW",
  tw: "TW",
  india: "IN",
  in: "IN",
  sudafrica: "ZA",
  za: "ZA",
  "emirati arabi uniti": "AE",
  ae: "AE",
  "hong kong": "HK",
  hk: "HK",
  singapore: "SG",
  sg: "SG",
  russia: "RU",
  ru: "RU",
  ucraina: "UA",
  ua: "UA",
  turchia: "TR",
  turkey: "TR",
  tr: "TR",
};

const STANDARD: CampoFormato[] = [
  VIA,
  luogo("Località / distretto", "Se il Paese lo usa", false),
  CITTA,
  area("Provincia / stato / regione", "Se il Paese lo usa", false),
  CAP,
];

export function iso2DaNazione(nazione: string): string {
  const chiave = nazione.trim().toLowerCase();
  return NOME_ISO[chiave] ?? "";
}

export function isNazioneItalia(nazione: string): boolean {
  const nome = nazione.trim().toLowerCase();
  return !nome || nome === "italia" || nome === "italy" || nome === "it";
}

export function campiIndirizzo(nazione: string): CampoFormato[] {
  if (isNazioneItalia(nazione)) return [];
  const iso = iso2DaNazione(nazione);
  return FORMATI[iso] ?? STANDARD;
}

export function sedeHaCampo(nazione: string, campo: CampoSede): boolean {
  if (isNazioneItalia(nazione)) return campo !== "localita";
  return campiIndirizzo(nazione).some((voce) => voce.campo === campo);
}

export function sedeCampiObbligatori(nazione: string): CampoSede[] {
  if (isNazioneItalia(nazione)) return ["indirizzo", "citta", "provincia", "cap"];
  return campiIndirizzo(nazione)
    .filter((voce) => voce.obbligatorio)
    .map((voce) => voce.campo);
}

export function isSedeCompilata(sede: SedeFornitore): boolean {
  if (!sede.nazione.trim()) return false;
  return sedeCampiObbligatori(sede.nazione).every(
    (campo) => (sede[campo] ?? "").trim().length > 0
  );
}

export function isSedeVuota(sede: SedeFornitore): boolean {
  return !(
    sede.nazione.trim() ||
    sede.provincia.trim() ||
    (sede.localita ?? "").trim() ||
    sede.citta.trim() ||
    sede.cap.trim() ||
    sede.indirizzo.trim()
  );
}
