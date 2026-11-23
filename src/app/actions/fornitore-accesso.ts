"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { setProfileStatoOperativoAction } from "@/app/actions/impersonation";
import { motivoAltriAccessiAziendali, RUOLO_FORNITORE } from "@/lib/auth/perimetro-fornitore";
import { provisionTestProfile } from "@/lib/auth/provision-test-profile";
import { isSuperadminProfile } from "@/lib/auth/roles";
import { getAuthContext, getAuthUser, getProfile } from "@/lib/auth/session";
import { parseProfileStatoOperativo, type ProfileStatoOperativo } from "@/lib/auth/stato-operativo";
import { puoModificareCollegamentoFornitore } from "@/lib/produzione/fornitore-accesso";
import {
  contestoMaterialeIngresso,
  soggettoAccessoFornitore,
} from "@/lib/produzione/fornitore-accesso-server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

const collegaSchema = z.object({
  profileId: uuidSchema,
  fornitoreId: uuidSchema,
});

export type AccessoFornitoreRiga = {
  id: string;
  profileId: string;
  email: string;
  nome: string;
  stato: ProfileStatoOperativo;
};

export type ProfiloCollegabile = {
  id: string;
  email: string;
  nome: string;
};

type Errore = { success: false; error: string };

async function puoGestireCollegamenti(): Promise<
  { ok: true; userId: string } | Errore
> {
  const soggetto = await soggettoAccessoFornitore();
  const auth = await getAuthContext();
  if (!soggetto || !auth) {
    return { success: false, error: "Accesso richiesto." };
  }
  if (!puoModificareCollegamentoFornitore(soggetto)) {
    return {
      success: false,
      error: "Non puoi modificare i collegamenti fornitore.",
    };
  }
  return { ok: true, userId: auth.userId };
}

export async function listaAccessiFornitoreAction(
  fornitoreId: string
): Promise<
  { success: true; accessi: AccessoFornitoreRiga[]; gestioneAccount: boolean } | Errore
> {
  const parsed = uuidSchema.safeParse(fornitoreId);
  if (!parsed.success) return { success: false, error: "Fornitore non valido." };
  const gate = await puoGestireCollegamenti();
  if (!("ok" in gate)) return gate;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori_accessi")
    .select("id, profile_id")
    .eq("fornitore_id", parsed.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { success: false, error: "Collegamenti non disponibili." };

  const ids = (data ?? []).map((row) => row.profile_id as string);
  const gestione = await soloSuperAdmin();
  if (ids.length === 0) {
    return { success: true, accessi: [], gestioneAccount: "ok" in gestione };
  }

  const { data: profili, error: profiliError } = await supabase
    .from("profiles")
    .select("id, email, full_name, stato_operativo")
    .in("id", ids);
  if (profiliError) return { success: false, error: "Utenti non disponibili." };

  const byId = new Map(
    (profili ?? []).map((p) => [p.id as string, p])
  );
  return {
    success: true,
    gestioneAccount: "ok" in gestione,
    accessi: (data ?? []).map((row) => {
      const profilo = byId.get(row.profile_id as string);
      return {
        id: row.id as string,
        profileId: row.profile_id as string,
        email: (profilo?.email as string | undefined) ?? "",
        nome: (profilo?.full_name as string | null | undefined) || "Utente",
        stato: parseProfileStatoOperativo(profilo?.stato_operativo),
      };
    }),
  };
}

async function soloSuperAdmin(): Promise<{ ok: true; userId: string } | Errore> {
  const user = await getAuthUser();
  if (!user) return { success: false, error: "Accesso richiesto." };
  const actor = await getProfile(user.id);
  if (!actor || !isSuperadminProfile(actor)) {
    return { success: false, error: "Solo il Super Admin può gestire gli account fornitore." };
  }
  return { ok: true, userId: user.id };
}

export async function cercaProfiliCollegabiliAction(
  query: string
): Promise<{ success: true; profili: ProfiloCollegabile[] } | Errore> {
  const gate = await puoGestireCollegamenti();
  if (!("ok" in gate)) return gate;
  const testo = query.trim();
  if (testo.length < 2) return { success: true, profili: [] };
  const safe = testo.replace(/[%_\\]/g, "");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("is_active", true)
    .or(`email.ilike.%${safe}%,full_name.ilike.%${safe}%`)
    .limit(8);
  if (error) return { success: false, error: "Ricerca utenti non disponibile." };

  return {
    success: true,
    profili: (data ?? []).map((p) => ({
      id: p.id as string,
      email: p.email as string,
      nome: (p.full_name as string | null) || "Utente",
    })),
  };
}

export async function collegaAccessoFornitoreAction(input: {
  profileId: string;
  fornitoreId: string;
}): Promise<{ success: true; spostato: boolean } | Errore> {
  const parsed = collegaSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const gate = await puoGestireCollegamenti();
  if (!("ok" in gate)) return gate;

  const supabase = await createClient();
  const { data: profilo, error: profiloError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", parsed.data.profileId)
    .maybeSingle();
  if (profiloError || !profilo) {
    return { success: false, error: "Utente non trovato." };
  }

  const { data: fornitore, error: fornitoreError } = await supabase
    .from("fornitori")
    .select("id")
    .eq("id", parsed.data.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fornitoreError || !fornitore) {
    return { success: false, error: "Fornitore non trovato." };
  }

  const { data: attivo, error: attivoError } = await supabase
    .from("fornitori_accessi")
    .select("id, fornitore_id")
    .eq("profile_id", parsed.data.profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (attivoError) {
    return { success: false, error: "Collegamento non verificabile." };
  }
  if (attivo?.fornitore_id === parsed.data.fornitoreId) {
    return { success: true, spostato: false };
  }

  let spostato = false;
  if (attivo) {
    const now = new Date().toISOString();
    const { error: revocaError } = await supabase
      .from("fornitori_accessi")
      .update({
        deleted_at: now,
        deleted_by: gate.userId,
        updated_by: gate.userId,
      })
      .eq("id", attivo.id);
    if (revocaError) {
      return { success: false, error: "Collegamento precedente non revocato." };
    }
    spostato = true;
    await writeAuditLog({
      action: "fornitore_accesso_revoca",
      entity_type: "fornitori_accessi",
      entity_id: attivo.id as string,
      actor_id: gate.userId,
      summary: "Collegamento fornitore chiuso per spostamento",
      payload: {
        profile_id: parsed.data.profileId,
        fornitore_id: attivo.fornitore_id,
        motivo: "spostamento",
      },
    });
  }

  const { data: creato, error: insertError } = await supabase
    .from("fornitori_accessi")
    .insert({
      profile_id: parsed.data.profileId,
      fornitore_id: parsed.data.fornitoreId,
      created_by: gate.userId,
      updated_by: gate.userId,
    })
    .select("id")
    .single();
  if (insertError || !creato) {
    return { success: false, error: "Collegamento non registrato." };
  }

  await writeAuditLog({
    action: "fornitore_accesso_collega",
    entity_type: "fornitori_accessi",
    entity_id: creato.id as string,
    actor_id: gate.userId,
    summary: "Utente collegato all'anagrafica fornitore",
    payload: {
      profile_id: parsed.data.profileId,
      fornitore_id: parsed.data.fornitoreId,
      spostato,
    },
  });

  return { success: true, spostato };
}

export async function revocaAccessoFornitoreAction(
  accessoId: string
): Promise<{ success: true } | Errore> {
  const parsed = uuidSchema.safeParse(accessoId);
  if (!parsed.success) return { success: false, error: "Collegamento non valido." };
  const gate = await puoGestireCollegamenti();
  if (!("ok" in gate)) return gate;

  const supabase = await createClient();
  const { data: riga, error: readError } = await supabase
    .from("fornitori_accessi")
    .select("id, profile_id, fornitore_id")
    .eq("id", parsed.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError || !riga) {
    return { success: false, error: "Collegamento non trovato." };
  }

  const { error } = await supabase
    .from("fornitori_accessi")
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: gate.userId,
      updated_by: gate.userId,
    })
    .eq("id", parsed.data)
    .is("deleted_at", null);
  if (error) return { success: false, error: "Revoca non registrata." };

  await writeAuditLog({
    action: "fornitore_accesso_revoca",
    entity_type: "fornitori_accessi",
    entity_id: parsed.data,
    actor_id: gate.userId,
    summary: "Collegamento utente-fornitore revocato",
    payload: {
      profile_id: riga.profile_id,
      fornitore_id: riga.fornitore_id,
    },
  });

  return { success: true };
}

const creaAccountSchema = z.object({
  fornitoreId: uuidSchema,
  email: z.string().trim().email("Email non valida"),
  nome: z.string().trim().min(1, "Nome obbligatorio").max(80),
  cognome: z.string().trim().min(1, "Cognome obbligatorio").max(80),
});

/** Insert con la sessione del Super Admin: service_role non ha il grant sulla tabella. */
async function inserisciCollegamentoAccount(input: {
  profileId: string;
  fornitoreId: string;
  actorId: string;
}): Promise<{ ok: true; accessoId: string; giaCollegato: boolean } | Errore> {
  const supabase = await createClient();
  const { data: attivo, error: attivoError } = await supabase
    .from("fornitori_accessi")
    .select("id, fornitore_id")
    .eq("profile_id", input.profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (attivoError) {
    return { success: false, error: "Collegamento non verificabile." };
  }
  if (attivo?.fornitore_id === input.fornitoreId) {
    return { ok: true, accessoId: String(attivo.id), giaCollegato: true };
  }
  if (attivo) {
    return {
      success: false,
      error:
        "Questo account è già collegato a un altro fornitore. Usa Collega account esistente per spostarlo.",
    };
  }

  const { data: collegato, error: linkError } = await supabase
    .from("fornitori_accessi")
    .insert({
      profile_id: input.profileId,
      fornitore_id: input.fornitoreId,
      created_by: input.actorId,
      updated_by: input.actorId,
    })
    .select("id")
    .single();
  if (linkError || !collegato) {
    console.error("fornitori_accessi insert:", linkError?.message);
    return {
      success: false,
      error:
        "Account creato, ma il collegamento al fornitore non è riuscito. Usa Collega account esistente.",
    };
  }
  return { ok: true, accessoId: String(collegato.id), giaCollegato: false };
}

export async function creaAccountFornitoreAction(raw: unknown): Promise<
  { success: true; profileId: string; giaPresente: boolean } | Errore
> {
  const parsed = creaAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Dati non validi." };
  }
  const gate = await soloSuperAdmin();
  if (!("ok" in gate)) return gate;

  const service = createServiceClient();
  const { data: fornitore, error: fornitoreError } = await service
    .from("fornitori")
    .select("id, ragione_sociale")
    .eq("id", parsed.data.fornitoreId)
    .is("deleted_at", null)
    .maybeSingle();
  if (fornitoreError || !fornitore) {
    return { success: false, error: "Fornitore non trovato." };
  }

  const nome = `${parsed.data.nome} ${parsed.data.cognome}`.trim();
  const creato = await provisionTestProfile(service, {
    email: parsed.data.email,
    fullName: nome,
    firstName: parsed.data.nome,
    lastName: parsed.data.cognome,
    jobTitle: "Fornitore",
    roleCode: RUOLO_FORNITORE,
    gerarchia: "operatore",
    potere: "operatore",
    actorId: gate.userId,
    resetExisting: false,
  });
  let profileId = "";
  let giaPresente = false;
  if ("error" in creato) {
    if (!creato.error.includes("Esiste già un profilo")) {
      return { success: false, error: creato.error };
    }
    const { data: esistente, error: esistenteError } = await service
      .from("profiles")
      .select("id, app_roles(code)")
      .ilike("email", parsed.data.email.trim().toLowerCase())
      .maybeSingle();
    const ruolo = esistente?.app_roles as
      | { code?: string }
      | { code?: string }[]
      | null
      | undefined;
    const codice = Array.isArray(ruolo) ? ruolo[0]?.code : ruolo?.code;
    if (esistenteError || !esistente || codice !== RUOLO_FORNITORE) {
      return { success: false, error: creato.error };
    }
    profileId = String(esistente.id);
    giaPresente = true;
  } else {
    profileId = creato.userId;
  }

  const collegato = await inserisciCollegamentoAccount({
    profileId,
    fornitoreId: parsed.data.fornitoreId,
    actorId: gate.userId,
  });
  if (!("ok" in collegato)) return collegato;

  await writeAuditLog({
    action: "profile_create_test",
    entity_type: "profiles",
    entity_id: profileId,
    actor_id: gate.userId,
    summary: giaPresente
      ? `Account fornitore ${nome} già presente: collegamento completato. Accesso iniziale solo Area Fornitori.`
      : `Account fornitore ${nome} creato e collegato. Accesso iniziale solo Area Fornitori.`,
    payload: {
      email: parsed.data.email.trim().toLowerCase(),
      fornitore_id: parsed.data.fornitoreId,
      ruolo: RUOLO_FORNITORE,
      accesso_id: collegato.accessoId,
      gia_presente: giaPresente,
    },
  });

  return { success: true, profileId, giaPresente };
}

async function motivoSospensioneAziendale(
  profileId: string
): Promise<string | null> {
  const service = createServiceClient();
  const [{ data: profilo }, { count: organigramma }, { count: reparti }, { count: caselle }] =
    await Promise.all([
      service.from("profiles").select("app_roles(code)").eq("id", profileId).maybeSingle(),
      service
        .from("organigramma_persone")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profileId)
        .is("deleted_at", null),
      service
        .from("profile_reparti")
        .select("id", { count: "exact", head: true })
        .eq("profile_id", profileId)
        .is("deleted_at", null),
      service
        .from("webmail_account_grants")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profileId)
        .is("deleted_at", null),
    ]);
  const role = profilo?.app_roles as { code?: string } | { code?: string }[] | null | undefined;
  const obj = Array.isArray(role) ? role[0] : role;
  return motivoAltriAccessiAziendali({
    ruolo: String(obj?.code ?? ""),
    inOrganigramma: (organigramma ?? 0) > 0,
    reparti: reparti ?? 0,
    caselle: caselle ?? 0,
  });
}

export async function impostaStatoAccountFornitoreAction(raw: unknown): Promise<
  { success: true } | (Errore & { richiedeConferma?: boolean })
> {
  const parsed = z
    .object({
      fornitoreId: uuidSchema,
      profileId: uuidSchema,
      stato: z.enum(["sospeso", "operativo"]),
      confermaAltriAccessi: z.boolean().optional(),
    })
    .safeParse(raw);
  if (!parsed.success) return { success: false, error: "Operazione non valida." };
  const gate = await soloSuperAdmin();
  if (!("ok" in gate)) return gate;

  const supabase = await createClient();
  const { data: accesso, error } = await supabase
    .from("fornitori_accessi")
    .select("id")
    .eq("fornitore_id", parsed.data.fornitoreId)
    .eq("profile_id", parsed.data.profileId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !accesso) {
    return { success: false, error: "Account non collegato a questo fornitore." };
  }

  if (parsed.data.stato === "sospeso" && !parsed.data.confermaAltriAccessi) {
    const motivo = await motivoSospensioneAziendale(parsed.data.profileId);
    if (motivo) return { success: false, error: motivo, richiedeConferma: true };
  }

  const esito = await setProfileStatoOperativoAction(parsed.data.stato, parsed.data.profileId);
  if (!esito.success) return esito;
  await writeAuditLog({
    action: parsed.data.stato === "sospeso" ? "account_sospeso" : "account_riattivato",
    entity_type: "profiles",
    entity_id: parsed.data.profileId,
    actor_id: gate.userId,
    summary:
      parsed.data.stato === "sospeso"
        ? "Account fornitore sospeso. Il collegamento all'anagrafica resta."
        : "Account fornitore riattivato. Il collegamento all'anagrafica resta.",
    payload: {
      fornitore_id: parsed.data.fornitoreId,
      conferma_altri_accessi: Boolean(parsed.data.confermaAltriAccessi),
    },
  });
  return { success: true };
}

/**
 * Lettura dati riservati. L'id passato dal client non sostituisce il collegamento.
 * Un fornitore che chiede l'anagrafica di un altro riceve un rifiuto.
 */
export async function leggiDatiFornitorePortaleAction(
  fornitoreId: string
): Promise<
  { success: true; fornitoreId: string; ragioneSociale: string } | Errore
> {
  const parsed = uuidSchema.safeParse(fornitoreId);
  if (!parsed.success) return { success: false, error: "Fornitore non valido." };

  const ctx = await contestoMaterialeIngresso(parsed.data);
  if (ctx.esito === "negato") {
    if (ctx.motivo === "altro_fornitore") {
      return { success: false, error: "Non puoi accedere a un altro fornitore." };
    }
    if (ctx.motivo === "non_collegato") {
      return {
        success: false,
        error: "Utente non collegato a un fornitore.",
      };
    }
    return { success: false, error: "Accesso non consentito." };
  }

  const idAutorizzato =
    ctx.esito === "fornitore" ? ctx.fornitoreId : parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornitori")
    .select("id, ragione_sociale")
    .eq("id", idAutorizzato)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: "Dati fornitore non disponibili." };
  }

  return {
    success: true,
    fornitoreId: data.id as string,
    ragioneSociale: data.ragione_sociale as string,
  };
}
