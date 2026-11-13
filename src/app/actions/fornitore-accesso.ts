"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { puoModificareCollegamentoFornitore } from "@/lib/produzione/fornitore-accesso";
import {
  contestoMaterialeIngresso,
  soggettoAccessoFornitore,
} from "@/lib/produzione/fornitore-accesso-server";
import { createClient } from "@/lib/supabase/server";

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
): Promise<{ success: true; accessi: AccessoFornitoreRiga[] } | Errore> {
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
  if (ids.length === 0) return { success: true, accessi: [] };

  const { data: profili, error: profiliError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .in("id", ids);
  if (profiliError) return { success: false, error: "Utenti non disponibili." };

  const byId = new Map(
    (profili ?? []).map((p) => [p.id as string, p])
  );
  return {
    success: true,
    accessi: (data ?? []).map((row) => {
      const profilo = byId.get(row.profile_id as string);
      return {
        id: row.id as string,
        profileId: row.profile_id as string,
        email: (profilo?.email as string | undefined) ?? "",
        nome: (profilo?.full_name as string | null | undefined) || "Utente",
      };
    }),
  };
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
