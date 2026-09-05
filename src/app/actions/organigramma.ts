"use server";

import { notFound, redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess } from "@/lib/areas/guard";
import { isAdminLikeProfile, isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext, userCanAccessArea } from "@/lib/auth/session";
import {
  attivitaPersonaFilterSchema,
  mansioneInputSchema,
  mansioneUpdateSchema,
  permessoInputSchema,
  personaInputSchema,
  personaUpdateSchema,
  repartoInputSchema,
  repartoUpdateSchema,
  treeMoveSchema,
  treeReorderSchema,
  calcolaScadenzaCertificato,
  certificatoAlertLivello,
  permessoTipoLabel,
  type CertificatoScadenzaAlert,
  type OrganigrammaAttivita,
  type OrganigrammaCertificatoCatalogo,
  type OrganigrammaDocumento,
  type OrganigrammaDocTipo,
  type OrganigrammaMansione,
  type OrganigrammaPermesso,
  type OrganigrammaPersona,
  type OrganigrammaReparto,
  type PersonaMinima,
  type PostoAutorizzato,
  type PostoOrganigrammaOption,
} from "@/lib/amministrazione/organigramma";
import { eventoLineaLabel } from "@/lib/produzione/macchinari";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "organigramma-docs";
const PERSONA_COLS =
  "id, nome, cognome, codice_fiscale, carta_identita, user_id, parent_id, sort_order, foto_path, documento_stato, note, reparto_id, in_forza, cessato_at";

const DOC_COLS =
  "id, persona_id, tipo, titolo, periodo, note, file_name, mime, created_at, certificato_catalogo_id, data_rilascio, validita_anni, data_scadenza";

type PersonaRow = {
  id: string;
  nome: string;
  cognome: string;
  codice_fiscale: string;
  carta_identita: string;
  user_id: string | null;
  parent_id: string | null;
  sort_order: number;
  foto_path: string | null;
  documento_stato: OrganigrammaPersona["documentoStato"];
  note: string;
  reparto_id?: string | null;
  in_forza?: boolean;
  cessato_at?: string | null;
};

type DocumentoRow = {
  id: string;
  persona_id: string;
  tipo: OrganigrammaDocTipo;
  titolo: string;
  periodo: string;
  note: string;
  file_name: string;
  mime: string;
  created_at: string;
  certificato_catalogo_id?: string | null;
  data_rilascio?: string | null;
  validita_anni?: number | null;
  data_scadenza?: string | null;
};

async function requireAmmOrProd() {
  const auth = await getAuthContext();
  if (!auth) redirect("/login");
  if (!auth.isSecondFactorVerified) redirect("/verify-email");
  const ok =
    userCanAccessArea(auth.areas, "amministrazione") ||
    userCanAccessArea(auth.areas, "produzione") ||
    isSuperadminProfile(auth.profile);
  if (!ok) notFound();
  return auth;
}

function actorNome(profile: { full_name?: string | null; email?: string }): string {
  return profile.full_name?.trim() || profile.email || "Operatore";
}

function mapPersona(
  row: PersonaRow,
  mansioni: OrganigrammaMansione[] = [],
  fotoUrl: string | null = null,
  repartoNome = ""
): OrganigrammaPersona {
  return {
    id: row.id,
    nome: row.nome,
    cognome: row.cognome,
    codiceFiscale: row.codice_fiscale ?? "",
    cartaIdentita: row.carta_identita ?? "",
    userId: row.user_id,
    parentId: row.parent_id,
    sortOrder: row.sort_order ?? 100,
    fotoPath: row.foto_path,
    fotoUrl,
    documentoStato: row.documento_stato,
    note: row.note ?? "",
    repartoId: row.reparto_id ?? null,
    repartoNome,
    inForza: row.in_forza !== false,
    cessatoAt: row.cessato_at ?? null,
    mansioni,
  };
}

function mapDocumento(row: DocumentoRow): OrganigrammaDocumento {
  return {
    id: row.id,
    personaId: row.persona_id,
    tipo: row.tipo,
    titolo: row.titolo,
    periodo: row.periodo,
    note: row.note,
    fileName: row.file_name,
    mime: row.mime ?? "",
    createdAt: row.created_at,
    catalogoId: row.certificato_catalogo_id ?? null,
    dataRilascio: row.data_rilascio ?? null,
    validitaAnni: row.validita_anni ?? null,
    dataScadenza: row.data_scadenza ?? null,
  };
}

function slugCatalogo(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function resolveCertificatoCatalogo(input: {
  titolo: string;
  validitaAnni: number;
  actorId: string;
}): Promise<
  { success: true; item: OrganigrammaCertificatoCatalogo } | { success: false; error: string }
> {
  const nome = input.titolo.trim();
  if (!nome) return { success: false, error: "Titolo certificato obbligatorio." };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organigramma_certificati_catalogo")
    .select("id, codice, nome, descrizione, validita_anni_default")
    .filter("nome", "ilike", nome.replace(/[%_\\]/g, "\\$&"))
    .is("deleted_at", null)
    .maybeSingle();
  if (existing) {
    const row = existing as {
      id: string;
      codice: string;
      nome: string;
      descrizione: string;
      validita_anni_default: number;
    };
    return {
      success: true,
      item: {
        id: row.id,
        codice: row.codice,
        nome: row.nome,
        descrizione: row.descrizione,
        validitaAnniDefault: row.validita_anni_default,
      },
    };
  }
  const baseCodice = slugCatalogo(nome) || `c-${Date.now()}`;
  const { data: codeClash } = await supabase
    .from("organigramma_certificati_catalogo")
    .select("id")
    .eq("codice", baseCodice)
    .is("deleted_at", null)
    .maybeSingle();
  const codice = codeClash
    ? `${baseCodice}-${Date.now().toString(36)}`.slice(0, 80)
    : baseCodice;
  const { data, error } = await supabase
    .from("organigramma_certificati_catalogo")
    .insert({
      codice,
      nome,
      validita_anni_default: input.validitaAnni,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id, codice, nome, descrizione, validita_anni_default")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio titolo certificato fallito." };
  }
  const row = data as {
    id: string;
    codice: string;
    nome: string;
    descrizione: string;
    validita_anni_default: number;
  };
  await writeAuditLog({
    entity_type: "organigramma_certificati_catalogo",
    entity_id: row.id,
    action: "create",
    actor_id: input.actorId,
    summary: `Catalogo certificato ${row.nome}`,
  });
  return {
    success: true,
    item: {
      id: row.id,
      codice: row.codice,
      nome: row.nome,
      descrizione: row.descrizione,
      validitaAnniDefault: row.validita_anni_default,
    },
  };
}

async function loadRepartiById(): Promise<Map<string, OrganigrammaReparto>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organigramma_reparti")
    .select("id, codice, nome, descrizione")
    .is("deleted_at", null);
  return new Map(
    ((data ?? []) as OrganigrammaReparto[]).map((r) => [r.id, r])
  );
}

async function recordAttivita(input: {
  personaId: string;
  azione: string;
  actorId: string;
  actorNome: string;
  note: string;
}) {
  const supabase = await createClient();
  await supabase.from("organigramma_attivita").insert({
    persona_id: input.personaId,
    azione: input.azione,
    origine: "scheda",
    actor_nome: input.actorNome,
    note: input.note,
    created_by: input.actorId,
  });
}

async function signedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

async function signedUrls(
  paths: Array<string | null | undefined>
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!unique.length) return map;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(unique, 60 * 60);
  (data ?? []).forEach((row, i) => {
    const path = row.path || unique[i];
    if (path && row.signedUrl) map.set(path, row.signedUrl);
  });
  return map;
}

async function loadMansioniFor(ids: string[]): Promise<Map<string, OrganigrammaMansione[]>> {
  const map = new Map<string, OrganigrammaMansione[]>();
  if (!ids.length) return map;
  const supabase = await createClient();
  const { data } = await supabase
    .from("organigramma_persona_mansioni")
    .select("persona_id, mansione:organigramma_mansioni(id, codice, nome, descrizione)")
    .in("persona_id", ids)
    .is("deleted_at", null);
  for (const row of (data ?? []) as Array<{
    persona_id: string;
    mansione: OrganigrammaMansione | OrganigrammaMansione[] | null;
  }>) {
    const m = Array.isArray(row.mansione) ? row.mansione[0] : row.mansione;
    if (!m) continue;
    const list = map.get(row.persona_id) ?? [];
    list.push(m);
    map.set(row.persona_id, list);
  }
  return map;
}

async function setMansioni(
  personaId: string,
  mansioneIds: string[],
  actorId: string
) {
  const supabase = await createClient();
  const { data: current } = await supabase
    .from("organigramma_persona_mansioni")
    .select("id, mansione_id")
    .eq("persona_id", personaId)
    .is("deleted_at", null);
  const have = new Set(
    ((current ?? []) as Array<{ mansione_id: string }>).map((r) => r.mansione_id)
  );
  const want = new Set(mansioneIds);
  const now = new Date().toISOString();
  for (const row of (current ?? []) as Array<{ id: string; mansione_id: string }>) {
    if (!want.has(row.mansione_id)) {
      await supabase
        .from("organigramma_persona_mansioni")
        .update({ deleted_at: now, deleted_by: actorId })
        .eq("id", row.id);
    }
  }
  for (const id of mansioneIds) {
    if (have.has(id)) continue;
    await supabase.from("organigramma_persona_mansioni").insert({
      persona_id: personaId,
      mansione_id: id,
      created_by: actorId,
    });
  }
}

export async function listMansioniAction(): Promise<
  | { success: true; items: OrganigrammaMansione[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_mansioni")
    .select("id, codice, nome, descrizione")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: (data ?? []) as OrganigrammaMansione[] };
}

export async function createMansioneAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaMansione } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può creare mansioni." };
  }
  const parsed = mansioneInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const codice = parsed.data.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_mansioni")
    .insert({
      codice: codice || `m-${Date.now()}`,
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice, nome, descrizione")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio mansione fallito." };
  }
  await writeAuditLog({
    entity_type: "organigramma_mansioni",
    entity_id: (data as OrganigrammaMansione).id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creata mansione ${parsed.data.nome}`,
  });
  return { success: true, item: data as OrganigrammaMansione };
}

export async function updateMansioneAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaMansione } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può modificare le mansioni." };
  }
  const parsed = mansioneUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_mansioni")
    .update({
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione ?? "",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("id, codice, nome, descrizione")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento mansione fallito." };
  }
  await writeAuditLog({
    entity_type: "organigramma_mansioni",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornata mansione ${parsed.data.nome}`,
  });
  return { success: true, item: data as OrganigrammaMansione };
}

export async function softDeleteMansioneAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può eliminare le mansioni." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("organigramma_mansioni")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await supabase
    .from("organigramma_persona_mansioni")
    .update({ deleted_at: now, deleted_by: auth.userId })
    .eq("mansione_id", id)
    .is("deleted_at", null);
  await writeAuditLog({
    entity_type: "organigramma_mansioni",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete mansione organigramma",
  });
  return { success: true };
}

export async function listRepartiAction(): Promise<
  | { success: true; items: OrganigrammaReparto[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_reparti")
    .select("id, codice, nome, descrizione")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return { success: true, items: (data ?? []) as OrganigrammaReparto[] };
}

export async function createRepartoAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaReparto } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può creare reparti." };
  }
  const parsed = repartoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const codice = parsed.data.nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_reparti")
    .insert({
      codice: codice || `r-${Date.now()}`,
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, codice, nome, descrizione")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio reparto fallito." };
  }
  await writeAuditLog({
    entity_type: "organigramma_reparti",
    entity_id: (data as OrganigrammaReparto).id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato reparto ${parsed.data.nome}`,
  });
  return { success: true, item: data as OrganigrammaReparto };
}

export async function updateRepartoAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaReparto } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può modificare i reparti." };
  }
  const parsed = repartoUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_reparti")
    .update({
      nome: parsed.data.nome,
      descrizione: parsed.data.descrizione ?? "",
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.id)
    .is("deleted_at", null)
    .select("id, codice, nome, descrizione")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Aggiornamento reparto fallito." };
  }
  await writeAuditLog({
    entity_type: "organigramma_reparti",
    entity_id: parsed.data.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato reparto ${parsed.data.nome}`,
  });
  return { success: true, item: data as OrganigrammaReparto };
}

export async function softDeleteRepartoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può eliminare i reparti." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("organigramma_reparti")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await supabase
    .from("organigramma_persone")
    .update({
      reparto_id: null,
      updated_by: auth.userId,
    })
    .eq("reparto_id", id)
    .is("deleted_at", null);
  await writeAuditLog({
    entity_type: "organigramma_reparti",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete reparto organigramma",
  });
  return { success: true };
}

export async function listCertificatiCatalogoAction(): Promise<
  | { success: true; items: OrganigrammaCertificatoCatalogo[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_certificati_catalogo")
    .select("id, codice, nome, descrizione, validita_anni_default")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      codice: string;
      nome: string;
      descrizione: string;
      validita_anni_default: number;
    }>).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      descrizione: r.descrizione,
      validitaAnniDefault: r.validita_anni_default,
    })),
  };
}

export async function setOperatoreInForzaAction(
  personaId: string,
  inForza: boolean
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può cambiare lo stato in azienda." };
  }
  const now = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase
    .from("organigramma_persone")
    .update({
      in_forza: inForza,
      cessato_at: inForza ? null : now,
      cessato_by: inForza ? null : auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", personaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await recordAttivita({
    personaId,
    azione: "cessazione",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: inForza ? "Operatore dichiarato di nuovo in forza" : "Operatore dichiarato non più in azienda",
  });
  await writeAuditLog({
    entity_type: "organigramma_persone",
    entity_id: personaId,
    action: inForza ? "ripresa_servizio" : "cessazione",
    actor_id: auth.userId,
    summary: inForza
      ? "Operatore di nuovo in forza"
      : "Operatore dichiarato non più in azienda",
  });
  return { success: true };
}

export async function listCertificatiInScadenzaAction(): Promise<
  | { success: true; items: CertificatoScadenzaAlert[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_documenti")
    .select(
      `${DOC_COLS}, persona:organigramma_persone(id, nome, cognome, in_forza, deleted_at)`
    )
    .in("tipo", ["corso", "certificato"])
    .is("deleted_at", null)
    .not("data_scadenza", "is", null);
  if (error) return { success: false, error: error.message };

  type Joined = DocumentoRow & {
    persona:
      | {
          id: string;
          nome: string;
          cognome: string;
          in_forza: boolean;
          deleted_at: string | null;
        }
      | {
          id: string;
          nome: string;
          cognome: string;
          in_forza: boolean;
          deleted_at: string | null;
        }[]
      | null;
  };

  const current = new Map<string, { doc: DocumentoRow; personaNome: string }>();
  for (const raw of (data ?? []) as unknown as Joined[]) {
    const persona = Array.isArray(raw.persona) ? raw.persona[0] : raw.persona;
    if (!persona || persona.deleted_at || persona.in_forza === false) continue;
    const key = `${raw.persona_id}:${raw.certificato_catalogo_id ?? raw.titolo.toLowerCase()}`;
    const prev = current.get(key);
    const rel = raw.data_rilascio ?? raw.created_at;
    const prevRel = prev
      ? (prev.doc.data_rilascio ?? prev.doc.created_at)
      : "";
    if (!prev || rel > prevRel) {
      current.set(key, {
        doc: raw,
        personaNome: `${persona.cognome} ${persona.nome}`.trim(),
      });
    }
  }

  const items: CertificatoScadenzaAlert[] = [];
  for (const { doc, personaNome } of current.values()) {
    if (!doc.data_scadenza) continue;
    const livello = certificatoAlertLivello(doc.data_scadenza);
    if (!livello) continue;
    items.push({
      personaId: doc.persona_id,
      personaNome,
      documentoId: doc.id,
      titolo: doc.titolo,
      dataScadenza: doc.data_scadenza,
      livello,
    });
  }
  const rank = { scaduto: 0, mese: 1, "3mesi": 2, "6mesi": 3 };
  items.sort(
    (a, b) =>
      rank[a.livello] - rank[b.livello] ||
      a.dataScadenza.localeCompare(b.dataScadenza)
  );
  return { success: true, items };
}

export async function listPersoneAction(): Promise<
  | { success: true; items: OrganigrammaPersona[]; isAdmin: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .select(PERSONA_COLS)
    .is("deleted_at", null)
    .order("cognome", { ascending: true });
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as PersonaRow[];
  const [mansioni, reparti, fotoMap] = await Promise.all([
    loadMansioniFor(rows.map((r) => r.id)),
    loadRepartiById(),
    signedUrls(rows.map((r) => r.foto_path)),
  ]);
  return {
    success: true,
    isAdmin: isAdminLikeProfile(auth.profile),
    items: rows.map((r) =>
      mapPersona(
        r,
        mansioni.get(r.id) ?? [],
        r.foto_path ? (fotoMap.get(r.foto_path) ?? null) : null,
        r.reparto_id ? (reparti.get(r.reparto_id)?.nome ?? "") : ""
      )
    ),
  };
}

export async function listPersoneMinimeAction(): Promise<
  | { success: true; items: PersonaMinima[]; isAdmin: boolean }
  | { success: false; error: string }
> {
  const auth = await requireAmmOrProd();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .select("id, nome, cognome")
    .is("deleted_at", null)
    .order("cognome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    isAdmin: isAdminLikeProfile(auth.profile),
    items: (data ?? []) as PersonaMinima[],
  };
}

export async function listPostiOrganigrammaAction(): Promise<
  | { success: true; items: PostoOrganigrammaOption[] }
  | { success: false; error: string }
> {
  await requireAmmOrProd();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produzione_posti_lavoro")
    .select("id, nome, area:produzione_aree(nome)")
    .is("deleted_at", null)
    .order("nome", { ascending: true });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      nome: string;
      area: { nome: string } | { nome: string }[] | null;
    }>).map((r) => {
      const area = Array.isArray(r.area) ? r.area[0] : r.area;
      return {
        id: r.id,
        nome: r.nome,
        areaNome: area?.nome ?? "",
      };
    }),
  };
}

export async function getPersonaAction(
  id: string
): Promise<
  | { success: true; item: OrganigrammaPersona; isAdmin: boolean }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .select(PERSONA_COLS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Operatore non trovato." };
  }
  const row = data as PersonaRow;
  const [mansioni, reparti] = await Promise.all([
    loadMansioniFor([row.id]),
    loadRepartiById(),
  ]);
  return {
    success: true,
    isAdmin: isAdminLikeProfile(auth.profile),
    item: mapPersona(
      row,
      mansioni.get(row.id) ?? [],
      await signedUrl(row.foto_path),
      row.reparto_id ? (reparti.get(row.reparto_id)?.nome ?? "") : ""
    ),
  };
}

export async function createPersonaAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaPersona } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può aggiungere operatori." };
  }
  const parsed = personaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .insert({
      nome: v.nome,
      cognome: v.cognome,
      codice_fiscale: v.codiceFiscale ?? "",
      carta_identita: v.cartaIdentita ?? "",
      note: v.note ?? "",
      parent_id: v.parentId ?? null,
      reparto_id: v.repartoId ?? null,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(PERSONA_COLS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Codice fiscale già presente." };
    }
    return { success: false, error: error?.message ?? "Salvataggio fallito." };
  }
  const row = data as PersonaRow;
  await setMansioni(row.id, v.mansioneIds ?? [], auth.userId);
  await recordAttivita({
    personaId: row.id,
    azione: "create",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: `Creata anagrafica ${v.cognome} ${v.nome}`,
  });
  await writeAuditLog({
    entity_type: "organigramma_persone",
    entity_id: row.id,
    action: "create",
    actor_id: auth.userId,
    summary: `Creato operatore ${v.cognome} ${v.nome}`,
  });
  const [mansioni, reparti] = await Promise.all([
    loadMansioniFor([row.id]),
    loadRepartiById(),
  ]);
  return {
    success: true,
    item: mapPersona(
      row,
      mansioni.get(row.id) ?? [],
      null,
      row.reparto_id ? (reparti.get(row.reparto_id)?.nome ?? "") : ""
    ),
  };
}

export async function updatePersonaAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaPersona } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può modificare gli operatori." };
  }
  const parsed = personaUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .update({
      nome: v.nome,
      cognome: v.cognome,
      codice_fiscale: v.codiceFiscale ?? "",
      carta_identita: v.cartaIdentita ?? "",
      note: v.note ?? "",
      reparto_id: v.repartoId ?? null,
      updated_by: auth.userId,
    })
    .eq("id", v.id)
    .is("deleted_at", null)
    .select(PERSONA_COLS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return { success: false, error: "Codice fiscale già presente." };
    }
    return { success: false, error: error?.message ?? "Aggiornamento fallito." };
  }
  await setMansioni(v.id, v.mansioneIds ?? [], auth.userId);
  await recordAttivita({
    personaId: v.id,
    azione: "update",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: "Aggiornata anagrafica",
  });
  await writeAuditLog({
    entity_type: "organigramma_persone",
    entity_id: v.id,
    action: "update",
    actor_id: auth.userId,
    summary: `Aggiornato operatore ${v.cognome} ${v.nome}`,
  });
  const row = data as PersonaRow;
  const [mansioni, reparti] = await Promise.all([
    loadMansioniFor([row.id]),
    loadRepartiById(),
  ]);
  return {
    success: true,
    item: mapPersona(
      row,
      mansioni.get(row.id) ?? [],
      await signedUrl(row.foto_path),
      row.reparto_id ? (reparti.get(row.reparto_id)?.nome ?? "") : ""
    ),
  };
}

export async function softDeletePersonaAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può eliminare operatori." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("organigramma_persone")
    .update({
      deleted_at: now,
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await supabase
    .from("organigramma_persone")
    .update({ parent_id: null, updated_by: auth.userId })
    .eq("parent_id", id)
    .is("deleted_at", null);
  await recordAttivita({
    personaId: id,
    azione: "delete",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: "Operatore rimosso (soft delete)",
  });
  await writeAuditLog({
    entity_type: "organigramma_persone",
    entity_id: id,
    action: "soft_delete",
    actor_id: auth.userId,
    summary: "Soft delete persona organigramma",
  });
  return { success: true };
}

export async function importPersoneDaProfiliAction(): Promise<
  { success: true; created: number } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può importare i profili." };
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("organigramma_persone")
    .select("user_id")
    .is("deleted_at", null)
    .not("user_id", "is", null);
  const used = new Set(
    ((existing ?? []) as Array<{ user_id: string }>).map((r) => r.user_id)
  );
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, full_name, job_title");
  if (error) return { success: false, error: error.message };
  const { data: mansioni } = await supabase
    .from("organigramma_mansioni")
    .select("id, nome")
    .is("deleted_at", null);
  const byNome = new Map(
    ((mansioni ?? []) as Array<{ id: string; nome: string }>).map((m) => [
      m.nome.toLowerCase(),
      m.id,
    ])
  );
  let created = 0;
  for (const p of (profiles ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    full_name: string | null;
    job_title: string;
  }>) {
    if (used.has(p.id)) continue;
    const nome = p.first_name.trim() || (p.full_name ?? "").split(" ")[0] || "Nome";
    const cognome =
      p.last_name.trim() ||
      (p.full_name ?? "").split(" ").slice(1).join(" ") ||
      "Cognome";
    const { data } = await supabase
      .from("organigramma_persone")
      .insert({
        nome,
        cognome,
        user_id: p.id,
        created_by: auth.userId,
        updated_by: auth.userId,
      })
      .select("id")
      .single();
    if (!data) continue;
    const personaId = (data as { id: string }).id;
    const mid = p.job_title ? byNome.get(p.job_title.toLowerCase()) : null;
    if (mid) {
      await supabase.from("organigramma_persona_mansioni").insert({
        persona_id: personaId,
        mansione_id: mid,
        created_by: auth.userId,
      });
    }
    await recordAttivita({
      personaId,
      azione: "import_profile",
      actorId: auth.userId,
      actorNome: actorNome(auth.profile),
      note: "Importata da profilo gestionale",
    });
    created += 1;
  }
  return { success: true, created };
}

export async function movePersonaTreeAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può modificare l’albero." };
  }
  const parsed = treeMoveSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Spostamento non valido." };
  }
  if (parsed.data.parentId === parsed.data.personaId) {
    return { success: false, error: "Un operatore non può dipendere da sé stesso." };
  }
  const supabase = await createClient();
  if (parsed.data.parentId) {
    let cursor: string | null = parsed.data.parentId;
    const seen = new Set<string>([parsed.data.personaId]);
    for (let i = 0; i < 40 && cursor; i++) {
      if (seen.has(cursor)) {
        return { success: false, error: "Lo spostamento creerebbe un ciclo." };
      }
      seen.add(cursor);
      const parentLookup = await supabase
        .from("organigramma_persone")
        .select("parent_id")
        .eq("id", cursor)
        .is("deleted_at", null)
        .maybeSingle();
      const parentRow = parentLookup.data as { parent_id: string | null } | null;
      cursor = parentRow?.parent_id ?? null;
    }
  }
  const { error } = await supabase
    .from("organigramma_persone")
    .update({
      parent_id: parsed.data.parentId,
      sort_order: parsed.data.sortOrder ?? 100,
      updated_by: auth.userId,
    })
    .eq("id", parsed.data.personaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await recordAttivita({
    personaId: parsed.data.personaId,
    azione: "albero",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: parsed.data.parentId
      ? "Spostata nell’albero organigramma"
      : "Riportata a primo livello",
  });
  return { success: true };
}

export async function reorderPersoneAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può riordinare l’albero." };
  }
  const parsed = treeReorderSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Ordine non valido." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_persone")
    .select("id, parent_id")
    .in("id", parsed.data.orderedIds)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const rows = (data ?? []) as Array<{ id: string; parent_id: string | null }>;
  if (rows.length !== parsed.data.orderedIds.length) {
    return { success: false, error: "Alcuni operatori non sono più disponibili." };
  }
  const sameLevel = rows.every((r) => r.parent_id === parsed.data.parentId);
  if (!sameLevel) {
    return { success: false, error: "Si possono riordinare solo operatori allo stesso livello." };
  }
  for (let i = 0; i < parsed.data.orderedIds.length; i++) {
    const { error: upErr } = await supabase
      .from("organigramma_persone")
      .update({
        sort_order: (i + 1) * 10,
        updated_by: auth.userId,
      })
      .eq("id", parsed.data.orderedIds[i])
      .is("deleted_at", null);
    if (upErr) return { success: false, error: upErr.message };
  }
  await writeAuditLog({
    entity_type: "organigramma_persone",
    entity_id: parsed.data.orderedIds[0] ?? "",
    action: "reorder",
    actor_id: auth.userId,
    summary: "Riordinati operatori nello stesso livello dell’albero",
    payload: { parent_id: parsed.data.parentId, ids: parsed.data.orderedIds },
  });
  await recordAttivita({
    personaId: parsed.data.orderedIds[0] ?? "",
    azione: "albero",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: "Riordinata la posizione nello stesso livello dell’albero",
  });
  return { success: true };
}

export async function uploadPersonaFotoAction(
  formData: FormData
): Promise<
  { success: true; url: string } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può caricare la foto." };
  }
  const personaId = String(formData.get("personaId") ?? "");
  const file = formData.get("file");
  if (!personaId || !(file instanceof File) || file.size === 0) {
    return { success: false, error: "File o operatore mancanti." };
  }
  if (file.size > 6 * 1024 * 1024) {
    return { success: false, error: "Foto troppo grande (max 6 MB)." };
  }
  const mime = file.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return { success: false, error: "Usa JPG, PNG o WebP." };
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${personaId}/foto/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (upErr) return { success: false, error: upErr.message };
  const { error } = await supabase
    .from("organigramma_persone")
    .update({ foto_path: path, updated_by: auth.userId })
    .eq("id", personaId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  await recordAttivita({
    personaId,
    azione: "foto",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: "Aggiornata foto",
  });
  const url = await signedUrl(path);
  return { success: true, url: url ?? "" };
}

export async function uploadPersonaDocumentoAction(
  formData: FormData
): Promise<
  { success: true; item: OrganigrammaDocumento } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può caricare documenti." };
  }
  const personaId = String(formData.get("personaId") ?? "");
  const tipo = String(formData.get("tipo") ?? "") as OrganigrammaDocTipo;
  const titolo = String(formData.get("titolo") ?? "").trim();
  const catalogoIdRaw = String(formData.get("catalogoId") ?? "").trim();
  const periodo = String(formData.get("periodo") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const dataRilascio = String(formData.get("dataRilascio") ?? "").trim();
  const validitaAnniRaw = String(formData.get("validitaAnni") ?? "").trim();
  const file = formData.get("file");
  if (!personaId || !(file instanceof File) || file.size === 0) {
    return { success: false, error: "File o operatore mancanti." };
  }
  if (!ORGANIGRAMMA_DOC_TIPI_SET.has(tipo)) {
    return { success: false, error: "Tipo documento non valido." };
  }
  if (file.size > 15 * 1024 * 1024) {
    return { success: false, error: "File troppo grande (max 15 MB)." };
  }
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ];
  if (!allowed.includes(file.type)) {
    return { success: false, error: "Formato ammesso: PDF, JPG, PNG, WebP." };
  }
  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "image/webp"
          ? "webp"
          : "jpg";
  const isCert = tipo === "corso" || tipo === "certificato";
  let catalogoId: string | null = catalogoIdRaw || null;
  let titoloFinale = titolo || tipo;
  let dataRilascioVal: string | null = null;
  let validitaAnni: number | null = null;
  let dataScadenza: string | null = null;
  if (isCert) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataRilascio)) {
      return { success: false, error: "Data di rilascio obbligatoria." };
    }
    const anni = Number(validitaAnniRaw);
    if (!Number.isInteger(anni) || anni < 1 || anni > 30) {
      return { success: false, error: "Validità: indica gli anni (1–30)." };
    }
    if (!titoloFinale || titoloFinale === tipo) {
      return { success: false, error: "Seleziona o inserisci il titolo del certificato." };
    }
    const cat = await resolveCertificatoCatalogo({
      titolo: titoloFinale,
      validitaAnni: anni,
      actorId: auth.userId,
    });
    if (!cat.success) return cat;
    catalogoId = cat.item.id;
    titoloFinale = cat.item.nome;
    dataRilascioVal = dataRilascio;
    validitaAnni = anni;
    dataScadenza = calcolaScadenzaCertificato(dataRilascio, anni);
  }
  const path = `${personaId}/${tipo}/${crypto.randomUUID()}.${ext}`;
  const supabase = await createClient();
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { success: false, error: upErr.message };
  const { data, error } = await supabase
    .from("organigramma_documenti")
    .insert({
      persona_id: personaId,
      tipo,
      titolo: titoloFinale,
      periodo,
      note,
      storage_path: path,
      file_name: file.name,
      mime: file.type,
      certificato_catalogo_id: catalogoId,
      data_rilascio: dataRilascioVal,
      validita_anni: validitaAnni,
      data_scadenza: dataScadenza,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select(DOC_COLS)
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio documento fallito." };
  }
  await recordAttivita({
    personaId,
    azione: tipo === "busta_paga" ? "busta" : isCert ? "certificato" : "documento",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: dataScadenza
      ? `Caricato ${titoloFinale} (scade ${dataScadenza})`
      : `Caricato ${titoloFinale}`,
  });
  await writeAuditLog({
    entity_type: "organigramma_documenti",
    entity_id: (data as { id: string }).id,
    action: "create",
    actor_id: auth.userId,
    summary: `Documento ${tipo} ${titoloFinale} per operatore ${personaId}`,
  });
  return { success: true, item: mapDocumento(data as DocumentoRow) };
}

const ORGANIGRAMMA_DOC_TIPI_SET = new Set([
  "cf_fronte",
  "cf_retro",
  "ci_fronte",
  "ci_retro",
  "corso",
  "certificato",
  "busta_paga",
  "altro",
]);

export async function listPersonaDocumentiAction(
  personaId: string
): Promise<
  { success: true; items: OrganigrammaDocumento[] } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_documenti")
    .select(DOC_COLS)
    .eq("persona_id", personaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as DocumentoRow[]).map(mapDocumento),
  };
}

export async function getDocumentoUrlAction(
  id: string,
  purpose: "preview" | "download" = "preview"
): Promise<
  | { success: true; url: string; fileName: string; mime: string }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_documenti")
    .select("storage_path, persona_id, tipo, file_name, mime")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Documento non trovato." };
  }
  const row = data as {
    storage_path: string;
    persona_id: string;
    tipo: string;
    file_name: string;
    mime: string;
  };
  await writeAuditLog({
    entity_type: "organigramma_documenti",
    entity_id: id,
    action: purpose === "download" ? "download" : "view",
    actor_id: auth.userId,
    summary:
      purpose === "download"
        ? `Scaricato documento ${row.tipo}`
        : `Anteprima documento ${row.tipo}`,
    payload: { persona_id: row.persona_id },
  });
  const url = await signedUrl(row.storage_path);
  if (!url) return { success: false, error: "URL documento non disponibile." };
  return {
    success: true,
    url,
    fileName: row.file_name || "documento",
    mime: row.mime ?? "",
  };
}

export async function softDeleteDocumentoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può rimuovere documenti." };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("organigramma_documenti")
    .select("persona_id, titolo")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("organigramma_documenti")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const personaId = (data as { persona_id?: string } | null)?.persona_id;
  if (personaId) {
    await recordAttivita({
      personaId,
      azione: "documento",
      actorId: auth.userId,
      actorNome: actorNome(auth.profile),
      note: `Rimosso ${(data as { titolo?: string }).titolo ?? "documento"}`,
    });
  }
  return { success: true };
}

function relField(
  raw: { nome?: string; codice?: string } | { nome?: string; codice?: string }[] | null | undefined,
  key: "nome" | "codice"
): string {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row?.[key] ?? "";
}

function inDateRange(iso: string, from?: string, to?: string): boolean {
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

export async function listPersonaAttivitaAction(
  raw: unknown
): Promise<
  | { success: true; items: OrganigrammaAttivita[]; linkedLogin: boolean }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = attivitaPersonaFilterSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Filtri non validi." };
  }
  const personaId = parsed.data.personaId;
  const dateFrom = parsed.data.dateFrom;
  const dateTo = parsed.data.dateTo;
  const filtroAzione = parsed.data.azione;
  const supabase = await createClient();
  const { data: persona, error: pErr } = await supabase
    .from("organigramma_persone")
    .select("id, nome, cognome, user_id")
    .eq("id", personaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pErr || !persona) {
    return { success: false, error: pErr?.message ?? "Operatore non trovato." };
  }
  const userId = (persona as { user_id: string | null }).user_id;
  const actorNome = `${(persona as { cognome: string }).cognome} ${(persona as { nome: string }).nome}`.trim();
  const items: OrganigrammaAttivita[] = [];

  if (userId) {
    const [macchine, eventi, fogli] = await Promise.all([
      supabase
        .from("produzione_macchinario_attivita")
        .select(
          "id, azione, origine, note, created_at, area:produzione_aree(nome), macchinario:produzione_macchinari(nome), foglio:produzione_fogli_lavorazione(codice)"
        )
        .eq("created_by", userId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("produzione_eventi_linea")
        .select(
          "id, tipo, note, started_at, closed_at, started_by, closed_by, area:produzione_aree(nome)"
        )
        .or(`started_by.eq.${userId},closed_by.eq.${userId}`)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(200),
      supabase
        .from("produzione_fogli_lavorazione")
        .select("id, codice, prodotto, started_at, closed_at, created_by, closed_by")
        .or(`created_by.eq.${userId},closed_by.eq.${userId}`)
        .is("deleted_at", null)
        .order("started_at", { ascending: false })
        .limit(200),
    ]);
    if (macchine.error) return { success: false, error: macchine.error.message };
    if (eventi.error) return { success: false, error: eventi.error.message };
    if (fogli.error) return { success: false, error: fogli.error.message };

    for (const r of (macchine.data ?? []) as Array<{
      id: string;
      azione: string;
      origine: string;
      note: string;
      created_at: string;
      area: { nome?: string } | { nome?: string }[] | null;
      macchinario: { nome?: string } | { nome?: string }[] | null;
      foglio: { codice?: string } | { codice?: string }[] | null;
    }>) {
      const azione =
        r.azione === "on"
          ? "entrata_lavorazione"
          : r.azione === "off"
            ? "uscita_lavorazione"
            : r.azione === "arresto"
              ? "arresto"
              : "iot";
      const foglio = relField(r.foglio, "codice");
      items.push({
        id: `mac-${r.id}`,
        personaId,
        azione,
        origine: r.origine || "produzione",
        actorNome,
        note: r.note,
        createdAt: r.created_at,
        areaNome: relField(r.area, "nome"),
        riferimento: [relField(r.macchinario, "nome"), foglio ? `Foglio ${foglio}` : ""]
          .filter(Boolean)
          .join(" · "),
      });
    }

    for (const r of (eventi.data ?? []) as Array<{
      id: string;
      tipo: string;
      note: string;
      started_at: string;
      closed_at: string | null;
      started_by: string | null;
      closed_by: string | null;
      area: { nome?: string } | { nome?: string }[] | null;
    }>) {
      const areaNome = relField(r.area, "nome");
      const titolo = eventoLineaLabel(r.tipo);
      if (r.started_by === userId) {
        items.push({
          id: `ev-start-${r.id}`,
          personaId,
          azione: "evento_linea",
          origine: "evento_linea",
          actorNome,
          note: r.note ? `Avvio ${titolo}. ${r.note}` : `Avvio ${titolo}`,
          createdAt: r.started_at,
          areaNome,
          riferimento: titolo,
        });
      }
      if (r.closed_by === userId && r.closed_at) {
        items.push({
          id: `ev-end-${r.id}`,
          personaId,
          azione: "evento_linea",
          origine: "evento_linea",
          actorNome,
          note: r.note ? `Chiusura ${titolo}. ${r.note}` : `Chiusura ${titolo}`,
          createdAt: r.closed_at,
          areaNome,
          riferimento: titolo,
        });
      }
    }

    for (const r of (fogli.data ?? []) as Array<{
      id: string;
      codice: string;
      prodotto: string;
      started_at: string;
      closed_at: string | null;
      created_by: string | null;
      closed_by: string | null;
    }>) {
      if (r.created_by === userId) {
        items.push({
          id: `fl-open-${r.id}`,
          personaId,
          azione: "foglio",
          origine: "foglio",
          actorNome,
          note: r.prodotto ? `Apertura. ${r.prodotto}` : "Apertura foglio",
          createdAt: r.started_at,
          areaNome: "",
          riferimento: r.codice,
        });
      }
      if (r.closed_by === userId && r.closed_at) {
        items.push({
          id: `fl-close-${r.id}`,
          personaId,
          azione: "foglio",
          origine: "foglio",
          actorNome,
          note: r.prodotto ? `Chiusura. ${r.prodotto}` : "Chiusura foglio",
          createdAt: r.closed_at,
          areaNome: "",
          riferimento: r.codice,
        });
      }
    }
  }

  const { data: permessi, error: permErr } = await supabase
    .from("organigramma_permessi")
    .select("id, tipo, dal, al, note, created_at")
    .eq("persona_id", personaId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (permErr) return { success: false, error: permErr.message };
  for (const r of (permessi ?? []) as Array<{
    id: string;
    tipo: "ferie" | "permesso" | "malattia" | "altro";
    dal: string;
    al: string;
    note: string;
    created_at: string;
  }>) {
    items.push({
      id: `ass-${r.id}`,
      personaId,
      azione: "assenza",
      origine: "presenze",
      actorNome,
      note: r.note,
      createdAt: `${r.dal}T00:00:00`,
      areaNome: "",
      riferimento: `${permessoTipoLabel(r.tipo)} · ${new Date(`${r.dal}T00:00:00`).toLocaleDateString("it-IT")} – ${new Date(`${r.al}T00:00:00`).toLocaleDateString("it-IT")}`,
    });
  }

  const filtered = items
    .filter((row) => inDateRange(row.createdAt, dateFrom, dateTo))
    .filter((row) => !filtroAzione || row.azione === filtroAzione)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 200);

  return { success: true, items: filtered, linkedLogin: Boolean(userId) };
}

export async function createPermessoAction(
  raw: unknown
): Promise<
  { success: true; item: OrganigrammaPermesso } | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può registrare permessi." };
  }
  const parsed = permessoInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const v = parsed.data;
  if (v.al < v.dal) {
    return { success: false, error: "La data di fine precede l’inizio." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_permessi")
    .insert({
      persona_id: v.personaId,
      tipo: v.tipo,
      dal: v.dal,
      al: v.al,
      note: v.note ?? "",
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id, persona_id, tipo, dal, al, note, documento_stato, created_at")
    .single();
  if (error || !data) {
    return { success: false, error: error?.message ?? "Salvataggio permesso fallito." };
  }
  await recordAttivita({
    personaId: v.personaId,
    azione: "permesso",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: `${v.tipo} dal ${v.dal} al ${v.al}`,
  });
  const row = data as {
    id: string;
    persona_id: string;
    tipo: OrganigrammaPermesso["tipo"];
    dal: string;
    al: string;
    note: string;
    documento_stato: OrganigrammaPermesso["documentoStato"];
    created_at: string;
  };
  return {
    success: true,
    item: {
      id: row.id,
      personaId: row.persona_id,
      tipo: row.tipo,
      dal: row.dal,
      al: row.al,
      note: row.note,
      documentoStato: row.documento_stato,
      createdAt: row.created_at,
    },
  };
}

export async function listPermessiAction(
  personaId: string
): Promise<
  { success: true; items: OrganigrammaPermesso[] } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organigramma_permessi")
    .select("id, persona_id, tipo, dal, al, note, documento_stato, created_at")
    .eq("persona_id", personaId)
    .is("deleted_at", null)
    .order("dal", { ascending: false });
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as Array<{
      id: string;
      persona_id: string;
      tipo: OrganigrammaPermesso["tipo"];
      dal: string;
      al: string;
      note: string;
      documento_stato: OrganigrammaPermesso["documentoStato"];
      created_at: string;
    }>).map((r) => ({
      id: r.id,
      personaId: r.persona_id,
      tipo: r.tipo,
      dal: r.dal,
      al: r.al,
      note: r.note,
      documentoStato: r.documento_stato,
      createdAt: r.created_at,
    })),
  };
}

export async function setPermessoStatoAction(
  id: string,
  stato: OrganigrammaPermesso["documentoStato"]
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può cambiare lo stato." };
  }
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("organigramma_permessi")
    .update({
      documento_stato: stato,
      approved_by: stato === "approvato" ? auth.userId : null,
      approved_at: stato === "approvato" ? now : null,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("persona_id")
    .single();
  if (error) return { success: false, error: error.message };
  const personaId = (data as { persona_id: string }).persona_id;
  await recordAttivita({
    personaId,
    azione: "permesso",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: `Permesso ${stato}`,
  });
  return { success: true };
}

export async function listAutorizzazioniPersonaAction(
  personaId: string
): Promise<
  { success: true; items: PostoAutorizzato[] } | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  return loadAutorizzazioni({ personaId });
}

export async function listAutorizzatiPostoAction(
  postoId: string
): Promise<
  { success: true; items: PostoAutorizzato[] } | { success: false; error: string }
> {
  await requireAmmOrProd();
  return loadAutorizzazioni({ postoId });
}

async function loadAutorizzazioni(filter: {
  personaId?: string;
  postoId?: string;
}): Promise<
  { success: true; items: PostoAutorizzato[] } | { success: false; error: string }
> {
  const supabase = await createClient();
  let q = supabase
    .from("produzione_posto_autorizzati")
    .select(
      "id, posto_id, persona_id, posto:produzione_posti_lavoro(nome, area:produzione_aree(nome)), persona:organigramma_persone(nome, cognome)"
    )
    .is("deleted_at", null);
  if (filter.personaId) q = q.eq("persona_id", filter.personaId);
  if (filter.postoId) q = q.eq("posto_id", filter.postoId);
  const { data, error } = await q;
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    items: ((data ?? []) as unknown as Array<{
      id: string;
      posto_id: string;
      persona_id: string;
      posto: { nome: string; area: { nome: string } | { nome: string }[] | null } | null;
      persona: { nome: string; cognome: string } | { nome: string; cognome: string }[] | null;
    }>).map((r) => {
      const posto = Array.isArray(r.posto) ? r.posto[0] : r.posto;
      const area = posto?.area
        ? Array.isArray(posto.area)
          ? posto.area[0]
          : posto.area
        : null;
      const persona = Array.isArray(r.persona) ? r.persona[0] : r.persona;
      return {
        id: r.id,
        postoId: r.posto_id,
        personaId: r.persona_id,
        postoNome: posto?.nome ?? "Postazione",
        areaNome: area?.nome ?? "",
        personaNome: persona ? `${persona.cognome} ${persona.nome}` : "",
      };
    }),
  };
}

export async function addAutorizzazionePostoAction(input: {
  postoId: string;
  personaId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAmmOrProd();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può autorizzare." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("produzione_posto_autorizzati").insert({
    posto_id: input.postoId,
    persona_id: input.personaId,
    created_by: auth.userId,
    updated_by: auth.userId,
  });
  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "Questa persona è già autorizzata." };
    }
    return { success: false, error: error.message };
  }
  await recordAttivita({
    personaId: input.personaId,
    azione: "autorizzazione",
    actorId: auth.userId,
    actorNome: actorNome(auth.profile),
    note: "Aggiunta autorizzazione postazione",
  });
  return { success: true };
}

export async function removeAutorizzazionePostoAction(
  id: string
): Promise<{ success: true } | { success: false; error: string }> {
  const auth = await requireAmmOrProd();
  if (!isAdminLikeProfile(auth.profile)) {
    return { success: false, error: "Solo l’amministratore può revocare." };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("produzione_posto_autorizzati")
    .select("persona_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase
    .from("produzione_posto_autorizzati")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: auth.userId,
      updated_by: auth.userId,
    })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  const personaId = (data as { persona_id?: string } | null)?.persona_id;
  if (personaId) {
    await recordAttivita({
      personaId,
      azione: "autorizzazione",
      actorId: auth.userId,
      actorNome: actorNome(auth.profile),
      note: "Revocata autorizzazione postazione",
    });
  }
  return { success: true };
}
