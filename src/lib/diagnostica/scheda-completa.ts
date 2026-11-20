/**
 * Dati base visibili: anagrafica già nota, dipinta senza aspettare le azioni.
 * Sezione disponibile: la singola azione è conclusa, anche in errore.
 * Caricamento completo: la prima azione e ogni sezione prevista sono concluse.
 * Il montaggio del riquadro non basta, e lo stato vuoto non precede la risposta.
 */
import { normalizzaTempiServer, type TempiServerScheda } from "@/lib/diagnostica/tempi-server-scheda";

export const CRITERIO_SCHEDA_UTILIZZABILE =
  "I dati base sono l'anagrafica già nota, visibile senza aspettare le azioni. Una sezione è disponibile quando la sua azione è conclusa, anche in errore. Il caricamento è completo quando la prima azione e ogni sezione prevista sono concluse. Il montaggio del riquadro non basta e lo stato vuoto non precede la risposta.";

export function rispostaAncoraValida(input: {
  attiva: boolean;
  idRichiesta: string;
  idCorrente: string;
}): boolean {
  return input.attiva && input.idRichiesta === input.idCorrente;
}

export function statoSezione(input: {
  esito: "attesa" | "pronto" | "errore";
  vuota: boolean;
}): "attesa" | "errore" | "vuota" | "dati" {
  if (input.esito === "attesa") return "attesa";
  if (input.esito === "errore") return "errore";
  return input.vuota ? "vuota" : "dati";
}

export function sezioneDisponibileMs(
  azione: AzioneSchedaMisura | undefined
): number | null {
  if (!azione || azione.esito == null || azione.durataMs == null) return null;
  return azione.avvioDalClicMs + azione.durataMs;
}

export const NOMI_AZIONE_SCHEDA = [
  "scheda",
  "extra",
  "schede",
  "referenti",
  "riepilogo",
  "allerte",
] as const;

export type NomeAzioneScheda = (typeof NOMI_AZIONE_SCHEDA)[number];
export type EsitoAzioneScheda = "ok" | "errore";
export type RipetizioneScheda = "prima" | "seconda" | "successiva";
export type RelazioneScheda = "in-corso" | "sequenziale" | "parallela";

export type AzioneSchedaMisura = {
  avvioDalClicMs: number;
  durataMs: number | null;
  esito: EsitoAzioneScheda | null;
  server: TempiServerScheda | null;
};

export type MisuraSchedaCompleta = {
  generazione: number;
  ripetizione: RipetizioneScheda;
  moduloAtteso: boolean;
  clicAMontaggioMs: number | null;
  primaVisualizzazioneMs: number | null;
  datiBaseVisibiliMs: number | null;
  caricamentoCompletoMs: number | null;
  erroreVisibile: boolean;
  utilizzabileMs: number | null;
  chiusaPrima: boolean;
  previste: NomeAzioneScheda[];
  azioni: Partial<Record<NomeAzioneScheda, AzioneSchedaMisura>>;
};

const RIPETIZIONI = new Set<RipetizioneScheda>(["prima", "seconda", "successiva"]);
const ESITI = new Set<EsitoAzioneScheda>(["ok", "errore"]);

export function ripetizioneApertura(conteggio: number): RipetizioneScheda {
  if (conteggio <= 1) return "prima";
  if (conteggio === 2) return "seconda";
  return "successiva";
}

export function apriMisuraScheda(
  generazione: number,
  conteggio: number
): MisuraSchedaCompleta {
  return {
    generazione,
    ripetizione: ripetizioneApertura(conteggio),
    moduloAtteso: false,
    clicAMontaggioMs: null,
    primaVisualizzazioneMs: null,
    datiBaseVisibiliMs: null,
    caricamentoCompletoMs: null,
    erroreVisibile: false,
    utilizzabileMs: null,
    chiusaPrima: false,
    previste: [],
    azioni: {},
  };
}

export function segnaModuloAtteso(misura: MisuraSchedaCompleta): MisuraSchedaCompleta {
  if (misura.moduloAtteso) return misura;
  return { ...misura, moduloAtteso: true };
}

export function segnaMontaggioScheda(
  misura: MisuraSchedaCompleta,
  clicAMontaggioMs: number
): MisuraSchedaCompleta {
  if (misura.clicAMontaggioMs != null) return misura;
  return { ...misura, clicAMontaggioMs: Math.max(0, Math.round(clicAMontaggioMs)) };
}

export function prevediAzione(
  misura: MisuraSchedaCompleta,
  nome: NomeAzioneScheda
): MisuraSchedaCompleta {
  if (nome === "scheda" || misura.previste.includes(nome)) return misura;
  return { ...misura, previste: [...misura.previste, nome] };
}

export function avviaAzione(
  misura: MisuraSchedaCompleta,
  nome: NomeAzioneScheda,
  avvioDalClicMs: number
): MisuraSchedaCompleta {
  if (misura.azioni[nome]) return misura;
  return {
    ...misura,
    azioni: {
      ...misura.azioni,
      [nome]: {
        avvioDalClicMs: Math.max(0, Math.round(avvioDalClicMs)),
        durataMs: null,
        esito: null,
        server: null,
      },
    },
  };
}

export function concludiAzione(
  misura: MisuraSchedaCompleta,
  nome: NomeAzioneScheda,
  durataMs: number,
  esito: EsitoAzioneScheda,
  server?: TempiServerScheda | null
): MisuraSchedaCompleta {
  const azione = misura.azioni[nome];
  if (!azione || azione.esito != null) return misura;
  return {
    ...misura,
    azioni: {
      ...misura.azioni,
      [nome]: {
        ...azione,
        durataMs: Math.max(0, Math.round(durataMs)),
        esito,
        server: server ?? null,
      },
    },
  };
}

export function segnaDatiBase(
  misura: MisuraSchedaCompleta,
  dalClicMs: number
): MisuraSchedaCompleta {
  if (misura.datiBaseVisibiliMs != null) return misura;
  const ms = Math.max(0, Math.round(dalClicMs));
  return { ...misura, datiBaseVisibiliMs: ms, primaVisualizzazioneMs: ms };
}

export function segnaDatiVisibili(
  misura: MisuraSchedaCompleta,
  dalClicMs: number
): MisuraSchedaCompleta {
  if (misura.primaVisualizzazioneMs != null) return misura;
  return {
    ...misura,
    primaVisualizzazioneMs: Math.max(0, Math.round(dalClicMs)),
  };
}

export function segnaErroreVisibile(misura: MisuraSchedaCompleta): MisuraSchedaCompleta {
  if (misura.erroreVisibile) return misura;
  return { ...misura, erroreVisibile: true };
}

export function criterioCaricamentoCompleto(misura: MisuraSchedaCompleta): boolean {
  const prima = misura.azioni.scheda;
  if (!prima || prima.esito == null) return false;
  return misura.previste.every((nome) => misura.azioni[nome]?.esito != null);
}

export function criterioUtilizzabile(misura: MisuraSchedaCompleta): boolean {
  return criterioCaricamentoCompleto(misura);
}

export function applicaCaricamentoCompleto(
  misura: MisuraSchedaCompleta,
  dalClicMs: number
): MisuraSchedaCompleta {
  if (misura.chiusaPrima || misura.caricamentoCompletoMs != null) return misura;
  if (!criterioCaricamentoCompleto(misura)) return misura;
  const ms = Math.max(0, Math.round(dalClicMs));
  return { ...misura, caricamentoCompletoMs: ms, utilizzabileMs: ms };
}

export function applicaUtilizzabile(
  misura: MisuraSchedaCompleta,
  dalClicMs: number
): MisuraSchedaCompleta {
  return applicaCaricamentoCompleto(misura, dalClicMs);
}

export function chiudiMisuraScheda(misura: MisuraSchedaCompleta): MisuraSchedaCompleta {
  if (misura.caricamentoCompletoMs != null || misura.chiusaPrima) return misura;
  return { ...misura, chiusaPrima: true };
}

export function montaggioAdAvvioMs(misura: MisuraSchedaCompleta): number | null {
  const scheda = misura.azioni.scheda;
  if (misura.clicAMontaggioMs == null || !scheda) return null;
  return Math.max(0, scheda.avvioDalClicMs - misura.clicAMontaggioMs);
}

export function relazioneOndate(misura: MisuraSchedaCompleta): RelazioneScheda {
  const scheda = misura.azioni.scheda;
  const altre = NOMI_AZIONE_SCHEDA.filter((nome) => nome !== "scheda")
    .map((nome) => misura.azioni[nome])
    .filter((azione): azione is AzioneSchedaMisura => azione != null);
  if (!scheda || scheda.durataMs == null || altre.length === 0) return "in-corso";
  if (altre.some((azione) => azione.durataMs == null)) return "in-corso";
  const finePrima = scheda.avvioDalClicMs + scheda.durataMs;
  const sovrapposta = altre.some((azione) => azione.avvioDalClicMs < finePrima);
  return sovrapposta ? "parallela" : "sequenziale";
}

export function coppieParallele(
  misura: MisuraSchedaCompleta
): Array<[NomeAzioneScheda, NomeAzioneScheda]> {
  const pronte = NOMI_AZIONE_SCHEDA.flatMap((nome) => {
    const azione = misura.azioni[nome];
    if (!azione || azione.durataMs == null) return [];
    return [[nome, azione.avvioDalClicMs, azione.avvioDalClicMs + azione.durataMs] as const];
  });
  const coppie: Array<[NomeAzioneScheda, NomeAzioneScheda]> = [];
  for (let i = 0; i < pronte.length; i += 1) {
    for (let j = i + 1; j < pronte.length; j += 1) {
      const a = pronte[i];
      const b = pronte[j];
      if (a[1] < b[2] && b[1] < a[2]) coppie.push([a[0], b[0]]);
    }
  }
  return coppie;
}

function numero(valore: unknown): number | null {
  return typeof valore === "number" && Number.isFinite(valore) ? valore : null;
}

function azioneDa(valore: unknown): AzioneSchedaMisura | null {
  if (!valore || typeof valore !== "object") return null;
  const riga = valore as Record<string, unknown>;
  const avvio = numero(riga.avvioDalClicMs);
  const durata = riga.durataMs == null ? null : numero(riga.durataMs);
  const esito = riga.esito == null ? null : riga.esito;
  if (avvio == null || (durata == null && esito != null)) return null;
  if (esito != null && !ESITI.has(esito as EsitoAzioneScheda)) return null;
  return {
    avvioDalClicMs: avvio,
    durataMs: durata,
    esito: esito as EsitoAzioneScheda | null,
    server: normalizzaTempiServer(riga.server),
  };
}

export function normalizzaMisureScheda(valore: unknown): MisuraSchedaCompleta[] {
  if (!Array.isArray(valore)) return [];
  const misure: MisuraSchedaCompleta[] = [];
  for (const riga of valore) {
    if (!riga || typeof riga !== "object") continue;
    const record = riga as Record<string, unknown>;
    const generazione = numero(record.generazione);
    const ripetizione = record.ripetizione;
    if (generazione == null || !RIPETIZIONI.has(ripetizione as RipetizioneScheda)) continue;
    const previste = Array.isArray(record.previste)
      ? record.previste.filter((nome): nome is NomeAzioneScheda =>
          NOMI_AZIONE_SCHEDA.includes(nome as NomeAzioneScheda) && nome !== "scheda"
        )
      : [];
    const azioni: MisuraSchedaCompleta["azioni"] = {};
    if (record.azioni && typeof record.azioni === "object") {
      for (const nome of NOMI_AZIONE_SCHEDA) {
        const azione = azioneDa((record.azioni as Record<string, unknown>)[nome]);
        if (azione) azioni[nome] = azione;
      }
    }
    misure.push({
      generazione,
      ripetizione: ripetizione as RipetizioneScheda,
      moduloAtteso: record.moduloAtteso === true,
      clicAMontaggioMs: record.clicAMontaggioMs == null ? null : numero(record.clicAMontaggioMs),
      primaVisualizzazioneMs:
        record.primaVisualizzazioneMs == null ? null : numero(record.primaVisualizzazioneMs),
      datiBaseVisibiliMs:
        record.datiBaseVisibiliMs == null ? null : numero(record.datiBaseVisibiliMs),
      caricamentoCompletoMs:
        record.caricamentoCompletoMs == null ? null : numero(record.caricamentoCompletoMs),
      erroreVisibile: record.erroreVisibile === true,
      utilizzabileMs: record.utilizzabileMs == null ? null : numero(record.utilizzabileMs),
      chiusaPrima: record.chiusaPrima === true,
      previste,
      azioni,
    });
  }
  return misure.slice(-8);
}
