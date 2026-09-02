export const GEO_CONTINENTI = [
  "europa",
  "asia",
  "africa",
  "america",
  "oceania",
] as const;

export type GeoContinenteCodice = (typeof GEO_CONTINENTI)[number];

export const GEO_CONTINENTE_LABEL: Record<GeoContinenteCodice, string> = {
  europa: "Europa",
  asia: "Asia",
  africa: "Africa",
  america: "America",
  oceania: "Oceania",
};

export const LISTINO_LINGUE = [
  "it",
  "en",
  "de",
  "fr",
  "es",
  "pt",
  "nl",
  "pl",
  "ro",
  "cs",
  "hu",
  "el",
  "sv",
  "da",
  "fi",
  "nb",
  "bg",
  "hr",
  "sk",
  "sl",
  "et",
  "lv",
  "lt",
  "ga",
  "mt",
  "ar",
  "zh",
  "ja",
  "ko",
  "tr",
  "ru",
  "uk",
  "he",
  "hi",
  "th",
  "vi",
  "id",
  "ms",
  "fa",
] as const;

export type ListinoLingua = (typeof LISTINO_LINGUE)[number];

export const LISTINO_LINGUA_LABEL: Record<string, string> = {
  it: "Italiano",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  pt: "Português",
  nl: "Nederlands",
  pl: "Polski",
  ro: "Română",
  cs: "Čeština",
  hu: "Magyar",
  el: "Ελληνικά",
  sv: "Svenska",
  da: "Dansk",
  fi: "Suomi",
  nb: "Norsk",
  bg: "Български",
  hr: "Hrvatski",
  sk: "Slovenčina",
  sl: "Slovenščina",
  et: "Eesti",
  lv: "Latviešu",
  lt: "Lietuvių",
  ga: "Gaeilge",
  mt: "Malti",
  ar: "العربية",
  zh: "中文",
  ja: "日本語",
  ko: "한국어",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  he: "עברית",
  hi: "हिन्दी",
  th: "ไทย",
  vi: "Tiếng Việt",
  id: "Bahasa Indonesia",
  ms: "Bahasa Melayu",
  fa: "فارسی",
};

export type GeoNazione = {
  id: string;
  iso2: string;
  continenteCodice: GeoContinenteCodice;
  nome: string;
  lingueIso: string[];
};

export function isListinoLingua(value: string): value is ListinoLingua {
  return (LISTINO_LINGUE as readonly string[]).includes(value);
}

export function lingueDaNazioni(nazioni: Array<{ lingueIso: string[] }>): string[] {
  const set = new Set<string>();
  for (const n of nazioni) {
    for (const l of n.lingueIso) {
      const code = l.trim().toLowerCase();
      if (code) set.add(code);
    }
  }
  return [...set].sort();
}

export function labelLingua(locale: string): string {
  return LISTINO_LINGUA_LABEL[locale] ?? locale.toUpperCase();
}
