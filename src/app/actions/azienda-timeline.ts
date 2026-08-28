"use server";

import { z } from "zod";
import { requireAreaAccess } from "@/lib/areas/guard";
import { createServiceClient } from "@/lib/supabase/server";
import type { AziendaTimelineItem } from "@/lib/amministrazione/azienda-timeline";

const inputSchema = z.object({
  aziendaTipo: z.enum(["cliente", "fornitore", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
});

function pushSorted(
  items: AziendaTimelineItem[],
  item: AziendaTimelineItem
) {
  if (!item.occurredAt) return;
  items.push(item);
}

/**
 * Timeline unificata per azienda (ordine crescente data/ora).
 * Sorgenti: webmail, rubrica_timeline, note, ordini, fatture.
 */
export async function listAziendaTimelineAction(raw: unknown): Promise<
  | { success: true; items: AziendaTimelineItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Azienda non valida." };
  }
  const { aziendaTipo, aziendaId } = parsed.data;
  const service = createServiceClient();
  const items: AziendaTimelineItem[] = [];

  // 1) WebMail
  {
    const { data } = await service
      .from("webmail_messaggi")
      .select("id, subject, from_address, from_name, received_at")
      .eq("azienda_tipo", aziendaTipo)
      .eq("azienda_id", aziendaId)
      .is("deleted_at", null)
      .order("received_at", { ascending: true })
      .limit(300);
    for (const r of data ?? []) {
      const when = (r.received_at as string | null) ?? null;
      if (!when) continue;
      pushSorted(items, {
        id: `webmail:${r.id}`,
        kind: "webmail",
        occurredAt: when,
        title: String(r.subject ?? "(senza oggetto)"),
        subtitle: `Mail da ${r.from_name || r.from_address || "—"}`,
        href: "/app/webmail/caselle",
      });
    }
  }

  // 2) Rubrica timeline via contatti dell'azienda
  {
    const { data: contatti } = await service
      .from("rubrica_contatti")
      .select("id, nome, cognome")
      .eq("azienda_tipo", aziendaTipo)
      .eq("azienda_id", aziendaId)
      .is("deleted_at", null)
      .limit(200);
    const contattoIds = (contatti ?? []).map((c) => String(c.id));
    const nameById = new Map(
      (contatti ?? []).map((c) => [
        String(c.id),
        [c.nome, c.cognome].filter(Boolean).join(" ").trim() || "Referente",
      ])
    );
    if (contattoIds.length > 0) {
      const { data: tl } = await service
        .from("rubrica_timeline")
        .select(
          "id, contatto_id, occurred_at, riassunto, modalita, argomenti"
        )
        .in("contatto_id", contattoIds)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: true })
        .limit(400);
      for (const r of tl ?? []) {
        const when = (r.occurred_at as string | null) ?? null;
        if (!when) continue;
        const who = nameById.get(String(r.contatto_id)) ?? "Referente";
        pushSorted(items, {
          id: `rubrica:${r.id}`,
          kind: "rubrica",
          occurredAt: when,
          title: String(r.riassunto ?? "Evento rubrica"),
          subtitle: `${who} · ${r.modalita ?? "evento"}${
            r.argomenti ? ` · ${r.argomenti}` : ""
          }`,
          href: "/app/amministrazione/rubrica",
        });
      }
    }
  }

  // 3) Note
  {
    const { data } = await service
      .from("pn_note")
      .select("id, titolo, body, due_at, created_at, colore")
      .eq("entity_type", aziendaTipo)
      .eq("entity_id", aziendaId)
      .is("deleted_at", null)
      .limit(200);
    for (const r of data ?? []) {
      const when =
        (r.due_at as string | null) || (r.created_at as string | null);
      if (!when) continue;
      pushSorted(items, {
        id: `nota:${r.id}`,
        kind: "nota",
        occurredAt: when,
        title: String(r.titolo || "Nota").trim() || "Nota",
        subtitle: String(r.body ?? "").slice(0, 120),
        href: "/app/promemorie-e-note",
      });
    }
  }

  // 4) Ordini (solo clienti)
  if (aziendaTipo === "cliente") {
    const { data } = await service
      .from("ordini")
      .select("id, numero_interno, data_ordine, stato, importo_euro")
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null)
      .order("data_ordine", { ascending: true })
      .limit(200);
    for (const r of data ?? []) {
      const when = (r.data_ordine as string | null) ?? null;
      if (!when) continue;
      const day = when.length === 10 ? `${when}T12:00:00.000Z` : when;
      pushSorted(items, {
        id: `ordine:${r.id}`,
        kind: "ordine",
        occurredAt: day,
        title: `Ordine ${r.numero_interno ?? ""}`.trim(),
        subtitle: `Stato: ${r.stato ?? "—"} · Totale: ${r.importo_euro ?? "—"}`,
        href: "/app/amministrazione/ordini",
      });
    }
  }

  // 5) Fatture emesse (cliente)
  if (aziendaTipo === "cliente") {
    const { data } = await service
      .from("fatture_emesse")
      .select("id, numero_interno, numero_fattura, data_emissione, totale, stato_pagamento")
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null)
      .order("data_emissione", { ascending: true })
      .limit(200);
    for (const r of data ?? []) {
      const when = (r.data_emissione as string | null) ?? null;
      if (!when) continue;
      const day = when.length === 10 ? `${when}T12:00:00.000Z` : when;
      pushSorted(items, {
        id: `fe:${r.id}`,
        kind: "fattura_emessa",
        occurredAt: day,
        title: `Fattura emessa ${r.numero_fattura || r.numero_interno || ""}`.trim(),
        subtitle: `Pagamento: ${r.stato_pagamento ?? "—"} · Totale: ${r.totale ?? "—"}`,
        href: "/app/amministrazione/fatture",
      });
    }
  }

  // 6) Fatture ricevute (fornitore)
  if (aziendaTipo === "fornitore") {
    const { data } = await service
      .from("fatture_ricevute")
      .select(
        "id, numero_interno, numero_documento_esterno, data_emissione, totale, stato_pagamento"
      )
      .eq("fornitore_id", aziendaId)
      .is("deleted_at", null)
      .order("data_emissione", { ascending: true })
      .limit(200);
    for (const r of data ?? []) {
      const when = (r.data_emissione as string | null) ?? null;
      if (!when) continue;
      const day = when.length === 10 ? `${when}T12:00:00.000Z` : when;
      pushSorted(items, {
        id: `fr:${r.id}`,
        kind: "fattura_ricevuta",
        occurredAt: day,
        title: `Fattura ricevuta ${
          r.numero_documento_esterno || r.numero_interno || ""
        }`.trim(),
        subtitle: `Pagamento: ${r.stato_pagamento ?? "—"} · Totale: ${r.totale ?? "—"}`,
        href: "/app/amministrazione/fatture",
      });
    }
  }

  items.sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
  );

  return { success: true, items };
}
