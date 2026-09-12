/** Lotto prodotto Agrinsicilia (lavorazione). */

export type LottoAgrinsiciliaParti = {
  /** DD.MM.YY — data di inizio lavorazione */
  dataInizio: string;
  /** Targa gestionale del prodotto in uscita */
  targaProdotto: string;
  /** Targa fornitore Mp senza la F iniziale (es. F031 → 031) */
  targaFornitore: string;
  /** Codice MP lavorata (lotto ingresso GGMMAA + 5 hex) */
  ddt: string;
  /** Progressivo annuo per tipo prodotto, 3 cifre */
  progressivo: string;
};

export const LOTTO_AGRINSICILIA_PREFIX = "L-";

export function stripTargaFornitore(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const up = v.toUpperCase();
  if (/^F[0-9A-F]{3}$/.test(up)) return up.slice(1);
  if (/^F\d+$/i.test(v)) {
    const digits = v.slice(1);
    return digits.length <= 3 ? digits.padStart(3, "0") : digits;
  }
  if (/^F/i.test(v)) return v.slice(1);
  return v;
}

export function padProgressivo(raw: string | number): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.slice(-3).padStart(3, "0");
}

export function formatDataLotto(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear() % 100).padStart(2, "0");
  return `${dd}.${mm}.${yy}`;
}

export function dataLottoToIso(dataInizio: string): string {
  const m = dataInizio.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return "";
  return `20${m[3]}-${m[2]}-${m[1]}`;
}

export function isoToDataLotto(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1].slice(2)}`;
}

export function isValidDataLotto(value: string): boolean {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);
  if (!m) return false;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = 2000 + Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d
  );
}

export function annoDaDataLotto(dataInizio: string): number | null {
  const m = dataInizio.match(/^\d{2}\.\d{2}\.(\d{2})$/);
  if (!m) return null;
  return 2000 + Number(m[1]);
}

export function normalizeDataLotto(raw: string): string {
  const formatted = formatPartialDate(raw);
  return formatted.includes("_") ? "" : formatted;
}

export function composeLottoAgrinsicilia(
  p: LottoAgrinsiciliaParti
): string {
  const data = normalizeDataLotto(p.dataInizio);
  const prod = p.targaProdotto.trim();
  const forn = stripTargaFornitore(p.targaFornitore);
  const ddt = p.ddt.trim();
  const prog = padProgressivo(p.progressivo);
  if (!data || !prod || !forn || !ddt || !prog) return "";
  return `${LOTTO_AGRINSICILIA_PREFIX}${data}/${prod}/${forn}/${ddt}-${prog}`;
}

export function parseLottoAgrinsicilia(
  raw: string
): LottoAgrinsiciliaParti | null {
  const s = String(raw ?? "").replace(/\s+/g, "").trim();
  if (!s) return null;
  const m = s.match(
    /^L-(\d{2}\.\d{2}\.\d{2})\/([^/]+)\/([^/]+)\/(.+)-(\d{2,3})$/i
  );
  if (!m) return null;
  return {
    dataInizio: m[1],
    targaProdotto: m[2],
    targaFornitore: stripTargaFornitore(m[3]),
    ddt: m[4],
    progressivo: padProgressivo(m[5]),
  };
}

export function isValidLottoAgrinsicilia(raw: string): boolean {
  const p = parseLottoAgrinsicilia(raw);
  if (!p || !isValidDataLotto(p.dataInizio)) return false;
  if (!p.targaProdotto || !p.targaFornitore || !p.ddt) return false;
  return /^\d{3}$/.test(p.progressivo) && Boolean(composeLottoAgrinsicilia(p));
}

export function maxProgressivoDaLotti(
  lotti: string[],
  targaProdotto: string,
  anno: number
): number {
  const targa = targaProdotto.trim();
  let max = 0;
  for (const raw of lotti) {
    const p = parseLottoAgrinsicilia(raw);
    if (!p) continue;
    if (p.targaProdotto !== targa) continue;
    if (annoDaDataLotto(p.dataInizio) !== anno) continue;
    const n = Number(p.progressivo);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

export function nextProgressivoLabel(maxUsato: number): string {
  return padProgressivo(Math.min(999, Math.max(0, maxUsato) + 1));
}

/** Data parziale stile 11.06.__ */
export function formatPartialDate(raw: string): string {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 6);
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4, 6)]
    .map((c) => c.padEnd(2, "_"))
    .join(".");
}

export function digitsFromDataLotto(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "").slice(0, 6);
}

/** Bozza sempre con separatori visibili: L-__.__.__/NDRi/___/____-___ */
export function composeLottoBozza(p: LottoAgrinsiciliaParti): string {
  const data = formatPartialDate(p.dataInizio);
  const forn = (p.targaFornitore.replace(/_/g, "") || "").padEnd(3, "_");
  const ddtRaw = p.ddt.replace(/_/g, "");
  const ddt = ddtRaw || "____";
  const prog = (p.progressivo.replace(/\D/g, "") || "").padEnd(3, "_");
  const targa = p.targaProdotto.trim() || "____";
  return `${LOTTO_AGRINSICILIA_PREFIX}${data}/${targa}/${forn}/${ddt}-${prog}`;
}

export function lottoMaskPlaceholder(targaProdotto: string): string {
  return composeLottoBozza({
    dataInizio: "",
    targaProdotto: targaProdotto.trim() || "targa",
    targaFornitore: "",
    ddt: "",
    progressivo: "",
  });
}

/** Accetta lotto completo o bozza con _ e separatori. */
export function parseLottoBozza(
  raw: string,
  targaProdotto: string
): LottoAgrinsiciliaParti {
  const completo = parseLottoAgrinsicilia(raw.replace(/_/g, ""));
  if (completo) {
    return { ...completo, targaProdotto: targaProdotto || completo.targaProdotto };
  }
  const s = String(raw ?? "").replace(/\s+/g, "").replace(/^L-/i, "");
  const parts = s.split("/");
  const dataDigits = digitsFromDataLotto(parts[0] ?? "");
  const forn = stripTargaFornitore((parts[2] ?? "").replace(/_/g, ""));
  const coda = (parts.slice(3).join("/") || "").replace(/_/g, "");
  const progMatch = coda.match(/-(\d{0,3})$/);
  const ddt = progMatch ? coda.slice(0, progMatch.index) : coda.replace(/-$/, "");
  const prog = progMatch?.[1] ?? "";
  return {
    dataInizio: dataDigits.length === 6 ? formatPartialDate(dataDigits).replace(/_/g, "") : dataDigits,
    targaProdotto,
    targaFornitore: forn,
    ddt,
    progressivo: prog,
  };
}
