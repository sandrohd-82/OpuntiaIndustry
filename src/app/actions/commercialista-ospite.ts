"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  generaTokenOspite,
  hashTokenOspite,
  PERCORSO_OSPITE_COMMERCIALISTA,
  REGISTRI_LINK_OSPITE,
  registraAuditOspite,
  scadenzaLinkOspite,
} from "@/lib/amministrazione/commercialista-ospite";
import { createServiceClient } from "@/lib/supabase/server";

const preparaLinkSchema = z
  .object({
    ambito: z.enum(["registro", "trimestre"]),
    registro: z.enum(REGISTRI_LINK_OSPITE).nullable(),
    anno: z.number().int().min(2000).max(2100),
    trimestre: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
    ]),
  })
  .superRefine((val, ctx) => {
    if (val.ambito === "trimestre" && val.registro) {
      ctx.addIssue({
        code: "custom",
        message: "Il trimestre non indica una sola area.",
      });
    }
    if (val.ambito === "registro" && !val.registro) {
      ctx.addIssue({
        code: "custom",
        message: "Indica l'area da elaborare.",
      });
    }
  });

async function originePubblica(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.opuntiaindustry.com";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function statoLinkCommercialistaAction(): Promise<
  | {
      success: true;
      attivo: boolean;
      expiresAt: string | null;
      ambito: "registro" | "trimestre" | null;
      registro: string | null;
      anno: number | null;
      trimestre: number | null;
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("area-fiscale");
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("commercialista_link_ospite")
    .select("expires_at, ambito, registro, anno, trimestre")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  const expiresAt = data?.expires_at ? String(data.expires_at) : null;
  const ambito =
    data?.ambito === "registro" || data?.ambito === "trimestre"
      ? data.ambito
      : null;
  return {
    success: true,
    attivo: Boolean(expiresAt && ambito),
    expiresAt,
    ambito,
    registro: data?.registro ? String(data.registro) : null,
    anno: data?.anno != null ? Number(data.anno) : null,
    trimestre: data?.trimestre != null ? Number(data.trimestre) : null,
  };
}

export async function preparaLinkCommercialistaAction(
  raw: unknown
): Promise<
  | { success: true; url: string; expiresAt: string }
  | { success: false; error: string }
> {
  const parsed = preparaLinkSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Elaborazione non valida.",
    };
  }
  const { auth } = await requireAreaAccess("area-fiscale");
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const { data: vivi, error: viviErr } = await supabase
    .from("commercialista_link_ospite")
    .select("id")
    .is("revoked_at", null);
  if (viviErr) return { success: false, error: viviErr.message };

  const precedenti = (vivi ?? []) as Array<{ id: string }>;
  if (precedenti.length > 0) {
    const { error: revocaErr } = await supabase
      .from("commercialista_link_ospite")
      .update({
        revoked_at: now,
        revoked_by: auth.userId,
        updated_by: auth.userId,
      })
      .is("revoked_at", null);
    if (revocaErr) return { success: false, error: revocaErr.message };
    for (const row of precedenti) {
      await registraAuditOspite({
        entityId: row.id,
        action: "update",
        actorId: auth.userId,
        summary: "Link commercialista sostituito da uno nuovo",
        payload: { sostituito: true },
      });
    }
  }

  const token = generaTokenOspite();
  const expiresAt = scadenzaLinkOspite();
  const { data: creato, error: insErr } = await supabase
    .from("commercialista_link_ospite")
    .insert({
      token_hash: await hashTokenOspite(token),
      expires_at: expiresAt,
      ambito: parsed.data.ambito,
      registro: parsed.data.ambito === "registro" ? parsed.data.registro : null,
      anno: parsed.data.anno,
      trimestre: parsed.data.trimestre,
      created_by: auth.userId,
      updated_by: auth.userId,
    })
    .select("id")
    .single();
  if (insErr || !creato?.id) {
    return {
      success: false,
      error: insErr?.message ?? "Link non creato.",
    };
  }

  await registraAuditOspite({
    entityId: String(creato.id),
    action: "create",
    actorId: auth.userId,
    summary: `Link elaborazione commercialista preparato, valido fino al ${expiresAt}`,
    payload: {
      expires_at: expiresAt,
      giorni: 3,
      ambito: parsed.data.ambito,
      registro: parsed.data.registro,
      anno: parsed.data.anno,
      trimestre: parsed.data.trimestre,
    },
  });

  const url = `${await originePubblica()}${PERCORSO_OSPITE_COMMERCIALISTA}?accesso=${token}`;
  return { success: true, url, expiresAt };
}
