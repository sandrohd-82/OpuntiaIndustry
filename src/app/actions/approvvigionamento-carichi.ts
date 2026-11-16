"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const giornoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

type Errore = { success: false; error: string };

export type VersionePerCarico = {
  versioneId: string;
  ordineId: string;
  codice: string;
  numero: number;
  fornitore: string;
  dataConsegna: string;
  corrente: boolean;
  righe: {
    materiaPrimaId: string;
    codice: string;
    nome: string;
    quantita: number;
    unitaMisura: string;
  }[];
};

export type CaricoRiga = {
  id: string;
  codice: string;
  ordineCodice: string;
  versioneNumero: number;
  stato: "aperto" | "parziale" | "arrivato";
  dataPrevista: string;
  dataEffettiva: string | null;
  foglioId: string;
  foglioCodice: string | null;
  righe: {
    id: string;
    codice: string;
    nome: string;
    unitaMisura: string;
    prevista: number;
    arrivata: number | null;
  }[];
};

function messaggioDb(error: { message?: string }, fallback: string): string {
  const testo = (error.message ?? "").split("\n")[0] ?? "";
  if (testo.includes("Non autorizzato")) return "Non autorizzato.";
  if (testo.includes("chiave")) return "Questa operazione è già stata usata.";
  if (
    testo.includes("versione pubblicata corrente") ||
    testo.includes("non coincidono") ||
    testo.includes("Quantità non compilata") ||
    testo.includes("due volte") ||
    testo.includes("motivazione") ||
    testo.includes("procedura eccezionale") ||
    testo.includes("snapshot")
  ) {
    return testo.replace(/^ERROR:\s*/, "");
  }
  return fallback;
}

function statoCarico(valore: unknown): CaricoRiga["stato"] {
  if (valore === "arrivato" || valore === "parziale") return valore;
  return "aperto";
}

export async function listaCarichiProduzioneAction(): Promise<
  { success: true; versioni: VersionePerCarico[]; carichi: CaricoRiga[] } | Errore
> {
  await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data: versioni, error } = await supabase
    .from("approvvigionamenti_versioni")
    .select("id, ordine_id, numero, codice, data_consegna, fornitore_id, righe")
    .order("data_consegna", { ascending: false })
    .limit(100);
  if (error) return { success: false, error: "Versioni non disponibili." };
  const ordineIds = [...new Set((versioni ?? []).map((row) => String(row.ordine_id)))];
  const { data: ordini } = ordineIds.length
    ? await supabase.from("approvvigionamenti_ordini").select("id, versione_pubblicata").in("id", ordineIds)
    : { data: [] };
  const pubblicata = new Map(
    (ordini ?? []).map((row) => [String(row.id), Number(row.versione_pubblicata ?? 0)])
  );
  const fornitoreIds = [...new Set((versioni ?? []).map((row) => String(row.fornitore_id)))];
  const { data: fornitori } = fornitoreIds.length
    ? await supabase.from("fornitori").select("id, ragione_sociale").in("id", fornitoreIds)
    : { data: [] };
  const nomi = new Map((fornitori ?? []).map((row) => [String(row.id), String(row.ragione_sociale)]));
  const { data: carichi, error: erroreCarichi } = await supabase
    .from("approvvigionamenti_carichi")
    .select("id, codice, ordine_id, versione_id, stato, data_prevista, data_effettiva, foglio_id")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  if (erroreCarichi) return { success: false, error: "Carichi non disponibili." };
  const caricoIds = (carichi ?? []).map((row) => String(row.id));
  const foglioIds = (carichi ?? []).map((row) => String(row.foglio_id ?? "")).filter(Boolean);
  const [{ data: righe }, { data: fogli }] = await Promise.all([
    caricoIds.length
      ? supabase
          .from("approvvigionamenti_carichi_righe")
          .select("id, carico_id, codice, nome, unita_misura, quantita_prevista, quantita_arrivata")
          .in("carico_id", caricoIds)
      : Promise.resolve({ data: [] }),
    foglioIds.length
      ? supabase.from("haccp_fogli_ingresso").select("id, codice").in("id", foglioIds)
      : Promise.resolve({ data: [] }),
  ]);
  const codiceFoglio = new Map((fogli ?? []).map((row) => [String(row.id), String(row.codice)]));
  const versioneNumero = new Map((versioni ?? []).map((row) => [String(row.id), Number(row.numero)]));
  const codiceOrdine = new Map((versioni ?? []).map((row) => [String(row.ordine_id), String(row.codice)]));
  return {
    success: true,
    versioni: (versioni ?? []).map((row) => {
      const linee = Array.isArray(row.righe) ? row.righe : [];
      return {
        versioneId: String(row.id),
        ordineId: String(row.ordine_id),
        codice: String(row.codice),
        numero: Number(row.numero),
        fornitore: nomi.get(String(row.fornitore_id)) ?? "Fornitore",
        dataConsegna: String(row.data_consegna),
        corrente: Number(row.numero) === (pubblicata.get(String(row.ordine_id)) ?? 0),
        righe: linee.map((voce) => {
          const riga = voce as {
            materiaPrimaId?: string;
            codice?: string;
            nome?: string;
            quantita?: number;
            unitaMisura?: string;
          };
          return {
            materiaPrimaId: String(riga.materiaPrimaId ?? ""),
            codice: String(riga.codice ?? ""),
            nome: String(riga.nome ?? ""),
            quantita: Number(riga.quantita ?? 0),
            unitaMisura: String(riga.unitaMisura ?? ""),
          };
        }),
      };
    }),
    carichi: (carichi ?? []).map((row) => ({
      id: String(row.id),
      codice: String(row.codice),
      ordineCodice: codiceOrdine.get(String(row.ordine_id)) ?? "",
      versioneNumero: versioneNumero.get(String(row.versione_id)) ?? 0,
      stato: statoCarico(row.stato),
      dataPrevista: String(row.data_prevista),
      dataEffettiva: row.data_effettiva ? String(row.data_effettiva) : null,
      foglioId: String(row.foglio_id ?? ""),
      foglioCodice: codiceFoglio.get(String(row.foglio_id ?? "")) ?? null,
      righe: (righe ?? [])
        .filter((riga) => String(riga.carico_id) === String(row.id))
        .map((riga) => ({
          id: String(riga.id),
          codice: String(riga.codice),
          nome: String(riga.nome),
          unitaMisura: String(riga.unita_misura),
          prevista: Number(riga.quantita_prevista),
          arrivata: riga.quantita_arrivata == null ? null : Number(riga.quantita_arrivata),
        })),
    })),
  };
}

export async function creaCaricoApprovvigionamentoAction(raw: unknown): Promise<
  { success: true; codice: string; foglioCodice: string; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      versioneId: uuidSchema,
      dataPrevista: giornoSchema,
      righe: z
        .array(
          z.object({
            materiaPrimaId: uuidSchema,
            quantita: z.number().positive().max(1_000_000),
            unitaMisura: z.string().trim().min(1).max(8),
          })
        )
        .min(1)
        .max(40),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Carico non valido." };
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crea_carico_approvvigionamento", {
    p_chiave: parsed.data.chiave,
    p_versione_id: parsed.data.versioneId,
    p_data_prevista: parsed.data.dataPrevista,
    p_righe: parsed.data.righe,
  });
  if (error) return { success: false, error: messaggioDb(error, "Carico non creato.") };
  const corpo = (data ?? {}) as {
    id?: string;
    codice?: string;
    foglioCodice?: string;
    riusata?: boolean;
  };
  await writeAuditLog({
    entity_type: "approvvigionamenti_carichi",
    entity_id: String(corpo.id ?? parsed.data.versioneId),
    action: "carico",
    actor_id: auth.userId,
    summary: "Aperto un carico con un foglio HACCP. La presa visione non è una consegna.",
    payload: { riusata: Boolean(corpo.riusata), foglio: corpo.foglioCodice ?? null },
  });
  return {
    success: true,
    codice: String(corpo.codice ?? ""),
    foglioCodice: String(corpo.foglioCodice ?? ""),
    riusata: Boolean(corpo.riusata),
  };
}

export async function registraArrivoCaricoAction(raw: unknown): Promise<
  { success: true; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      caricoId: uuidSchema,
      dataEffettiva: giornoSchema,
      righe: z
        .array(
          z.object({
            rigaId: uuidSchema,
            quantita: z.number().min(0).max(1_000_000),
          })
        )
        .min(1)
        .max(40),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Arrivo non valido." };
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registra_arrivo_carico", {
    p_chiave: parsed.data.chiave,
    p_carico_id: parsed.data.caricoId,
    p_data_effettiva: parsed.data.dataEffettiva,
    p_righe: parsed.data.righe,
  });
  if (error) return { success: false, error: messaggioDb(error, "Arrivo non registrato.") };
  const corpo = (data ?? {}) as { id?: string; riusata?: boolean };
  await writeAuditLog({
    entity_type: "approvvigionamenti_carichi",
    entity_id: String(corpo.id ?? parsed.data.caricoId),
    action: "arrivo",
    actor_id: auth.userId,
    summary: "Registrata la quantità arrivata. Lo snapshot pubblicato resta invariato.",
    payload: { riusata: Boolean(corpo.riusata) },
  });
  return { success: true, riusata: Boolean(corpo.riusata) };
}

export async function creaCaricoVersioneStoricaAction(raw: unknown): Promise<
  { success: true; codice: string; foglioCodice: string; riusata: boolean } | Errore
> {
  const parsed = z
    .object({
      chiave: z.string().trim().min(8).max(80),
      versioneId: uuidSchema,
      dataPrevista: giornoSchema,
      motivazione: z.string().trim().min(10).max(500),
      righe: z
        .array(
          z.object({
            materiaPrimaId: uuidSchema,
            quantita: z.number().positive().max(1_000_000),
            unitaMisura: z.string().trim().min(1).max(8),
          })
        )
        .min(1)
        .max(40),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "La versione superata richiede una motivazione." };
  const { auth } = await requireAreaAccess("produzione");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crea_carico_versione_storica", {
    p_chiave: parsed.data.chiave,
    p_versione_id: parsed.data.versioneId,
    p_data_prevista: parsed.data.dataPrevista,
    p_righe: parsed.data.righe,
    p_motivazione: parsed.data.motivazione,
  });
  if (error) return { success: false, error: messaggioDb(error, "Carico non creato.") };
  const corpo = (data ?? {}) as {
    id?: string;
    codice?: string;
    foglioCodice?: string;
    riusata?: boolean;
  };
  await writeAuditLog({
    entity_type: "approvvigionamenti_carichi",
    entity_id: String(corpo.id ?? parsed.data.versioneId),
    action: "carico",
    actor_id: auth.userId,
    summary: "Aperto un carico sulla versione superata, con motivazione tracciata.",
    payload: {
      riusata: Boolean(corpo.riusata),
      foglio: corpo.foglioCodice ?? null,
      motivazione: parsed.data.motivazione,
    },
  });
  return {
    success: true,
    codice: String(corpo.codice ?? ""),
    foglioCodice: String(corpo.foglioCodice ?? ""),
    riusata: Boolean(corpo.riusata),
  };
}
