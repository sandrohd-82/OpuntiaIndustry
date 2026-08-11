"use server";

import {
  buildFatturaSyncQueueItem,
  normalizeVatKey,
  type FatturaSyncQueueItem,
} from "@/lib/amministrazione/fatture-sync";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchIssuedInvoices,
  fetchReceivedInvoices,
  getFicConfig,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type { ClienteRow, FornitoreRow } from "@/types/database";

export type FattureSyncStartResult =
  | {
      success: true;
      items: FatturaSyncQueueItem[];
      skippedAlreadyRegistered: number;
    }
  | { success: false; error: string };

export async function startFattureEmesseSyncAction(): Promise<FattureSyncStartResult> {
  await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Configurazione Fatture in Cloud mancante.",
    };
  }

  const supabase = await createClient();
  const [docs, clientiRes, registeredRes] = await Promise.all([
    fetchIssuedInvoices(null),
    supabase.from("clienti").select("*").is("deleted_at", null),
    supabase
      .from("fatture_emesse")
      .select("fic_id")
      .is("deleted_at", null)
      .not("fic_id", "is", null),
  ]);

  if (clientiRes.error) {
    return { success: false, error: clientiRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }

  const registered = new Set(
    (registeredRes.data ?? [])
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  const clienti = (clientiRes.data ?? []) as ClienteRow[];
  const byVat = new Map<string, ClienteRow>();
  for (const c of clienti) {
    const key = normalizeVatKey(c.partita_iva);
    if (key) byVat.set(key, c);
  }

  const pending = docs.filter((d) => !registered.has(d.ficId));
  const skippedAlreadyRegistered = docs.length - pending.length;

  const usedTarghe = new Set(
    clienti.map((c) => c.codice_targa.trim().toUpperCase()).filter(Boolean)
  );

  const items: FatturaSyncQueueItem[] = [];
  for (const doc of pending) {
    const vat = normalizeVatKey(doc.entityVat);
    const existing = vat ? byVat.get(vat) ?? null : null;
    let proposedTarga = existing?.codice_targa ?? "";
    if (!existing) {
      proposedTarga = nextSequentialCodiceTarga("C", [...usedTarghe]);
      usedTarghe.add(proposedTarga);
    }
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "emessa",
        existingId: existing?.id ?? null,
        existingLabel: existing
          ? `${existing.codice_targa} — ${existing.ragione_sociale}`
          : null,
        proposedTarga,
      })
    );
  }

  items.sort((a, b) =>
    (b.dataEmissione || "").localeCompare(a.dataEmissione || "")
  );

  return { success: true, items, skippedAlreadyRegistered };
}

export async function startFattureRicevuteSyncAction(): Promise<FattureSyncStartResult> {
  await requireAreaAccess("amministrazione");
  try {
    getFicConfig();
  } catch (e) {
    return {
      success: false,
      error:
        e instanceof Error
          ? e.message
          : "Configurazione Fatture in Cloud mancante.",
    };
  }

  const supabase = await createClient();
  const [docs, fornitoriRes, registeredRes] = await Promise.all([
    fetchReceivedInvoices(null),
    supabase.from("fornitori").select("*").is("deleted_at", null),
    supabase
      .from("fatture_ricevute")
      .select("fic_id")
      .is("deleted_at", null)
      .not("fic_id", "is", null),
  ]);

  if (fornitoriRes.error) {
    return { success: false, error: fornitoriRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }

  const registered = new Set(
    (registeredRes.data ?? [])
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  const fornitori = (fornitoriRes.data ?? []) as FornitoreRow[];
  const byVat = new Map<string, FornitoreRow>();
  for (const f of fornitori) {
    const key = normalizeVatKey(f.partita_iva);
    if (key) byVat.set(key, f);
  }

  const pending = docs.filter((d) => !registered.has(d.ficId));
  const skippedAlreadyRegistered = docs.length - pending.length;

  const usedTarghe = new Set(
    fornitori.map((f) => f.codice_targa.trim().toUpperCase()).filter(Boolean)
  );

  const items: FatturaSyncQueueItem[] = [];
  for (const doc of pending) {
    const vat = normalizeVatKey(doc.entityVat);
    const existing = vat ? byVat.get(vat) ?? null : null;
    let proposedTarga = existing?.codice_targa ?? "";
    if (!existing) {
      proposedTarga = nextSequentialCodiceTarga("F", [...usedTarghe]);
      usedTarghe.add(proposedTarga);
    }
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "ricevuta",
        existingId: existing?.id ?? null,
        existingLabel: existing
          ? `${existing.codice_targa} — ${existing.ragione_sociale}`
          : null,
        proposedTarga,
      })
    );
  }

  items.sort((a, b) =>
    (b.dataEmissione || "").localeCompare(a.dataEmissione || "")
  );

  return { success: true, items, skippedAlreadyRegistered };
}
