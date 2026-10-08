"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/session";
import { isSuperadminProfile } from "@/lib/auth/roles";
import {
  caveauConfigurato,
  cifraPasswordCaveau,
  codiceCaveauValido,
  decifraPasswordCaveau,
} from "@/lib/amministrazione/caveau-siti-crypto";
import {
  caveauAcquistoSchema,
  caveauAcquistoUpdateSchema,
  caveauEliminaSchema,
  caveauRivelaSchema,
  caveauSitoSchema,
  caveauSitoUpdateSchema,
  prezzoAcquistoOrNull,
  registratoAtOrNull,
  type CaveauAcquistoRiga,
  type CaveauSitoRiga,
} from "@/lib/amministrazione/caveau-siti";
import { fraseConfermaSoftDelete } from "@/lib/soft-delete";
import { createServiceClient } from "@/lib/supabase/server";

const PATH = "/app/amministrazione/caveau-siti";
const ENTITY = "caveau_siti_aziendali";
const ENTITY_ACQUISTO = "caveau_siti_acquisti";
const TENTATIVI_MAX = 5;
const FINESTRA_MS = 15 * 60 * 1000;

type Gate =
  | { ok: true; actorId: string }
  | { ok: false; error: string };

async function gate(): Promise<Gate> {
  const auth = await getAuthContext();
  if (
    !auth?.isSecondFactorVerified ||
    auth.impersonating ||
    !isSuperadminProfile(auth.actorProfile)
  ) {
    return { ok: false, error: "Accesso negato." };
  }
  return { ok: true, actorId: auth.actorUserId };
}

function configError(): string {
  return "Il caveau non è configurato sul server. Servono CREDENTIALS_VAULT_KEY e CREDENTIALS_VAULT_CODE.";
}

async function audita(input: {
  entityType?: string;
  entityId: string;
  action: string;
  actorId: string;
  summary: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("audit_log").insert({
    entity_type: input.entityType ?? ENTITY,
    entity_id: input.entityId,
    action: input.action,
    actor_id: input.actorId,
    summary: input.summary,
    payload: input.payload,
  });
  if (error) console.error("[caveau audit]", error.message);
}

async function tentativiRecenti(actorId: string): Promise<number | null> {
  const since = new Date(Date.now() - FINESTRA_MS).toISOString();
  const db = createServiceClient();
  const { count, error } = await db
    .from("audit_log")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", ENTITY)
    .eq("action", "reveal_denied")
    .eq("actor_id", actorId)
    .gte("created_at", since);
  if (error) return null;
  return count ?? 0;
}

export async function listCaveauSitiAction(): Promise<
  { ok: true; righe: CaveauSitoRiga[] } | { ok: false; error: string }
> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, url, mail, versione, updated_at")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { ok: false, error: "Impossibile leggere l'elenco dei siti." };

  const siti = (data ?? []).map((row) => ({
    id: String(row.id),
    nome: String(row.nome ?? ""),
    url: String(row.url ?? ""),
    mail: String(row.mail ?? ""),
    versione: Number(row.versione ?? 1),
    updatedAt: String(row.updated_at ?? ""),
  }));
  const perSito = new Map<string, CaveauAcquistoRiga[]>();
  if (siti.length > 0) {
    const { data: acquisti, error: acqErr } = await db
      .from("caveau_siti_acquisti")
      .select("id, sito_id, url, titolo, descrizione, prezzo, registrato_at, versione, created_at")
      .in(
        "sito_id",
        siti.map((sito) => sito.id)
      )
      .is("deleted_at", null)
      .order("registrato_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (acqErr) return { ok: false, error: "Impossibile leggere gli acquisti." };
    for (const row of acquisti ?? []) {
      const sitoId = String(row.sito_id);
      const lista = perSito.get(sitoId) ?? [];
      const prezzoN = row.prezzo == null || row.prezzo === "" ? null : Number(row.prezzo);
      lista.push({
        id: String(row.id),
        sitoId,
        url: String(row.url ?? ""),
        titolo: String(row.titolo ?? ""),
        descrizione: String(row.descrizione ?? ""),
        prezzo: prezzoN != null && Number.isFinite(prezzoN) ? prezzoN : null,
        registratoAt: row.registrato_at ? String(row.registrato_at) : null,
        versione: Number(row.versione ?? 1),
      });
      perSito.set(sitoId, lista);
    }
  }
  const righe: CaveauSitoRiga[] = siti.map((sito) => ({
    ...sito,
    acquisti: perSito.get(sito.id) ?? [],
  }));
  return { ok: true, righe };
}

export async function creaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const parsed = caveauSitoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  let cifrata: string;
  try {
    cifrata = cifraPasswordCaveau(parsed.data.password);
  } catch {
    return { ok: false, error: configError() };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .insert({
      nome: parsed.data.nome,
      url: parsed.data.url,
      mail: parsed.data.mail,
      password_cifrata: cifrata,
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Registrazione del sito non riuscita." };

  await audita({
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Sito registrato: ${parsed.data.nome}`,
    payload: { nome: parsed.data.nome, url: parsed.data.url, mail: parsed.data.mail },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function aggiornaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const parsed = caveauSitoUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_aziendali")
    .select("id, versione, password_cifrata")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Scheda non trovata." };

  const nuova = parsed.data.password?.trim() ?? "";
  let cifrata = String(current.password_cifrata ?? "");
  if (nuova) {
    try {
      cifrata = cifraPasswordCaveau(nuova);
    } catch {
      return { ok: false, error: configError() };
    }
  }

  const { error } = await db
    .from("caveau_siti_aziendali")
    .update({
      nome: parsed.data.nome,
      url: parsed.data.url,
      mail: parsed.data.mail,
      password_cifrata: cifrata,
      versione: Number(current.versione ?? 1) + 1,
      updated_by: g.actorId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Aggiornamento non riuscito." };

  await audita({
    entityId: parsed.data.id,
    action: "update",
    actorId: g.actorId,
    summary: `Sito aggiornato: ${parsed.data.nome}`,
    payload: {
      nome: parsed.data.nome,
      url: parsed.data.url,
      mail: parsed.data.mail,
      password_sostituita: Boolean(nuova),
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function eliminaCaveauSitoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauEliminaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conferma non valida." };

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, versione")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Scheda non trovata." };

  const nome = String(current.nome ?? "");
  if (parsed.data.conferma !== fraseConfermaSoftDelete(nome)) {
    return { ok: false, error: `Per eliminare scrivi: ${fraseConfermaSoftDelete(nome)}` };
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("caveau_siti_aziendali")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
      versione: Number(current.versione ?? 1) + 1,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Eliminazione non riuscita." };

  const { count: acquistiAperti } = await db
    .from("caveau_siti_acquisti")
    .select("id", { count: "exact", head: true })
    .eq("sito_id", parsed.data.id)
    .is("deleted_at", null);
  const { error: acqErr } = await db
    .from("caveau_siti_acquisti")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
    })
    .eq("sito_id", parsed.data.id)
    .is("deleted_at", null);
  if (acqErr) return { ok: false, error: "Sito archiviato, acquisti non chiusi." };

  await audita({
    entityId: parsed.data.id,
    action: "soft_delete",
    actorId: g.actorId,
    summary: `Sito rimosso dall'elenco: ${nome}`,
    payload: { nome, acquisti_archiviati: acquistiAperti ?? 0 },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function rivelaPasswordCaveauAction(
  input: unknown
): Promise<{ ok: true; password: string } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;
  if (!caveauConfigurato()) return { ok: false, error: configError() };

  const parsed = caveauRivelaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }

  const usati = await tentativiRecenti(g.actorId);
  if (usati === null) {
    return { ok: false, error: "Controllo dei tentativi non disponibile. Riprova." };
  }
  if (usati >= TENTATIVI_MAX) {
    return { ok: false, error: "Troppi codici errati. Riprova tra qualche minuto." };
  }

  if (!codiceCaveauValido(parsed.data.codice)) {
    await audita({
      entityId: parsed.data.id,
      action: "reveal_denied",
      actorId: g.actorId,
      summary: "Codice caveau rifiutato",
      payload: { esito: "codice_errato" },
    });
    return { ok: false, error: "Codice non valido." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id, nome, password_cifrata")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Scheda non trovata." };

  let password: string;
  try {
    password = decifraPasswordCaveau(String(data.password_cifrata ?? ""));
  } catch {
    return { ok: false, error: "Impossibile leggere la password. Controlla la chiave del caveau." };
  }

  await audita({
    entityId: parsed.data.id,
    action: "reveal",
    actorId: g.actorId,
    summary: `Password visualizzata: ${String(data.nome ?? "")}`,
    payload: { nome: String(data.nome ?? "") },
  });
  return { ok: true, password };
}

function campiAcquisto(input: {
  url: string;
  titolo: string;
  descrizione: string;
  prezzo: string;
  registratoAt: string;
}):
  | {
      ok: true;
      url: string;
      titolo: string;
      descrizione: string;
      prezzo: number | null;
      registratoAt: string | null;
    }
  | { ok: false; error: string } {
  const prezzo = prezzoAcquistoOrNull(input.prezzo);
  if (!prezzo.ok) return prezzo;
  const quando = registratoAtOrNull(input.registratoAt);
  if (!quando.ok) return quando;
  return {
    ok: true,
    url: input.url,
    titolo: input.titolo,
    descrizione: input.descrizione,
    prezzo: prezzo.value,
    registratoAt: quando.value,
  };
}

async function sitoVivo(sitoId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_aziendali")
    .select("id")
    .eq("id", sitoId)
    .is("deleted_at", null)
    .maybeSingle();
  return !error && Boolean(data);
}

export async function creaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauAcquistoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const campi = campiAcquisto(parsed.data);
  if (!campi.ok) return campi;
  if (!(await sitoVivo(parsed.data.sitoId))) {
    return { ok: false, error: "Sito non trovato." };
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("caveau_siti_acquisti")
    .insert({
      sito_id: parsed.data.sitoId,
      url: campi.url,
      titolo: campi.titolo,
      descrizione: campi.descrizione,
      prezzo: campi.prezzo,
      registrato_at: campi.registratoAt,
      created_by: g.actorId,
      updated_by: g.actorId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: "Registrazione dell'acquisto non riuscita." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: String(data.id),
    action: "create",
    actorId: g.actorId,
    summary: `Acquisto registrato: ${campi.titolo}`,
    payload: {
      sito_id: parsed.data.sitoId,
      url: campi.url,
      titolo: campi.titolo,
      prezzo: campi.prezzo,
      registrato_at: campi.registratoAt,
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function aggiornaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauAcquistoUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const campi = campiAcquisto(parsed.data);
  if (!campi.ok) return campi;

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_acquisti")
    .select("id, versione, sito_id")
    .eq("id", parsed.data.id)
    .eq("sito_id", parsed.data.sitoId)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Acquisto non trovato." };

  const { error } = await db
    .from("caveau_siti_acquisti")
    .update({
      url: campi.url,
      titolo: campi.titolo,
      descrizione: campi.descrizione,
      prezzo: campi.prezzo,
      registrato_at: campi.registratoAt,
      versione: Number(current.versione ?? 1) + 1,
      updated_by: g.actorId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Aggiornamento dell'acquisto non riuscito." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: parsed.data.id,
    action: "update",
    actorId: g.actorId,
    summary: `Acquisto aggiornato: ${campi.titolo}`,
    payload: {
      sito_id: parsed.data.sitoId,
      url: campi.url,
      titolo: campi.titolo,
      prezzo: campi.prezzo,
      registrato_at: campi.registratoAt,
    },
  });
  revalidatePath(PATH);
  return { ok: true };
}

export async function eliminaCaveauAcquistoAction(
  input: unknown
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await gate();
  if (!g.ok) return g;

  const parsed = caveauEliminaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Conferma non valida." };

  const db = createServiceClient();
  const { data: current, error: readErr } = await db
    .from("caveau_siti_acquisti")
    .select("id, titolo, versione")
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readErr || !current) return { ok: false, error: "Acquisto non trovato." };

  const titolo = String(current.titolo ?? "");
  if (parsed.data.conferma !== fraseConfermaSoftDelete(titolo)) {
    return { ok: false, error: `Per eliminare scrivi: ${fraseConfermaSoftDelete(titolo)}` };
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("caveau_siti_acquisti")
    .update({
      deleted_at: now,
      deleted_by: g.actorId,
      updated_by: g.actorId,
      versione: Number(current.versione ?? 1) + 1,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null);
  if (error) return { ok: false, error: "Eliminazione dell'acquisto non riuscita." };

  await audita({
    entityType: ENTITY_ACQUISTO,
    entityId: parsed.data.id,
    action: "soft_delete",
    actorId: g.actorId,
    summary: `Acquisto rimosso: ${titolo}`,
    payload: { titolo },
  });
  revalidatePath(PATH);
  return { ok: true };
}
