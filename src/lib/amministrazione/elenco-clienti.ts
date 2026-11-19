import type { TempiServerElencoClienti } from "@/lib/diagnostica/prestazioni";
import {
  etichettaAffiancato,
  resolveCommercialeAppartenenza,
  type CommercialeGrado,
} from "@/lib/auth/commerciale";
import { mapClienteRow, type Cliente } from "@/lib/amministrazione/clienti";
import type { ClienteRow } from "@/types/database";

export type EtichettaCommerciale = {
  nome: string;
  grado: CommercialeGrado | null;
};

export function componiElencoClienti(input: {
  rows: ClienteRow[];
  commercialIds: Set<string>;
  titolareIds: Set<string>;
  labels: Map<string, EtichettaCommerciale>;
  nomiPersona: Map<string, EtichettaCommerciale>;
  prenotate: Map<string, string>;
}): Cliente[] {
  return input.rows.map((row) => {
    const resolved = resolveCommercialeAppartenenza({
      commercialeId: row.commerciale_id ?? null,
      createdBy: row.created_by ?? null,
      commercialIds: input.commercialIds,
      titolareIds: input.titolareIds,
      labels: input.labels,
    });
    const cliente = mapClienteRow(row, {
      nome: resolved.commercialeNome,
      grado: resolved.commercialeGrado,
    });
    cliente.commercialeId = resolved.commercialeId;
    if (!row.commerciale_id && row.commerciale_persona_id) {
      const personaId = String(row.commerciale_persona_id);
      const etichetta = input.nomiPersona.get(personaId);
      cliente.commercialeId = null;
      cliente.commercialePersonaId = personaId;
      cliente.commercialeNome = etichetta?.nome ?? "Commerciale";
      cliente.commercialeGrado = etichetta?.grado ?? null;
    }
    const affiancato = etichettaAffiancato({
      affiancatoId: cliente.affiancatoId,
      affiancatoPersonaId: cliente.affiancatoPersonaId,
      labels: input.labels,
      persone: input.nomiPersona,
    });
    if (affiancato) {
      cliente.affiancatoNome = affiancato.nome;
      cliente.affiancatoGrado = affiancato.grado;
    }
    cliente.cancellazioneId = input.prenotate.get(row.id) ?? null;
    cliente.cancellazionePrenotata = input.prenotate.has(row.id);
    return cliente;
  });
}

export function idsUtenteElenco(rows: ClienteRow[]): string[] {
  return rows
    .flatMap((row) => [
      row.commerciale_id ?? "",
      row.created_by ?? "",
      row.affiancato_id ?? "",
    ])
    .filter(Boolean);
}

export function idsPersonaElenco(rows: ClienteRow[]): string[] {
  return rows.flatMap((row) =>
    [
      !row.commerciale_id && row.commerciale_persona_id
        ? String(row.commerciale_persona_id)
        : "",
      row.affiancato_persona_id ? String(row.affiancato_persona_id) : "",
    ].filter(Boolean)
  );
}

function tieneRifiuto<T>(lavoro: Promise<T>): Promise<T> {
  lavoro.catch(() => undefined);
  return lavoro;
}

export async function raccogliElencoClienti<TClient>(input: {
  accessoMs: number;
  inizioAzione: number;
  apriClient: () => Promise<TClient>;
  filtro: () => Promise<string | null>;
  identificativi: () => Promise<[Set<string>, Set<string>]>;
  query: (
    client: TClient,
    listOr: string | null
  ) => Promise<{ data: ClienteRow[] | null; error: { message: string } | null }>;
  etichette: (ids: string[]) => Promise<Map<string, EtichettaCommerciale>>;
  nomi: (ids: string[]) => Promise<Map<string, EtichettaCommerciale>>;
  prenotate: (client: TClient, ids: string[]) => Promise<Map<string, string>>;
}): Promise<
  | { success: true; clienti: Cliente[]; tempi: TempiServerElencoClienti }
  | { success: false; error: string }
> {
  const inizioFiltro = performance.now();
  const inizioIdentificativi = performance.now();
  const filtroPromise = input.filtro().then((clausola) => {
    return {
      clausola,
      filtroMs: Math.round(performance.now() - inizioFiltro),
    };
  });
  const identificativiPromise = tieneRifiuto(
    input.identificativi().then((coppia) => {
      return {
        coppia,
        identificativiMs: Math.round(performance.now() - inizioIdentificativi),
      };
    })
  );
  const clientPromise = input.apriClient();
  const aperto = await Promise.all([clientPromise, filtroPromise]);
  const client = aperto[0];
  const filtro = aperto[1];

  const inizioQuery = performance.now();
  const risultato = await input.query(client, filtro.clausola);
  const queryMs = Math.round(performance.now() - inizioQuery);
  if (risultato.error) {
    return { success: false, error: risultato.error.message };
  }

  const rows = risultato.data ?? [];
  const inizioEtichette = performance.now();
  const inizioUtenti = performance.now();
  const etichettePromise = input.etichette(idsUtenteElenco(rows)).then((labels) => {
    return {
      labels,
      etichetteUtentiMs: Math.round(performance.now() - inizioUtenti),
    };
  });
  const inizioNomi = performance.now();
  const nomiPromise = input.nomi(idsPersonaElenco(rows)).then((nomiPersona) => {
    return {
      nomiPersona,
      nomiMs: Math.round(performance.now() - inizioNomi),
    };
  });
  const inizioPrenotate = performance.now();
  const prenotatePromise = input.prenotate(client, rows.map((row) => row.id)).then((prenotate) => {
    return {
      prenotate,
      prenotateMs: Math.round(performance.now() - inizioPrenotate),
    };
  });

  const arricchimento = await Promise.all([
    identificativiPromise,
    etichettePromise,
    nomiPromise,
    prenotatePromise,
  ]);
  const identificativi = arricchimento[0];
  const etichette = arricchimento[1];
  const nomi = arricchimento[2];
  const prenotate = arricchimento[3];
  const etichetteMs = Math.round(performance.now() - inizioEtichette);
  const inizioMappa = performance.now();
  const clienti = componiElencoClienti({
    rows,
    commercialIds: identificativi.coppia[0],
    titolareIds: identificativi.coppia[1],
    labels: etichette.labels,
    nomiPersona: nomi.nomiPersona,
    prenotate: prenotate.prenotate,
  });
  const mappaMs = Math.round(performance.now() - inizioMappa);

  return {
    success: true,
    clienti,
    tempi: {
      accessoMs: input.accessoMs,
      filtroMs: filtro.filtroMs,
      queryMs,
      identificativiMs: identificativi.identificativiMs,
      etichetteUtentiMs: etichette.etichetteUtentiMs,
      nomiMs: nomi.nomiMs,
      prenotateMs: prenotate.prenotateMs,
      mappaMs,
      etichetteMs,
      totaleMs: Math.round(performance.now() - input.inizioAzione),
      righe: rows.length,
    },
  };
}
