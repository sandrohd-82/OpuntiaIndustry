import { z } from "zod";

/** Alfabeto senza 0/O/1/I per leggere la targa sul badge. */
export const MATRICOLA_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MATRICOLA_LEN = 6;
export const MATRICOLA_REGEX = /^[A-HJ-NP-Z2-9]{6}$/;

export const matricolaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(MATRICOLA_REGEX, "Matricola: 6 caratteri (lettere e numeri, senza 0/O/1/I).");

export function normalizeMatricola(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function isValidMatricola(raw: string | null | undefined): boolean {
  return MATRICOLA_REGEX.test(normalizeMatricola(raw));
}

export function generateMatricola(used: Iterable<string>): string {
  const taken = new Set(
    [...used].map((v) => normalizeMatricola(v)).filter((v) => v.length > 0)
  );
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let out = "";
    const bytes = new Uint8Array(MATRICOLA_LEN);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < MATRICOLA_LEN; i += 1) {
      out += MATRICOLA_ALPHABET[bytes[i]! % MATRICOLA_ALPHABET.length];
    }
    if (!taken.has(out)) return out;
  }
  throw new Error("Impossibile generare una matricola univoca.");
}
