"use server";

import { leggiAllerteAzienda } from "@/lib/anagrafica/allerte-lettura";

export type {
  AziendaAllerta,
  AziendaAllertaAvviso,
  AziendaAllertaNota,
} from "@/lib/anagrafica/allerte-lettura";

export async function listAllerteAziendaAction(
  raw: unknown
): ReturnType<typeof leggiAllerteAzienda> {
  return leggiAllerteAzienda(raw);
}
