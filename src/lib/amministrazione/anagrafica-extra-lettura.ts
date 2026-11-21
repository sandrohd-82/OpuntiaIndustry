import {
  ANAGRAFICA_BRAND_LOGO_BUCKET,
  type AnagraficaBrand,
  type AnagraficaOwnerKind,
  type AnagraficaSede,
} from "@/lib/amministrazione/anagrafica-extra";
import { requireAnyAreaAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";

export type ExtraRowSede = {
  id: string;
  tipo: AnagraficaSede["tipo"];
  nazione: string;
  provincia: string;
  localita?: string;
  citta: string;
  cap: string;
  indirizzo: string;
  sort_order: number;
  ricezione_campionature?: boolean;
  ricezione_acquisti?: boolean;
};

export type ExtraRowBrand = {
  id: string;
  nome: string;
  sito_web: string;
  email: string;
  telefono: string;
  referente_nome: string;
  referente_contatto_id: string | null;
  logo_path: string;
  sort_order: number;
};

export function mapSede(r: ExtraRowSede): AnagraficaSede {
  return {
    id: r.id,
    tipo: r.tipo,
    nazione: r.nazione ?? "",
    provincia: r.provincia ?? "",
    localita: r.localita ?? "",
    citta: r.citta ?? "",
    cap: r.cap ?? "",
    indirizzo: r.indirizzo ?? "",
    sortOrder: r.sort_order ?? 0,
    ricezioneCampionature: Boolean(r.ricezione_campionature),
    ricezioneAcquisti: Boolean(r.ricezione_acquisti),
  };
}

export function mapBrand(r: ExtraRowBrand, logoUrl: string | null = null): AnagraficaBrand {
  return {
    id: r.id,
    nome: r.nome ?? "",
    sitoWeb: r.sito_web ?? "",
    email: r.email ?? "",
    telefono: r.telefono ?? "",
    referenteNome: r.referente_nome ?? "",
    referenteContattoId: r.referente_contatto_id,
    logoPath: r.logo_path ?? "",
    logoUrl,
    sortOrder: r.sort_order ?? 0,
  };
}

export async function signedLogoUrl(path: string): Promise<string | null> {
  if (!path.trim()) return null;
  const { data } = await createServiceClient()
    .storage.from(ANAGRAFICA_BRAND_LOGO_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function leggiAnagraficaExtra(input: {
  ownerKind: AnagraficaOwnerKind;
  ownerId: string;
}): Promise<
  | { success: true; sedi: AnagraficaSede[]; brand: AnagraficaBrand[] }
  | { success: false; error: string }
> {
  await requireAnyAreaAccess(["amministrazione", "commerciale", "webmail"]);
  if (!z.string().uuid().safeParse(input.ownerId).success) {
    return { success: false, error: "Scheda non valida." };
  }
  const supabase = await createClient();
  const [sediRes, brandRes] = await Promise.all([
    supabase
      .from("anagrafica_sedi")
      .select(
        "id, tipo, nazione, provincia, localita, citta, cap, indirizzo, sort_order, ricezione_campionature, ricezione_acquisti"
      )
      .eq("owner_kind", input.ownerKind)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("anagrafica_brand")
      .select(
        "id, nome, sito_web, email, telefono, referente_nome, referente_contatto_id, logo_path, sort_order"
      )
      .eq("owner_kind", input.ownerKind)
      .eq("owner_id", input.ownerId)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);
  if (sediRes.error) return { success: false, error: sediRes.error.message };
  if (brandRes.error) return { success: false, error: brandRes.error.message };
  const brandRows = (brandRes.data ?? []) as ExtraRowBrand[];
  const brand: AnagraficaBrand[] = [];
  for (const r of brandRows) {
    brand.push(mapBrand(r, await signedLogoUrl(r.logo_path)));
  }
  return {
    success: true,
    sedi: ((sediRes.data ?? []) as ExtraRowSede[]).map(mapSede),
    brand,
  };
}
