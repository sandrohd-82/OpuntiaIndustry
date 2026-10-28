"use server";

import { requireOrdineCreateAccess, requireOrdineReadAccess } from "@/lib/auth/ordini-access";
import type { ContattoRitiro } from "@/lib/amministrazione/ordine-ritiro";
import { createServiceClient } from "@/lib/supabase/service";

function aggiungi(
  lista: ContattoRitiro[],
  visti: Set<string>,
  valore: string,
  etichetta: string
) {
  const pulito = valore.trim();
  if (!pulito) return;
  const chiave = pulito.toLowerCase();
  if (visti.has(chiave)) return;
  visti.add(chiave);
  lista.push({ valore: pulito, etichetta });
}

export async function elencoContattiRitiroAction(input: {
  clienteId?: string | null;
  possibileClienteId?: string | null;
}): Promise<
  | { success: true; telefoni: ContattoRitiro[]; mail: ContattoRitiro[] }
  | { success: false; error: string }
> {
  await requireOrdineCreateAccess();
  const clienteId = input.clienteId?.trim() || "";
  const possibileId = input.possibileClienteId?.trim() || "";
  if (!clienteId && !possibileId) {
    return { success: true, telefoni: [], mail: [] };
  }

  const supabase = createServiceClient();
  const telefoni: ContattoRitiro[] = [];
  const mail: ContattoRitiro[] = [];
  const vistiTel = new Set<string>();
  const vistiMail = new Set<string>();

  if (clienteId) {
    const { data, error } = await supabase
      .from("clienti")
      .select("ragione_sociale, telefono, telefoni_generici, email, pec, email_generiche")
      .eq("id", clienteId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const nome = String(data?.ragione_sociale ?? "Azienda");
    aggiungi(telefoni, vistiTel, String(data?.telefono ?? ""), `${nome} · azienda`);
    for (const extra of data?.telefoni_generici ?? []) {
      aggiungi(telefoni, vistiTel, String(extra), `${nome} · azienda`);
    }
    aggiungi(mail, vistiMail, String(data?.email ?? ""), `${nome} · azienda`);
    aggiungi(mail, vistiMail, String(data?.pec ?? ""), `${nome} · PEC`);
    for (const extra of data?.email_generiche ?? []) {
      aggiungi(mail, vistiMail, String(extra), `${nome} · azienda`);
    }

    const { data: link, error: linkErr } = await supabase
      .from("clienti_referenti")
      .select("contatto_id")
      .eq("cliente_id", clienteId);
    if (linkErr) return { success: false, error: linkErr.message };
    const ids = (link ?? []).map((row) => String(row.contatto_id));
    if (ids.length) {
      const { data: contatti, error: contErr } = await supabase
        .from("rubrica_contatti")
        .select("nome, cognome, telefono, email, deleted_at")
        .in("id", ids);
      if (contErr) return { success: false, error: contErr.message };
      for (const contatto of contatti ?? []) {
        if (contatto.deleted_at) continue;
        const chi = `${String(contatto.nome ?? "").trim()} ${String(contatto.cognome ?? "").trim()}`.trim();
        const etichetta = chi ? `${chi} · referente` : "Referente";
        aggiungi(telefoni, vistiTel, String(contatto.telefono ?? ""), etichetta);
        aggiungi(mail, vistiMail, String(contatto.email ?? ""), etichetta);
      }
    }
  } else {
    const { data, error } = await supabase
      .from("clienti_possibili")
      .select("ragione_sociale, telefono, telefoni_generici, email, pec, email_generiche")
      .eq("id", possibileId)
      .maybeSingle();
    if (error) return { success: false, error: error.message };
    const nome = String(data?.ragione_sociale ?? "Azienda");
    aggiungi(telefoni, vistiTel, String(data?.telefono ?? ""), `${nome} · azienda`);
    for (const extra of data?.telefoni_generici ?? []) {
      aggiungi(telefoni, vistiTel, String(extra), `${nome} · azienda`);
    }
    aggiungi(mail, vistiMail, String(data?.email ?? ""), `${nome} · azienda`);
    aggiungi(mail, vistiMail, String(data?.pec ?? ""), `${nome} · PEC`);
    for (const extra of data?.email_generiche ?? []) {
      aggiungi(mail, vistiMail, String(extra), `${nome} · azienda`);
    }

    const { data: link, error: linkErr } = await supabase
      .from("clienti_possibili_referenti")
      .select("contatto_id")
      .eq("cliente_possibile_id", possibileId);
    if (linkErr) return { success: false, error: linkErr.message };
    const ids = (link ?? []).map((row) => String(row.contatto_id));
    if (ids.length) {
      const { data: contatti, error: contErr } = await supabase
        .from("rubrica_contatti")
        .select("nome, cognome, telefono, email, deleted_at")
        .in("id", ids);
      if (contErr) return { success: false, error: contErr.message };
      for (const contatto of contatti ?? []) {
        if (contatto.deleted_at) continue;
        const chi = `${String(contatto.nome ?? "").trim()} ${String(contatto.cognome ?? "").trim()}`.trim();
        const etichetta = chi ? `${chi} · referente` : "Referente";
        aggiungi(telefoni, vistiTel, String(contatto.telefono ?? ""), etichetta);
        aggiungi(mail, vistiMail, String(contatto.email ?? ""), etichetta);
      }
    }
  }

  return { success: true, telefoni, mail };
}

export async function leggiAvvisoRitiroOrdineAction(ordineId: string): Promise<
  | {
      success: true;
      attivo: boolean;
      email: string;
      etichetta: string;
      orari: boolean;
      sede: boolean;
      misure: boolean;
      peso: boolean;
      nessunaMail: boolean;
    }
  | { success: false; error: string }
> {
  await requireOrdineReadAccess();
  if (!ordineId) {
    return { success: false, error: "Ordine non indicato." };
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("ordini")
    .select(
      "ritiro_in_sede, avvisa_merce_pronta, avviso_valore, avviso_etichetta, avviso_includi_orari, avviso_includi_sede, avviso_includi_misure, avviso_includi_peso, nessuna_mail"
    )
    .eq("id", ordineId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) return { success: false, error: error.message };
  return {
    success: true,
    attivo: Boolean(data?.ritiro_in_sede && data?.avvisa_merce_pronta),
    email: String(data?.avviso_valore ?? ""),
    etichetta: String(data?.avviso_etichetta ?? ""),
    orari: Boolean(data?.avviso_includi_orari),
    sede: Boolean(data?.avviso_includi_sede),
    misure: Boolean(data?.avviso_includi_misure),
    peso: Boolean(data?.avviso_includi_peso),
    nessunaMail: Boolean(data?.nessuna_mail),
  };
}
