"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { getAuthContext } from "@/lib/auth/session";
import { normalizzaLinguaIntercomunicazione } from "@/lib/amministrazione/clienti";
import { isListinoLingua, labelLingua } from "@/lib/ecosystem/geo-nazioni";
import { traduciTestiIntercomunicazione } from "@/lib/amministrazione/traduci-intercomunicazione";
import { createClient } from "@/lib/supabase/server";

const tipiScheda = ["cliente", "cliente_possibile", "fornitore"] as const;

const leggiSchema = z.object({
  tipo: z.enum(tipiScheda),
  id: z.string().uuid(),
});

const traduciSchema = z.object({
  tipo: z.enum(tipiScheda),
  id: z.string().uuid(),
  documento: z.enum(["preventivo", "fattura", "mail"]),
  lingua: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$/)
    .optional(),
  testi: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(80),
        text: z.string().max(8000),
      })
    )
    .max(200),
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
  tipo: "cliente" | "cliente_possibile" | "fornitore";
  id: string;
}): Promise<{ ok: true; lingua: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  let table: "clienti" | "clienti_possibili" | "fornitori" = "clienti_possibili";
  if (input.tipo === "cliente") table = "clienti";
  else if (input.tipo === "fornitore") table = "fornitori";
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
  tipo: "cliente" | "cliente_possibile" | "fornitore";
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
  tipo: "cliente" | "cliente_possibile" | "fornitore";
  id: string;
  documento: "preventivo" | "fattura" | "mail";
  lingua?: string;
  testi: Array<{ key: string; text: string }>;
}): Promise<
  | {
      success: true;
      lingua: string;
      modello: string;
      testi: Array<{ key: string; text: string }>;
    }
  | { success: false; error: string }
> {
  const gate = await richiediOperatore();
  if (!gate.ok) return { success: false, error: gate.error };
  const parsed = traduciSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Testo da tradurre non valido." };
  }
  const salvata = await linguaSalvata(parsed.data);
  if (!salvata.ok) return { success: false, error: salvata.error };
  const richiesta = parsed.data.lingua?.trim().toLowerCase();
  const lingua =
    richiesta && isListinoLingua(richiesta) ? richiesta : salvata.lingua;
  if (lingua === "it") {
    return {
      success: false,
      error: "Con l'italiano il documento resta quello originale, senza traduzione.",
    };
  }
  const utili = parsed.data.testi.filter((item) => item.text.trim());
  if (utili.length === 0) {
    return { success: false, error: "Non c'è testo da tradurre." };
  }
  try {
    const tradotti = await traduciTestiIntercomunicazione({
      lingua,
      testi: utili,
    });
    await writeAuditLog({
      entity_type:
        parsed.data.tipo === "cliente" ? "clienti" : "clienti_possibili",
      entity_id: parsed.data.id,
      action: "traduci_intercomunicazione",
      actor_id: gate.userId,
      summary: `Traduzione in ${labelLingua(lingua)} per ${parsed.data.documento} (${tradotti.testi.length} testi). Il testo tradotto non è archiviato.`,
      payload: {
        lingua,
        modello: tradotti.modello,
        documento: parsed.data.documento,
        n_testi: tradotti.testi.length,
      },
    });
    return {
      success: true,
      lingua,
      modello: tradotti.modello,
      testi: tradotti.testi,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Traduzione non riuscita.",
    };
  }
}
