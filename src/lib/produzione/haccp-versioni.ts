import type { SoggettoAccessoFornitore } from "@/lib/produzione/fornitore-accesso";
import { eUtenteInternoHaccp } from "@/lib/produzione/fornitore-accesso";

export type AmbitoLineaGuida = "interno" | "fornitori";
export type StatoVersioneGuida = "bozza" | "pubblicata";
export type NotificaStatoGuida = "non_inviata" | "inviata" | "fallita";

export type VersioneGuida = {
  id: string;
  numero: number;
  titolo: string;
  corpo: string;
  stato: StatoVersioneGuida;
  pubblicataAt: string | null;
  pubblicataDa: string | null;
};

export type DistribuzioneGuida = {
  id: string;
  versioneId: string;
  versioneNumero: number;
  fornitoreId: string;
  ragioneSociale: string;
  registrataAt: string;
  notificaStato: NotificaStatoGuida;
  notificaErrore: string | null;
  prese: number;
};

export type SezioneLineaGuida = {
  id: string;
  slug: string;
  titolo: string;
  ordine: number;
  ambito: AmbitoLineaGuida;
  destinatariIds: string[];
  versioni: VersioneGuida[];
  distribuzioni: DistribuzioneGuida[];
};

export type FornitoreDestinatario = {
  id: string;
  ragioneSociale: string;
  email: string;
};

export type PresaVisioneGuida = {
  profileId: string;
  nome: string;
  confermataAt: string;
};

export type VersioneRicevuta = {
  id: string;
  numero: number;
  titolo: string;
  corpo: string;
  pubblicataAt: string | null;
  registrataAt: string;
  notificaStato: NotificaStatoGuida;
  miaPresaAt: string | null;
  preseAzienda: PresaVisioneGuida[];
};

export type GuidaRicevuta = {
  documentoId: string;
  titolo: string;
  versioni: VersioneRicevuta[];
};

export function versioneModificabile(stato: StatoVersioneGuida): boolean {
  return stato === "bozza";
}

export function puoModificareDocumentoLineaGuida(
  soggetto: SoggettoAccessoFornitore
): boolean {
  return eUtenteInternoHaccp(soggetto);
}

export function pubblicazioneHaNovita(input: {
  titolo: string;
  corpo: string;
  pubblicata: { titolo: string; corpo: string } | null;
}): boolean {
  const titolo = input.titolo.trim();
  const corpo = input.corpo.trim();
  if (!titolo || !corpo) return false;
  if (!input.pubblicata) return true;
  return (
    titolo !== input.pubblicata.titolo.trim() ||
    corpo !== input.pubblicata.corpo.trim()
  );
}

/** Stessa versione, stesso fornitore: una sola registrazione. */
export function destinatariDaRegistrare(
  destinatarioIds: readonly string[],
  giaRegistrati: readonly string[]
): string[] {
  const visti = new Set(giaRegistrati);
  const nuovi: string[] = [];
  for (const id of destinatarioIds) {
    if (visti.has(id)) continue;
    visti.add(id);
    nuovi.push(id);
  }
  return nuovi;
}

export function notificaRisultaConsegnata(stato: NotificaStatoGuida): boolean {
  return stato === "inviata";
}

export function consultaLineeGuidaFornitore(
  soggetto: SoggettoAccessoFornitore
):
  | { ok: true; fornitoreId: string }
  | { ok: false; motivo: "non_collegato" | "area_assente" } {
  const portale =
    soggetto.superadmin || soggetto.aree.includes("area-fornitori");
  if (!portale) return { ok: false, motivo: "area_assente" };
  if (!soggetto.fornitoreCollegatoId) {
    return { ok: false, motivo: "non_collegato" };
  }
  return { ok: true, fornitoreId: soggetto.fornitoreCollegatoId };
}

export function distribuzioneDelFornitore(
  fornitoreRiga: string,
  fornitoreSessione: string
): boolean {
  return fornitoreRiga === fornitoreSessione;
}

export function presaVisioneCopreVersione(
  versioneConfermataId: string,
  versioneRichiestaId: string
): boolean {
  return versioneConfermataId === versioneRichiestaId;
}

export function puoRegistrarePresaVisione(input: {
  fornitoreSessione: string | null;
  versioneDistribuita: boolean;
  giaConfermataDaQuestoUtente: boolean;
}):
  | { ok: true }
  | {
      ok: false;
      motivo: "non_collegato" | "versione_non_ricevuta" | "gia_confermata";
    } {
  if (!input.fornitoreSessione) return { ok: false, motivo: "non_collegato" };
  if (!input.versioneDistribuita) {
    return { ok: false, motivo: "versione_non_ricevuta" };
  }
  if (input.giaConfermataDaQuestoUtente) {
    return { ok: false, motivo: "gia_confermata" };
  }
  return { ok: true };
}

export function primoIndirizzoEmail(testo: string): string | null {
  const parti = testo.split(/[;,]/).map((parte) => parte.trim()).filter(Boolean);
  return (
    parti.find((parte) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parte)) ?? null
  );
}
