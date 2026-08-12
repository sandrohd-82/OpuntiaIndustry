"use server";

import {
  amountMatchScore,
  buildFatturaSyncQueueItem,
  creditNotesRelatedToInvoice,
  matchCreditNoteToFattura,
  normalizeVatKey,
  sortPendingInvoicesByNcAmount,
  type FatturaSyncQueueItem,
  type RegisteredFatturaHint,
} from "@/lib/amministrazione/fatture-sync";
import { nextSequentialCodiceTarga } from "@/lib/amministrazione/codice-targa";
import { rinumeraTutteFattureEmesseAction } from "@/app/actions/fatture";
import { requireAreaAccess } from "@/lib/areas/guard";
import {
  fetchIssuedCreditNotes,
  fetchIssuedInvoices,
  fetchReceivedInvoices,
  getFicConfig,
  type FicDocumentNormalized,
} from "@/lib/fic";
import { createClient } from "@/lib/supabase/server";
import type { ClienteRow, FornitoreRow } from "@/types/database";

export type FattureSyncStartResult =
  | {
      success: true;
      items: FatturaSyncQueueItem[];
      skippedAlreadyRegistered: number;
      creditNotesPending: number;
    }
  | { success: false; error: string };

function resolveClienteForDoc(
  doc: FicDocumentNormalized,
  byVat: Map<string, ClienteRow>,
  usedTarghe: Set<string>
): {
  existingId: string | null;
  existingLabel: string | null;
  proposedTarga: string;
} {
  const vat = normalizeVatKey(doc.entityVat);
  const existing = vat ? byVat.get(vat) ?? null : null;
  let proposedTarga = existing?.codice_targa ?? "";
  if (!existing) {
    proposedTarga = nextSequentialCodiceTarga("C", [...usedTarghe]);
    usedTarghe.add(proposedTarga);
  }
  return {
    existingId: existing?.id ?? null,
    existingLabel: existing
      ? `${existing.codice_targa} — ${existing.ragione_sociale}`
      : null,
    proposedTarga,
  };
}

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

  // Prima della coda: riallinea sempre i progressivi alla data di emissione
  const rinum = await rinumeraTutteFattureEmesseAction();
  if (!rinum.success) {
    return { success: false, error: `Rinumerazione: ${rinum.error}` };
  }

  const supabase = await createClient();
  const [invoices, creditNotes, clientiRes, registeredRes] =
    await Promise.all([
      fetchIssuedInvoices(null),
      fetchIssuedCreditNotes(null),
      supabase.from("clienti").select("*").is("deleted_at", null),
      supabase
        .from("fatture_emesse")
        .select(
          "id, fic_id, numero_interno, numero_documento_esterno, cliente_id, cliente_codice_targa, data_emissione, totale, tipo_documento"
        )
        .is("deleted_at", null),
    ]);

  if (clientiRes.error) {
    return { success: false, error: clientiRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }

  const registeredRows = registeredRes.data ?? [];
  const registeredFicIds = new Set(
    registeredRows
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );

  const clienti = (clientiRes.data ?? []) as ClienteRow[];
  const byVat = new Map<string, ClienteRow>();
  for (const c of clienti) {
    const key = normalizeVatKey(c.partita_iva);
    if (key) byVat.set(key, c);
  }
  const clienteById = new Map(clienti.map((c) => [c.id, c]));

  const registeredFattureOnly: RegisteredFatturaHint[] = registeredRows
    .filter((r) => (r.tipo_documento ?? "fattura") !== "nota_credito")
    .map((r) => {
      const cliente = clienteById.get(String(r.cliente_id));
      return {
        id: String(r.id),
        numeroInterno: String(r.numero_interno ?? ""),
        numeroEsterno: String(r.numero_documento_esterno ?? ""),
        clienteId: String(r.cliente_id),
        entityVat: cliente?.partita_iva ?? "",
        dataEmissione: String(r.data_emissione ?? ""),
        totale: Number(r.totale) || 0,
      };
    });

  const pendingInvoices = invoices.filter((d) => !registeredFicIds.has(d.ficId));
  const pendingCredits = creditNotes.filter(
    (d) => !registeredFicIds.has(d.ficId)
  );
  const skippedAlreadyRegistered =
    invoices.length +
    creditNotes.length -
    pendingInvoices.length -
    pendingCredits.length;

  const usedTarghe = new Set(
    clienti.map((c) => c.codice_targa.trim().toUpperCase()).filter(Boolean)
  );

  const usedNcFicIds = new Set<number>();
  const items: FatturaSyncQueueItem[] = [];

  // 1) Note di credito collegate a fatture GIÀ registrate → prima di tutto
  const linkedToRegistered = pendingCredits
    .map((doc) => ({
      doc,
      linked: matchCreditNoteToFattura(doc, registeredFattureOnly),
    }))
    .filter((x) => x.linked?.fatturaId);

  // Cronologico: dalla data più lontana a quella più vicina a oggi
  linkedToRegistered.sort((a, b) =>
    (a.doc.date || "").localeCompare(b.doc.date || "")
  );

  for (const { doc, linked } of linkedToRegistered) {
    usedNcFicIds.add(doc.ficId);
    const anag = resolveClienteForDoc(doc, byVat, usedTarghe);
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "nota_credito",
        ...anag,
        linkedFattura: linked,
      })
    );
  }

  // 2) Per ogni fattura pendente (più vecchia prima): NC correlate, poi fattura
  const invoicesSorted = [...pendingInvoices].sort((a, b) =>
    (a.date || "").localeCompare(b.date || "")
  );

  for (const inv of invoicesSorted) {
    const related = creditNotesRelatedToInvoice(inv, pendingCredits)
      .filter((nc) => !usedNcFicIds.has(nc.ficId))
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    for (const nc of related) {
      usedNcFicIds.add(nc.ficId);
      const anag = resolveClienteForDoc(nc, byVat, usedTarghe);
      const linked = matchCreditNoteToFattura(nc, [
        ...registeredFattureOnly,
        {
          id: "",
          numeroInterno: "",
          numeroEsterno: inv.number,
          clienteId: anag.existingId ?? "",
          entityVat: inv.entityVat,
          dataEmissione: inv.date || "",
          totale: inv.amountGross,
        },
      ]);
      items.push(
        buildFatturaSyncQueueItem({
          doc: nc,
          kind: "nota_credito",
          ...anag,
          linkedFattura: linked ?? {
            fatturaId: null,
            numeroInterno: "",
            numeroEsterno: inv.number,
            motivo: "Nota di credito correlata alla fattura in registrazione",
          },
        })
      );
    }

    const anagInv = resolveClienteForDoc(inv, byVat, usedTarghe);
    items.push(
      buildFatturaSyncQueueItem({
        doc: inv,
        kind: "emessa",
        ...anagInv,
        linkedFattura: null,
      })
    );
  }

  // 3) NC residue (senza match forte) — ancora dalla più vecchia
  const orphanCredits = pendingCredits
    .filter((d) => !usedNcFicIds.has(d.ficId))
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  for (const doc of orphanCredits) {
    const anag = resolveClienteForDoc(doc, byVat, usedTarghe);
    const linked = matchCreditNoteToFattura(doc, registeredFattureOnly);
    items.push(
      buildFatturaSyncQueueItem({
        doc,
        kind: "nota_credito",
        ...anag,
        linkedFattura: linked,
      })
    );
  }

  return {
    success: true,
    items,
    skippedAlreadyRegistered,
    creditNotesPending: pendingCredits.length,
  };
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
        linkedFattura: null,
      })
    );
  }

  items.sort((a, b) =>
    (b.dataEmissione || "").localeCompare(a.dataEmissione || "")
  );

  return {
    success: true,
    items,
    skippedAlreadyRegistered,
    creditNotesPending: 0,
  };
}

export type PendingFicInvoiceCandidate = FatturaSyncQueueItem & {
  amountClose: boolean;
  amountDelta: number;
};

/**
 * Fatture FiC emesse ancora da sincronizzare per un cliente,
 * priorità a importo uguale/affine alla nota di credito.
 */
export async function listPendingFicInvoicesForClienteAction(input: {
  clienteId: string;
  importoNc: number;
  excludeFicIds?: number[];
}): Promise<
  | { success: true; items: PendingFicInvoiceCandidate[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  if (!input.clienteId) {
    return { success: true, items: [] };
  }

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
  const [clienteRes, registeredRes, invoices] = await Promise.all([
    supabase
      .from("clienti")
      .select("*")
      .eq("id", input.clienteId)
      .is("deleted_at", null)
      .maybeSingle(),
    supabase
      .from("fatture_emesse")
      .select("fic_id")
      .is("deleted_at", null),
    fetchIssuedInvoices(null),
  ]);

  if (clienteRes.error) {
    return { success: false, error: clienteRes.error.message };
  }
  if (registeredRes.error) {
    return { success: false, error: registeredRes.error.message };
  }
  const cliente = clienteRes.data as ClienteRow | null;
  if (!cliente) {
    return { success: false, error: "Cliente non trovato." };
  }

  const registeredFicIds = new Set(
    (registeredRes.data ?? [])
      .map((r) => Number(r.fic_id))
      .filter((n) => Number.isFinite(n) && n > 0)
  );
  const excluded = new Set(
    (input.excludeFicIds ?? []).filter((n) => Number.isFinite(n) && n > 0)
  );

  const vat = normalizeVatKey(cliente.partita_iva);

  const pending = invoices.filter((d) => {
    if (registeredFicIds.has(d.ficId)) return false;
    if (excluded.has(d.ficId)) return false;
    const docVat = normalizeVatKey(d.entityVat);
    if (vat && docVat) return docVat === vat;
    // Fallback: nome ragione sociale (normalizzato) se manca P.IVA
    if (!vat && !docVat) {
      const a = (cliente.ragione_sociale || "").trim().toLowerCase();
      const b = (d.entityName || "").trim().toLowerCase();
      return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
    }
    return false;
  });

  const sorted = sortPendingInvoicesByNcAmount(pending, input.importoNc);
  const target = Math.abs(input.importoNc);
  const items: PendingFicInvoiceCandidate[] = sorted.map((doc) => {
    const score = amountMatchScore(doc.amountGross, target);
    const base = buildFatturaSyncQueueItem({
      doc,
      kind: "emessa",
      existingId: cliente.id,
      existingLabel: `${cliente.codice_targa} — ${cliente.ragione_sociale}`,
      proposedTarga: cliente.codice_targa,
      linkedFattura: null,
    });
    return {
      ...base,
      anagraficaMode: "existing",
      amountClose: score.close,
      amountDelta: score.delta,
    };
  });

  return { success: true, items };
}
