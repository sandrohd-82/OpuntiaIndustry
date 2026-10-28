"use server";

import {
  caricaFirmatoPubblico,
  comuniDaCapPubblico,
  leggiRichiestaPubblica,
  salvaCampoPubblico,
  scaricaPdfPubblico,
  tornaAlFormPubblico,
} from "@/lib/anagrafica/richiesta-db";

export async function statoAnagraficaPubblicaAction(token: string) {
  return leggiRichiestaPubblica(token);
}

export async function salvaCampoAnagraficaAction(input: {
  token: string;
  campo: string;
  valore: unknown;
}) {
  return salvaCampoPubblico(input.token, input.campo, input.valore);
}

export async function comuniCapAnagraficaAction(input: { token: string; cap: string }) {
  return comuniDaCapPubblico(input.token, input.cap);
}

export async function scaricaPdfAnagraficaAction(token: string) {
  return scaricaPdfPubblico(token);
}

export async function modificaAnagraficaAction(token: string) {
  return tornaAlFormPubblico(token);
}

export async function caricaFirmatoAnagraficaAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File)) return { errore: "Seleziona il documento firmato." };
  return caricaFirmatoPubblico(token, file);
}
