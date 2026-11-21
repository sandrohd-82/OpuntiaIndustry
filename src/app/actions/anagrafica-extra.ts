"use server";

import { writeAuditLog } from "@/lib/audit";
import {
  ANAGRAFICA_BRAND_LOGO_BUCKET,
  anagraficaBrandInputSchema,
  anagraficaSedeInputSchema,
  formatSedeIndirizzo,
  isSedeAddressEmpty,
  normalizeBrandInput,
  normalizeSedeInput,
  type AnagraficaBrandInput,
  type AnagraficaOwnerKind,
  type AnagraficaSedeInput,
} from "@/lib/amministrazione/anagrafica-extra";
import {
  leggiAnagraficaExtra,
  mapSede,
  signedLogoUrl,
  type ExtraRowSede,
} from "@/lib/amministrazione/anagrafica-extra-lettura";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export async function loadAnagraficaExtraAction(
  input: Parameters<typeof leggiAnagraficaExtra>[0]
): ReturnType<typeof leggiAnagraficaExtra> {
  return leggiAnagraficaExtra(input);
}

export async function loadIndirizzoRicezioneMerce(input: {
  ownerKind: AnagraficaOwnerKind;
  ownerId: string | null | undefined;
  ragioneSociale?: string;
  purpose?: "campionature" | "acquisti";
}): Promise<{
  destinatario: string;
  indirizzo: string;
  sedeId: string;
} | null> {
  if (!input.ownerId || !z.string().uuid().safeParse(input.ownerId).success) {
    return null;
  }
  const purposes: Array<"campionature" | "acquisti"> =
    input.purpose === "campionature"
      ? ["campionature", "acquisti"]
      : ["acquisti", "campionature"];
  const supabase = await createClient();
  for (const purpose of purposes) {
    const col =
      purpose === "campionature"
        ? "ricezione_campionature"
        : "ricezione_acquisti";
    const { data, error } = await supabase
      .from("anagrafica_sedi")
      .select(
        "id, tipo, nazione, provincia, localita, citta, cap, indirizzo, sort_order, ricezione_campionature, ricezione_acquisti"
      )
      .eq("owner_kind", input.ownerKind)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .eq(col, true)
      .maybeSingle();
    if (error || !data) continue;
    const sede = mapSede(data as ExtraRowSede);
    if (isSedeAddressEmpty(sede)) continue;
    const indirizzo = formatSedeIndirizzo(sede);
    if (!indirizzo) continue;
    return {
      destinatario: (input.ragioneSociale ?? "").trim(),
      indirizzo,
      sedeId: sede.id,
    };
  }
  return null;
}

export async function persistAnagraficaExtra(input: {
  ownerKind: AnagraficaOwnerKind;
  ownerId: string;
  sedi: AnagraficaSedeInput[];
  brand: AnagraficaBrandInput[];
  userId: string;
}): Promise<string | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const sedi = input.sedi.map((s, i) =>
    normalizeSedeInput({ ...s, sortOrder: s.sortOrder ?? i })
  );
  const brand = input.brand
    .map((b, i) => normalizeBrandInput({ ...b, sortOrder: b.sortOrder ?? i }))
    .filter((b): b is AnagraficaBrandInput => Boolean(b));

  const { data: existingSedi, error: exSediErr } = await supabase
    .from("anagrafica_sedi")
    .select("id")
    .eq("owner_kind", input.ownerKind)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null);
  if (exSediErr) return exSediErr.message;
  const keepSedi = new Set(sedi.map((s) => s.id).filter((id): id is string => Boolean(id)));
  const toSoftSedi = ((existingSedi ?? []) as { id: string }[])
    .map((r) => r.id)
    .filter((id) => !keepSedi.has(id));
  if (toSoftSedi.length) {
    const { error } = await supabase
      .from("anagrafica_sedi")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
        updated_by: input.userId,
        updated_at: now,
      })
      .in("id", toSoftSedi);
    if (error) return error.message;
  }
  const { error: clearRicezioneErr } = await supabase
    .from("anagrafica_sedi")
    .update({
      ricezione_merce: false,
      ricezione_campionature: false,
      ricezione_acquisti: false,
      updated_by: input.userId,
      updated_at: now,
    })
    .eq("owner_kind", input.ownerKind)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null);
  if (clearRicezioneErr) return clearRicezioneErr.message;

  for (const [i, s] of sedi.entries()) {
    const payload = {
      owner_kind: input.ownerKind,
      owner_id: input.ownerId,
      tipo: s.tipo,
      nazione: s.nazione ?? "",
      provincia: s.provincia ?? "",
      localita: s.localita ?? "",
      citta: s.citta ?? "",
      cap: s.cap ?? "",
      indirizzo: s.indirizzo ?? "",
      sort_order: i,
      ricezione_merce: false,
      ricezione_campionature: Boolean(s.ricezioneCampionature),
      ricezione_acquisti: Boolean(s.ricezioneAcquisti),
      updated_by: input.userId,
      updated_at: now,
    };
    if (s.id) {
      const { data: exists } = await supabase
        .from("anagrafica_sedi")
        .select("id")
        .eq("id", s.id)
        .maybeSingle();
      if (exists) {
        const { error } = await supabase
          .from("anagrafica_sedi")
          .update(payload)
          .eq("id", s.id);
        if (error) return error.message;
        continue;
      }
    }
    const { error } = await supabase.from("anagrafica_sedi").insert({
      ...(s.id ? { id: s.id } : {}),
      ...payload,
      created_by: input.userId,
    });
    if (error) return error.message;
  }

  const { data: existingBrand, error: exBrandErr } = await supabase
    .from("anagrafica_brand")
    .select("id, logo_path")
    .eq("owner_kind", input.ownerKind)
    .eq("owner_id", input.ownerId)
    .is("deleted_at", null);
  if (exBrandErr) return exBrandErr.message;
  const keepBrand = new Set(
    brand.map((b) => b.id).filter((id): id is string => Boolean(id))
  );
  const existingBrandRows = (existingBrand ?? []) as {
    id: string;
    logo_path: string;
  }[];
  const toSoftBrand = existingBrandRows.filter((r) => !keepBrand.has(r.id));
  if (toSoftBrand.length) {
    const { error } = await supabase
      .from("anagrafica_brand")
      .update({
        deleted_at: now,
        deleted_by: input.userId,
        updated_by: input.userId,
        updated_at: now,
      })
      .in(
        "id",
        toSoftBrand.map((r) => r.id)
      );
    if (error) return error.message;
  }
  for (const [i, b] of brand.entries()) {
    const existing = existingBrandRows.find((r) => r.id === b.id);
    const payload = {
      owner_kind: input.ownerKind,
      owner_id: input.ownerId,
      nome: b.nome,
      sito_web: b.sitoWeb ?? "",
      email: b.email ?? "",
      telefono: b.telefono ?? "",
      referente_nome: b.referenteNome ?? "",
      referente_contatto_id: b.referenteContattoId ?? null,
      logo_path: b.logoPath || existing?.logo_path || "",
      sort_order: i,
      updated_by: input.userId,
      updated_at: now,
    };
    if (b.id && existing) {
      const { error } = await supabase
        .from("anagrafica_brand")
        .update(payload)
        .eq("id", b.id);
      if (error) return error.message;
      continue;
    }
    const { error } = await supabase.from("anagrafica_brand").insert({
      ...(b.id ? { id: b.id } : {}),
      ...payload,
      created_by: input.userId,
    });
    if (error) return error.message;
  }

  await writeAuditLog({
    entity_type: input.ownerKind === "cliente" ? "clienti" : "clienti_possibili",
    entity_id: input.ownerId,
    action: "update",
    actor_id: input.userId,
    summary: "Aggiornate sedi e brand anagrafica",
    payload: { sedi: sedi.length, brand: brand.length },
  });
  return null;
}

export async function persistAnagraficaExtraAction(input: {
  ownerKind: AnagraficaOwnerKind;
  ownerId: string;
  sedi: AnagraficaSedeInput[];
  brand: AnagraficaBrandInput[];
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale", "webmail"]);
  if (!z.string().uuid().safeParse(input.ownerId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const sediParsed = z.array(anagraficaSedeInputSchema).max(40).safeParse(input.sedi);
  if (!sediParsed.success) {
    return { success: false, error: "Sedi non valide." };
  }
  const brandParsed = z.array(anagraficaBrandInputSchema).max(40).safeParse(input.brand);
  if (!brandParsed.success) {
    return {
      success: false,
      error: brandParsed.error.issues[0]?.message ?? "Brand non valido.",
    };
  }
  const err = await persistAnagraficaExtra({
    ownerKind: input.ownerKind,
    ownerId: input.ownerId,
    sedi: sediParsed.data,
    brand: brandParsed.data,
    userId: auth.userId,
  });
  if (err) return { success: false, error: err };
  return { success: true };
}

export async function copyAnagraficaExtraAction(input: {
  fromKind: AnagraficaOwnerKind;
  fromId: string;
  toKind: AnagraficaOwnerKind;
  toId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAnyAreaAccess(["amministrazione", "commerciale", "webmail"]);
  const loaded = await loadAnagraficaExtraAction({
    ownerKind: input.fromKind,
    ownerId: input.fromId,
  });
  if (!loaded.success) return loaded;
  const err = await persistAnagraficaExtra({
    ownerKind: input.toKind,
    ownerId: input.toId,
    sedi: loaded.sedi.map((s, i) => ({
      tipo: s.tipo,
      nazione: s.nazione,
      provincia: s.provincia,
      localita: s.localita,
      citta: s.citta,
      cap: s.cap,
      indirizzo: s.indirizzo,
      sortOrder: i,
      ricezioneCampionature: Boolean(s.ricezioneCampionature),
      ricezioneAcquisti: Boolean(s.ricezioneAcquisti),
    })),
    brand: loaded.brand.map((b, i) => ({
      nome: b.nome,
      sitoWeb: b.sitoWeb,
      email: b.email,
      telefono: b.telefono,
      referenteNome: b.referenteNome,
      referenteContattoId: b.referenteContattoId,
      logoPath: b.logoPath,
      sortOrder: i,
    })),
    userId: auth.userId,
  });
  if (err) return { success: false, error: err };
  return { success: true };
}

export async function uploadAnagraficaBrandLogoAction(
  formData: FormData
): Promise<{ success: true; path: string; url: string | null } | { success: false; error: string }> {
  await requireAnyAreaAccess(["amministrazione", "commerciale", "webmail"]);
  const ownerKind = String(formData.get("ownerKind") ?? "");
  const ownerId = String(formData.get("ownerId") ?? "");
  const brandId = String(formData.get("brandId") ?? "");
  const file = formData.get("file");
  if (ownerKind !== "cliente" && ownerKind !== "cliente_possibile") {
    return { success: false, error: "Scheda non valida." };
  }
  if (!z.string().uuid().safeParse(ownerId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  if (!z.string().uuid().safeParse(brandId).success) {
    return { success: false, error: "Brand non valido." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: "Seleziona un logo." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { success: false, error: "Logo troppo grande (max 5 MB)." };
  }
  const mime = file.type;
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    return { success: false, error: "Usa JPG, PNG o WebP." };
  }
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${ownerKind}/${ownerId}/${brandId}.${ext}`;
  const storage = createServiceClient();
  const { error: upErr } = await storage.storage
    .from(ANAGRAFICA_BRAND_LOGO_BUCKET)
    .upload(path, file, { contentType: mime, upsert: true });
  if (upErr) return { success: false, error: upErr.message };
  const supabase = await createClient();
  const { error } = await supabase
    .from("anagrafica_brand")
    .update({ logo_path: path, updated_at: new Date().toISOString() })
    .eq("id", brandId)
    .is("deleted_at", null);
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    path,
    url: await signedLogoUrl(path),
  };
}
