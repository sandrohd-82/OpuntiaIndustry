"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { normalizzaLinguaIntercomunicazione } from "@/lib/amministrazione/clienti";
import { labelLingua } from "@/lib/ecosystem/geo-nazioni";
import { traduciTestiIntercomunicazione } from "@/lib/amministrazione/traduci-intercomunicazione";
import { createClient } from "@/lib/supabase/server";

const leggiSchema = z.object({
  tipo: z.enum(["cliente", "cliente_possibile"]),
  id: z.string().uuid(),
});

const traduciSchema = z.object({
  tipo: z.enum(["cliente", "cliente_possibile"]),
  id: z.string().uuid(),
  documento: z.enum(["preventivo", "fattura", "mail"]),
  testi: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        text: z.string().max(8000),
      })
    )
    .max(40),
});

async function richiediOperatore(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const auth = await getAuthContext();
  if (!auth?.userId || !auth.isSecondFactorVerified) {
    return { ok: false, error: "Accesso negato." };
  }
  return { ok: true, userId: auth.userId };
}

async function linguaSalvata(input: {
  tipo: "cliente" | "cliente_possibile";
  id: string;
}): Promise<{ ok: true; lingua: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const table = input.tipo === "cliente" ? "clienti" : "clienti_possibili";
  const { data, error } = await supabase
    .from(table)
    .select("lingua_intercomunicazione")
    .eq("id", input.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) {
    return { ok: false, error: "Scheda non trovata." };
  }
  return {
    ok: true,
    lingua: normalizzaLinguaIntercomunicazione(
      data.lingua_intercomunicazione
    ),
  };
}

export async function leggiLinguaIntercomunicazioneAction(input: {
  tipo: "cliente" | "cliente_possibile";
  id: string;
}): Promise<
  { success: true; lingua: string } | { success: false; error: string }
> {
  const gate = await richiediOperatore();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = leggiSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Scheda non valida." };
  }
  const lingua = await linguaSalvata(parsed.data);
  if (!lingua.ok) return { success: false, error: lingua.error };
  return { success: true, lingua: lingua.lingua };
}

export async function traduciIntercomunicazioneAction(input: {
  tipo: "cliente" | "cliente_possibile";
  id: string;
  documento: "preventivo" | "fattura" | "mail";
  testi: Array<{ key: string; text: string }>;
}): Promise<
  | { success: true; lingua: string; testi: Array<{ key: string; text: string }> }
  | { success: false; error: string }
> {
  const gate = await richiediOperatore();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = traduciSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Testo da tradurre non valido." };
  }
  const lingua = await linguaSalvata(parsed.data);
  if (!lingua.ok) return { success: false, error: lingua.error };
  if (lingua.lingua === "it") {
    return {
      success: false,
      error: "La lingua di intercomunicazione è italiano.",
    };
  }
  const utili = parsed.data.testi.filter((item) => item.text.trim());
  if (utili.length === 0) {
    return { success: false, error: "Non c'è testo da tradurre." };
  }
  try {
    const tradotti = await traduciTestiIntercomunicazione({
      lingua: lingua.lingua,
      testi: utili,
    });
    await writeAuditLog({
      entity_type:
        parsed.data.tipo === "cliente" ? "clienti" : "clienti_possibili",
      entity_id: parsed.data.id,
      action: "traduci_intercomunicazione",
      actor_id: gate.userId,
      summary: `Traduzione in ${labelLingua(lingua.lingua)} per ${parsed.data.documento} (${tradotti.length} testi). Il testo tradotto non è archiviato.`,
      payload: {
        lingua: lingua.lingua,
        documento: parsed.data.documento,
        n_testi: tradotti.length,
      },
    });
    return { success: true, lingua: lingua.lingua, testi: tradotti };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Traduzione non riuscita.",
    };
  }
}
