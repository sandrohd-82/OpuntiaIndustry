export const WEBMAIL_TRANSLATE_LANGS = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "English" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "pl", label: "Polski" },
  { code: "nl", label: "Nederlands" },
  { code: "ro", label: "Română" },
  { code: "ar", label: "العربية" },
  { code: "zh", label: "中文" },
] as const;

export type WebmailTranslateLangCode =
  (typeof WEBMAIL_TRANSLATE_LANGS)[number]["code"];

export const WEBMAIL_TRANSLATE_LANG_NAMES: Record<string, string> =
  Object.fromEntries(WEBMAIL_TRANSLATE_LANGS.map((l) => [l.code, l.label]));
