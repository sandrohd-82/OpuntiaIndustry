import assert from "node:assert/strict";
import {
  componiElencoClienti,
  raccogliElencoClienti,
  type EtichettaCommerciale,
} from "./elenco-clienti";
import type { ClienteRow } from "@/types/database";

const SUPERADMIN = "utente-superadmin";
const PRESIDENTE = "utente-presidente";
const ADA = "utente-ada";
const BRUNO = "utente-bruno";
const PERSONA_ADA = "persona-ada";

function riga(parziale: Partial<ClienteRow> & Pick<ClienteRow, "id">): ClienteRow {
  return {
    codice_targa: "C001",
    ragione_sociale: "Azienda",
    partita_iva: "",
    codice_fiscale: "",
    is_privato: false,
    email: "",
    pec: "",
    sdi_code: "",
    telefono: "",
    sito_web: "",
    lingua_intercomunicazione: "it",
    sede_amm_nazione: "IT",
    sede_amm_provincia: "PA",
    sede_amm_citta: "Palermo",
    sede_amm_cap: "90100",
    sede_amm_indirizzo: "Via Roma 1",
    sede_mag_nazione: "IT",
    sede_mag_provincia: "PA",
    sede_mag_citta: "Palermo",
    sede_mag_cap: "90100",
    sede_mag_indirizzo: "Via Roma 1",
    prodotti_acquistati: [],
    consegne_altra_azienda: [],
    created_by: null,
    updated_by: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    deleted_by: null,
    ...parziale,
  };
}

function etichette(): Map<string, EtichettaCommerciale> {
  return new Map([
    [ADA, { nome: "Ada Neri", grado: "senior" }],
    [BRUNO, { nome: "Bruno Verdi", grado: "executive" }],
  ]);
}

function persone(): Map<string, EtichettaCommerciale> {
  return new Map([[PERSONA_ADA, { nome: "Ada Organigramma", grado: "professional" }]]);
}

const righe = [
  riga({
    id: "azienda-superadmin",
    codice_targa: "C010",
    ragione_sociale: "Creata dal Super Admin",
    created_by: SUPERADMIN,
  }),
  riga({
    id: "azienda-ada",
    codice_targa: "C020",
    ragione_sociale: "Assegnata ad Ada",
    commerciale_id: ADA,
    created_by: ADA,
  }),
  riga({
    id: "azienda-persona",
    codice_targa: "C030",
    ragione_sociale: "Persona senza utente",
    commerciale_persona_id: PERSONA_ADA,
    created_by: PRESIDENTE,
  }),
  riga({
    id: "azienda-bruno",
    codice_targa: "C040",
    ragione_sociale: "Assegnata a Bruno",
    commerciale_id: BRUNO,
    created_by: BRUNO,
    affiancato_id: ADA,
  }),
];

const commercialIds = new Set([ADA, BRUNO]);
const titolareIds = new Set([PRESIDENTE]);
const prenotate = new Map([["azienda-ada", "canc-1"]]);

function campi(id: string) {
  const cliente = componiElencoClienti({
    rows: righe,
    commercialIds,
    titolareIds,
    labels: etichette(),
    nomiPersona: persone(),
    prenotate,
  }).find((voce) => voce.id === id);
  if (!cliente) throw new Error(id);
  return {
    id: cliente.id,
    codiceTarga: cliente.codiceTarga,
    commercialeId: cliente.commercialeId,
    commercialeNome: cliente.commercialeNome,
    commercialeGrado: cliente.commercialeGrado,
    commercialePersonaId: cliente.commercialePersonaId,
    affiancatoNome: cliente.affiancatoNome ?? null,
    cancellazioneId: cliente.cancellazioneId,
    cancellazionePrenotata: cliente.cancellazionePrenotata,
  };
}

const elenco = componiElencoClienti({
  rows: righe,
  commercialIds,
  titolareIds,
  labels: etichette(),
  nomiPersona: persone(),
  prenotate,
});
assert.deepEqual(
  elenco.map((voce) => voce.id),
  ["azienda-superadmin", "azienda-ada", "azienda-persona", "azienda-bruno"]
);
assert.deepEqual(campi("azienda-superadmin"), {
  id: "azienda-superadmin",
  codiceTarga: "C010",
  commercialeId: null,
  commercialeNome: "",
  commercialeGrado: null,
  commercialePersonaId: null,
  affiancatoNome: null,
  cancellazioneId: null,
  cancellazionePrenotata: false,
});
assert.deepEqual(campi("azienda-ada"), {
  id: "azienda-ada",
  codiceTarga: "C020",
  commercialeId: ADA,
  commercialeNome: "Ada Neri",
  commercialeGrado: "senior",
  commercialePersonaId: null,
  affiancatoNome: null,
  cancellazioneId: "canc-1",
  cancellazionePrenotata: true,
});
assert.equal(campi("azienda-persona").commercialeId, null);
assert.equal(campi("azienda-persona").commercialeNome, "Ada Organigramma");
assert.equal(campi("azienda-persona").commercialeGrado, "professional");
assert.equal(campi("azienda-bruno").commercialeId, BRUNO);
assert.equal(campi("azienda-bruno").commercialeNome, "Bruno Verdi");
assert.equal(campi("azienda-bruno").affiancatoNome, "Ada Neri");

const vistoDalCommerciale = elenco.find((voce) => voce.id === "azienda-bruno");
assert.equal(vistoDalCommerciale?.commercialeId, BRUNO);
assert.notEqual(vistoDalCommerciale?.commercialeId, ADA);

const vistoInImpersonificazione = elenco.find((voce) => voce.id === "azienda-superadmin");
assert.equal(vistoInImpersonificazione?.commercialeId, null);
assert.equal(vistoInImpersonificazione?.createdBy, SUPERADMIN);

function memoriaRichiesta() {
  const store = new Map<string, Promise<unknown>>();
  return function unaVolta<T>(chiave: string, esegui: () => Promise<T>): Promise<T> {
    const presente = store.get(chiave);
    if (presente) return presente as Promise<T>;
    const lavoro = esegui();
    store.set(chiave, lavoro);
    return lavoro;
  };
}

async function verifica() {
async function contaTitolari(memoria: ReturnType<typeof memoriaRichiesta>) {
  let esecuzioni = 0;
  const carica = () =>
    memoria("titolari", async () => {
      esecuzioni += 1;
      return titolareIds;
    });
  const commerciali = (async () => {
    const esclusi = await carica();
    const ids = new Set(commercialIds);
    for (const id of esclusi) ids.delete(id);
    return ids;
  })();
  await Promise.all([commerciali, carica()]);
  return esecuzioni;
}

assert.equal(await contaTitolari(memoriaRichiesta()), 1);
assert.equal(await contaTitolari(memoriaRichiesta()), 1);

let clausolaVista: string | null = "manca";
let etichetteChiamate = 0;
let identificativiChiamati = 0;
const esito = await raccogliElencoClienti({
  accessoMs: 4,
  inizioAzione: performance.now(),
  apriClient: async () => ({ nome: "client" }),
  filtro: async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    return "created_by.in.(utente-ada)";
  },
  identificativi: async () => {
    identificativiChiamati += 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return [commercialIds, titolareIds];
  },
  query: async (_client, listOr) => {
    clausolaVista = listOr;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { data: righe, error: null };
  },
  etichette: async () => {
    etichetteChiamate += 1;
    return etichette();
  },
  nomi: async () => persone(),
  prenotate: async () => prenotate,
});

assert.equal(clausolaVista, "created_by.in.(utente-ada)");
assert.equal(identificativiChiamati, 1);
assert.equal(etichetteChiamate, 1);
assert.equal(esito.success, true);
if (esito.success) {
  assert.deepEqual(
    esito.clienti.map((voce) => ({
      id: voce.id,
      commercialeId: voce.commercialeId,
      commercialeNome: voce.commercialeNome,
      cancellazionePrenotata: voce.cancellazionePrenotata,
    })),
    elenco.map((voce) => ({
      id: voce.id,
      commercialeId: voce.commercialeId,
      commercialeNome: voce.commercialeNome,
      cancellazionePrenotata: voce.cancellazionePrenotata,
    }))
  );
  assert.equal(esito.tempi.righe, 4);
  assert.equal(esito.tempi.accessoMs, 4);
}

let etichetteDopoErrore = 0;
const errore = await raccogliElencoClienti({
  accessoMs: 1,
  inizioAzione: performance.now(),
  apriClient: async () => ({ nome: "client" }),
  filtro: async () => null,
  identificativi: async () => [commercialIds, titolareIds],
  query: async () => ({ data: null, error: { message: "query non disponibile" } }),
  etichette: async () => {
    etichetteDopoErrore += 1;
    return etichette();
  },
  nomi: async () => persone(),
  prenotate: async () => prenotate,
});
assert.deepEqual(errore, { success: false, error: "query non disponibile" });
assert.equal(etichetteDopoErrore, 0);
}

verifica()
  .then(() => {
    console.log("elenco-clienti: ok");
  })
  .catch((errore: unknown) => {
    console.error(errore);
    process.exitCode = 1;
  });
