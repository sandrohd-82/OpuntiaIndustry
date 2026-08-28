"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess, requireWebmailAccess } from "@/lib/areas/guard";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AziendaTimelineItem } from "@/lib/amministrazione/azienda-timeline";
import { linkWebmailMessaggioAnagraficaAction } from "@/app/actions/webmail";

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

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function domainOf(email: string): string {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 0) return "";
  return e.slice(at + 1);
}

function pushUniqueEmail(
  set: Set<string>,
  list: Array<{ email: string; source: string }>,
  email: string,
  source: string
) {
  const e = normalizeEmail(email);
  if (!e || !e.includes("@") || set.has(e)) return;
  set.add(e);
  list.push({ email: e, source });
}

const CONSUMER_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "live.com",
  "icloud.com",
  "me.com",
  "libero.it",
  "virgilio.it",
  "alice.it",
]);

async function collectAziendaEmailHints(
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile",
  aziendaId: string
): Promise<{
  emails: Array<{ email: string; source: string }>;
  domains: string[];
}> {
  const service = createServiceClient();
  const emails: Array<{ email: string; source: string }> = [];
  const emailSet = new Set<string>();

  const table =
    aziendaTipo === "cliente"
      ? "clienti"
      : aziendaTipo === "fornitore"
        ? "fornitori"
        : "clienti_possibili";

  const { data: az } = await service
    .from(table)
    .select("email, pec")
    .eq("id", aziendaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (az) {
    pushUniqueEmail(emailSet, emails, String(az.email ?? ""), "scheda");
    pushUniqueEmail(emailSet, emails, String(az.pec ?? ""), "scheda PEC");
  }

  const { data: contatti } = await service
    .from("rubrica_contatti")
    .select("email, nome, cognome")
    .eq("azienda_tipo", aziendaTipo)
    .eq("azienda_id", aziendaId)
    .is("deleted_at", null)
    .limit(200);
  for (const c of contatti ?? []) {
    const who = [c.nome, c.cognome].filter(Boolean).join(" ").trim();
    pushUniqueEmail(
      emailSet,
      emails,
      String(c.email ?? ""),
      who ? `referente ${who}` : "referente"
    );
  }

  const domains = [
    ...new Set(
      emails
        .map((e) => domainOf(e.email))
        .filter((d) => d && !CONSUMER_DOMAINS.has(d))
    ),
  ];

  return { emails, domains };
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

  if (aziendaTipo === "cliente") {
    const { data } = await service
      .from("fatture_emesse")
      .select(
        "id, numero_interno, numero_fattura, data_emissione, totale, stato_pagamento"
      )
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

export type AziendaTimelineMailHint = {
  email: string;
  source: string;
};

export type AziendaTimelineMailHit = {
  id: string;
  subject: string;
  fromAddress: string;
  fromName: string;
  receivedAt: string | null;
  alreadyLinked: boolean;
  matchReason: string;
};

export async function listAziendaTimelineMailHintsAction(
  raw: unknown
): Promise<
  | {
      success: true;
      emails: AziendaTimelineMailHint[];
      domains: string[];
    }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Azienda non valida." };
  const hints = await collectAziendaEmailHints(
    parsed.data.aziendaTipo,
    parsed.data.aziendaId
  );
  return {
    success: true,
    emails: hints.emails,
    domains: hints.domains,
  };
}

const searchSchema = inputSchema.extend({
  emailQuery: z.string().trim().max(200).optional().default(""),
});

export async function searchWebmailForAziendaTimelineAction(
  raw: unknown
): Promise<
  | { success: true; items: AziendaTimelineMailHit[]; domains: string[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  await requireWebmailAccess();
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Ricerca non valida." };

  const { aziendaTipo, aziendaId, emailQuery } = parsed.data;
  const hints = await collectAziendaEmailHints(aziendaTipo, aziendaId);
  const manual = normalizeEmail(emailQuery);

  const orParts: string[] = [];
  if (manual) {
    orParts.push(`from_address.ilike.%${manual}%`);
  } else {
    for (const e of hints.emails) {
      orParts.push(`from_address.ilike.%${e.email}%`);
    }
    for (const d of hints.domains) {
      orParts.push(`from_address.ilike.%@${d}%`);
    }
  }

  if (orParts.length === 0) {
    return { success: true, items: [], domains: hints.domains };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("webmail_messaggi")
    .select(
      "id, subject, from_address, from_name, received_at, azienda_tipo, azienda_id"
    )
    .is("deleted_at", null)
    .or(orParts.join(","))
    .order("received_at", { ascending: false })
    .limit(60);

  if (error) return { success: false, error: error.message };

  const emailSet = new Set(hints.emails.map((e) => e.email));
  const domainSet = new Set(hints.domains);

  const items: AziendaTimelineMailHit[] = (data ?? []).map((r) => {
    const from = normalizeEmail(String(r.from_address ?? ""));
    const dom = domainOf(from);
    let matchReason = "ricerca";
    if (manual && from.includes(manual)) matchReason = "indirizzo cercato";
    else if (emailSet.has(from)) matchReason = "scheda / referente";
    else if (dom && domainSet.has(dom)) matchReason = `dominio @${dom}`;

    const alreadyLinked =
      String(r.azienda_tipo ?? "") === aziendaTipo &&
      String(r.azienda_id ?? "") === aziendaId;

    return {
      id: String(r.id),
      subject: String(r.subject ?? "(senza oggetto)"),
      fromAddress: String(r.from_address ?? ""),
      fromName: String(r.from_name ?? ""),
      receivedAt: (r.received_at as string | null) ?? null,
      alreadyLinked,
      matchReason,
    };
  });

  return { success: true, items, domains: hints.domains };
}

const linkSchema = inputSchema.extend({
  messaggioId: z.string().uuid(),
  aziendaLabel: z.string().trim().max(300).optional().default(""),
});

export async function linkWebmailToAziendaTimelineAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = linkSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };

  const res = await linkWebmailMessaggioAnagraficaAction({
    messaggioId: parsed.data.messaggioId,
    aziendaTipo: parsed.data.aziendaTipo,
    aziendaId: parsed.data.aziendaId,
    aziendaLabel: parsed.data.aziendaLabel || "",
    linkStato: "collegata",
    rematch: false,
  });
  if (!res.success) return { success: false, error: res.error };

  await writeAuditLog({
    entity_type: "webmail_messaggi",
    entity_id: parsed.data.messaggioId,
    action: "link_timeline_azienda",
    actor_id: auth.userId,
    summary: `Mail collegata a timeline ${parsed.data.aziendaTipo}`,
    payload: {
      aziendaId: parsed.data.aziendaId,
      aziendaTipo: parsed.data.aziendaTipo,
    },
  });

  return { success: true };
}
