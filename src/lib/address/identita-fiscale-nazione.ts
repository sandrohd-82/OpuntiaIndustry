import {
  iso2DaNazione,
  isNazioneItalia,
} from "@/lib/address/formato-nazione";

export type ProfiloFiscaleNazione = {
  iso: string;
  italia: boolean;
  etichettaIva: string;
  placeholderIva: string;
  etichettaCodice: string;
  placeholderCodice: string;
  codiceObbligatorio: boolean;
};

type RegolaIva = {
  etichetta: string;
  placeholder: string;
  accetta: (valore: string) => boolean;
  messaggio: string;
};

function pulisci(valore: string): string {
  return valore.trim().toUpperCase().replace(/[\s.\-/]/g, "");
}

const REGOLE: Record<string, RegolaIva> = {
  IT: {
    etichetta: "P. IVA",
    placeholder: "11 cifre",
    accetta: (valore) => /^(IT)?\d{11}$/.test(valore),
    messaggio: "La partita IVA italiana deve avere 11 cifre.",
  },
  GB: {
    etichetta: "VAT",
    placeholder: "GB e 9 cifre",
    accetta: (valore) =>
      /^(GB|XI)?(\d{9}|\d{12}|GD\d{3}|HA\d{3})$/.test(valore),
    messaggio:
      "La VAT del Regno Unito è di 9 cifre, con prefisso GB. Sono ammesse anche 12 cifre.",
  },
  DE: {
    etichetta: "USt-IdNr.",
    placeholder: "DE e 9 cifre",
    accetta: (valore) => /^(DE)?\d{9}$/.test(valore),
    messaggio: "La partita IVA tedesca è DE seguito da 9 cifre.",
  },
  FR: {
    etichetta: "TVA",
    placeholder: "FR, chiave e 9 cifre",
    accetta: (valore) => /^(FR)?[A-Z0-9]{2}\d{9}$/.test(valore),
    messaggio: "La TVA francese è FR, due caratteri e 9 cifre.",
  },
  ES: {
    etichetta: "NIF-IVA",
    placeholder: "ES e 9 caratteri",
    accetta: (valore) => /^(ES)?[A-Z0-9]\d{7}[A-Z0-9]$/.test(valore),
    messaggio: "La partita IVA spagnola è ES seguito da 9 caratteri.",
  },
  PT: {
    etichetta: "NIF",
    placeholder: "PT e 9 cifre",
    accetta: (valore) => /^(PT)?\d{9}$/.test(valore),
    messaggio: "Il NIF portoghese è PT seguito da 9 cifre.",
  },
  NL: {
    etichetta: "BTW",
    placeholder: "NL, 9 cifre, B e 2 cifre",
    accetta: (valore) => /^(NL)?\d{9}B\d{2}$/.test(valore),
    messaggio: "La BTW olandese è NL, 9 cifre, B e 2 cifre.",
  },
  BE: {
    etichetta: "TVA / BTW",
    placeholder: "BE e 10 cifre",
    accetta: (valore) => /^(BE)?[01]?\d{9}$/.test(valore),
    messaggio: "La partita IVA belga è BE seguito da 9 o 10 cifre.",
  },
  AT: {
    etichetta: "UID",
    placeholder: "ATU e 8 cifre",
    accetta: (valore) => /^(AT)?U\d{8}$/.test(valore),
    messaggio: "La UID austriaca è ATU seguito da 8 cifre.",
  },
  IE: {
    etichetta: "VAT",
    placeholder: "IE e 8 o 9 caratteri",
    accetta: (valore) =>
      /^(IE)?(\d{7}[A-Z]{1,2}|\d[A-Z]\d{5}[A-Z])$/.test(valore),
    messaggio: "La VAT irlandese è IE seguito da 8 o 9 caratteri.",
  },
  PL: {
    etichetta: "NIP",
    placeholder: "PL e 10 cifre",
    accetta: (valore) => /^(PL)?\d{10}$/.test(valore),
    messaggio: "Il NIP polacco è PL seguito da 10 cifre.",
  },
  US: {
    etichetta: "EIN",
    placeholder: "9 cifre",
    accetta: (valore) => /^\d{9}$/.test(valore),
    messaggio: "L'EIN statunitense ha 9 cifre.",
  },
};

const ESTERO: RegolaIva = {
  etichetta: "P. IVA / VAT",
  placeholder: "Codice fiscale del Paese",
  accetta: (valore) => /^[A-Z0-9]{5,20}$/.test(valore),
  messaggio:
    "Inserisci la partita IVA del Paese: da 5 a 20 lettere o cifre, prefisso compreso.",
};

export function profiloFiscaleNazione(nazione: string): ProfiloFiscaleNazione {
  if (isNazioneItalia(nazione)) {
    return {
      iso: "IT",
      italia: true,
      etichettaIva: "P. IVA",
      placeholderIva: "11 cifre",
      etichettaCodice: "Codice fiscale",
      placeholderCodice: "11–16 caratteri",
      codiceObbligatorio: true,
    };
  }
  const iso = iso2DaNazione(nazione);
  const regola = REGOLE[iso] ?? ESTERO;
  const etichettaCodice = iso === "GB" ? "Company number" : "Codice fiscale estero";
  return {
    iso: iso || "XX",
    italia: false,
    etichettaIva: regola.etichetta,
    placeholderIva: regola.placeholder,
    etichettaCodice,
    placeholderCodice: iso === "GB" ? "8 caratteri, se c'è" : "Facoltativo",
    codiceObbligatorio: false,
  };
}

export function validaPartitaIvaNazione(
  nazione: string,
  valore: string
): string | null {
  const pulito = pulisci(valore);
  const profilo = profiloFiscaleNazione(nazione);
  const regola = profilo.italia ? REGOLE.IT : (REGOLE[profilo.iso] ?? ESTERO);
  if (!pulito) {
    return `${profilo.etichettaIva} è obbligatoria.`;
  }
  if (!regola.accetta(pulito)) return regola.messaggio;
  return null;
}

export function validaCodiceFiscaleNazione(
  nazione: string,
  valore: string
): string | null {
  const pulito = pulisci(valore);
  const profilo = profiloFiscaleNazione(nazione);
  if (profilo.italia) {
    if (!/^[A-Z0-9]{11,16}$/.test(pulito)) {
      return "Il codice fiscale è obbligatorio (11–16 caratteri).";
    }
    return null;
  }
  if (!pulito) return null;
  if (profilo.iso === "GB" && !/^([A-Z]{2}\d{6}|\d{8})$/.test(pulito)) {
    return "Il company number del Regno Unito è di 8 cifre, oppure due lettere e sei cifre.";
  }
  if (profilo.iso !== "GB" && !/^[A-Z0-9]{4,20}$/.test(pulito)) {
    return "Il codice fiscale estero, se indicato, va da 4 a 20 caratteri.";
  }
  return null;
}
