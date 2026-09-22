"use server";

import { requireOrdineProcessAccess } from "@/lib/auth/ordini-access";
import {
  tipoImpegnoDaNote,
  type ScalettaImpegno,
  type ScalettaSenzaData,
} from "@/lib/amministrazione/scaletta-produzione";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function listScalettaCalendarioAction(raw: unknown): Promise<
  | {
      success: true;
      impegni: ScalettaImpegno[];
      senzaData: ScalettaSenzaData[];
    }
  | { success: false; error: string }
> {
  await requireOrdineProcessAccess();
  const parsed = rangeSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Intervallo date non valido." };
  }
  const supabase = await createClient();
  const { from, to } = parsed.data;

  const { data: rows, error } = await supabase
    .from("produzione_calendario_impegni")
    .select(
      "id, data_giorno, ordine_id, campionatura_id, linea_codice, etichetta, note"
    )
    .is("deleted_at", null)
    .gte("data_giorno", from)
    .lte("data_giorno", to)
    .order("data_giorno", { ascending: true });
  if (error) return { success: false, error: error.message };

  const ordineIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => String(r.ordine_id ?? ""))
        .filter(Boolean)
    ),
  ];
  const campIds = [
    ...new Set(
      (rows ?? [])
        .map((r) => String(r.campionatura_id ?? ""))
        .filter(Boolean)
    ),
  ];

  const ordiniById = new Map<
    string,
    { numero: string; cliente: string; prodotto: string }
  >();
  const campById = new Map<
    string,
    { numero: string; cliente: string; prodotto: string }
  >();

  if (ordineIds.length) {
    const { data: ordini } = await supabase
      .from("ordini")
      .select("id, numero_interno, cliente_ragione_sociale")
      .in("id", ordineIds)
      .is("deleted_at", null);
    const { data: righe } = await supabase
      .from("ordini_righe")
      .select("ordine_id, prodotto_codice")
      .in("ordine_id", ordineIds)
      .order("sort_order", { ascending: true });
    const prodByOrd = new Map<string, string>();
    for (const r of righe ?? []) {
      const oid = String(r.ordine_id);
      if (!prodByOrd.has(oid) && r.prodotto_codice) {
        prodByOrd.set(oid, String(r.prodotto_codice));
      }
    }
    for (const o of ordini ?? []) {
      ordiniById.set(String(o.id), {
        numero: String(o.numero_interno ?? ""),
        cliente: String(o.cliente_ragione_sociale ?? ""),
        prodotto: prodByOrd.get(String(o.id)) ?? "",
      });
    }
  }

  if (campIds.length) {
    const { data: camps } = await supabase
      .from("campionature")
      .select("id, numero_interno, cliente_ragione_sociale")
      .in("id", campIds)
      .is("deleted_at", null);
    const { data: crighe } = await supabase
      .from("campionature_righe")
      .select("campionatura_id, prodotto_codice")
      .in("campionatura_id", campIds)
      .order("sort_order", { ascending: true });
    const prodByCamp = new Map<string, string>();
    for (const r of crighe ?? []) {
      const cid = String(r.campionatura_id);
      if (!prodByCamp.has(cid) && r.prodotto_codice) {
        prodByCamp.set(cid, String(r.prodotto_codice));
      }
    }
    for (const c of camps ?? []) {
      campById.set(String(c.id), {
        numero: String(c.numero_interno ?? ""),
        cliente: String(c.cliente_ragione_sociale ?? ""),
        prodotto: prodByCamp.get(String(c.id)) ?? "",
      });
    }
  }

  const impegni: ScalettaImpegno[] = (rows ?? []).map((r) => {
    const oid = r.ordine_id ? String(r.ordine_id) : "";
    const cid = r.campionatura_id ? String(r.campionatura_id) : "";
    const meta = oid
      ? ordiniById.get(oid)
      : cid
        ? campById.get(cid)
        : undefined;
    const etichetta = String(r.etichetta ?? "");
    return {
      id: String(r.id),
      dataGiorno: String(r.data_giorno),
      tipo: tipoImpegnoDaNote(String(r.note ?? "")),
      etichetta,
      numeroInterno: meta?.numero || etichetta.split(" · ")[0] || "—",
      cliente: meta?.cliente ?? "",
      prodotto: meta?.prodotto ?? "",
      entityType: cid && !oid ? "campionatura" : "ordine",
      entityId: oid || cid,
      lineaCodice: r.linea_codice ? String(r.linea_codice) : null,
    };
  });

  const { data: ordSenza } = await supabase
    .from("ordini")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "in_scaletta")
    .is("deleted_at", null)
    .limit(80);
  const { data: campSenza } = await supabase
    .from("campionature")
    .select("id, numero_interno, cliente_ragione_sociale")
    .eq("stato", "processata")
    .is("deleted_at", null)
    .limit(80);

  const candOrd = (ordSenza ?? []).map((o) => String(o.id));
  const candCamp = (campSenza ?? []).map((c) => String(c.id));
  const linkedOrd = new Set<string>();
  const linkedCamp = new Set<string>();
  if (candOrd.length) {
    const { data: lo } = await supabase
      .from("produzione_calendario_impegni")
      .select("ordine_id")
      .in("ordine_id", candOrd)
      .is("deleted_at", null);
    for (const r of lo ?? []) {
      if (r.ordine_id) linkedOrd.add(String(r.ordine_id));
    }
  }
  if (candCamp.length) {
    const { data: lc } = await supabase
      .from("produzione_calendario_impegni")
      .select("campionatura_id")
      .in("campionatura_id", candCamp)
      .is("deleted_at", null);
    for (const r of lc ?? []) {
      if (r.campionatura_id) linkedCamp.add(String(r.campionatura_id));
    }
  }

  const senzaData: ScalettaSenzaData[] = [];
  for (const o of ordSenza ?? []) {
    if (linkedOrd.has(String(o.id))) continue;
    senzaData.push({
      entityType: "ordine",
      entityId: String(o.id),
      numeroInterno: String(o.numero_interno ?? ""),
      cliente: String(o.cliente_ragione_sociale ?? ""),
      prodotto: "",
    });
  }
  for (const c of campSenza ?? []) {
    if (linkedCamp.has(String(c.id))) continue;
    senzaData.push({
      entityType: "campionatura",
      entityId: String(c.id),
      numeroInterno: String(c.numero_interno ?? ""),
      cliente: String(c.cliente_ragione_sociale ?? ""),
      prodotto: "",
    });
  }

  return { success: true, impegni, senzaData };
}
