"use server";

import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { requireAreaAccess, requireWebmailAccess } from "@/lib/areas/guard";
import { resolveWebmailAccountVisibility } from "@/lib/webmail/account-access";
import {
  assertAnagraficaPrivilege,
  kindFromAziendaTipo,
} from "@/lib/auth/anagrafica-privileges-server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AziendaTimelineItem } from "@/lib/amministrazione/azienda-timeline";
import {
  upsertTimelinePnCopia,
  type TimelinePnOrigine,
} from "@/lib/amministrazione/timeline-pn-copie";
import {
  findWebmailMatchesForAziendaEmails,
  linkUnlinkedWebmailByEmails,
  linkWebmailMessaggioAnagraficaAction,
} from "@/app/actions/webmail";

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
  ragioneSociale: string;
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
    .select("email, pec, ragione_sociale")
    .eq("id", aziendaId)
    .is("deleted_at", null)
    .maybeSingle();
  const ragioneSociale = String(az?.ragione_sociale ?? "").trim();
  if (az) {
    pushUniqueEmail(emailSet, emails, String(az.email ?? ""), "scheda");
    pushUniqueEmail(emailSet, emails, String(az.pec ?? ""), "scheda PEC");
  }
  if (aziendaTipo === "cliente" || aziendaTipo === "cliente_possibile") {
    const extraTable =
      aziendaTipo === "cliente" ? "clienti" : "clienti_possibili";
    const { data: extraRow } = await service
      .from(extraTable)
      .select("email_generiche")
      .eq("id", aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    const extra = extraRow?.email_generiche;
    if (Array.isArray(extra)) {
      for (const raw of extra) {
        pushUniqueEmail(emailSet, emails, String(raw ?? ""), "email generica");
      }
    }
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

  if (aziendaTipo === "cliente" || aziendaTipo === "cliente_possibile") {
    const { data: brand } = await service
      .from("anagrafica_brand")
      .select("email, nome")
      .eq("owner_kind", aziendaTipo)
      .eq("owner_id", aziendaId)
      .is("deleted_at", null)
      .limit(80);
    for (const b of brand ?? []) {
      const nome = String(b.nome ?? "").trim();
      pushUniqueEmail(
        emailSet,
        emails,
        String(b.email ?? ""),
        nome ? `brand ${nome}` : "brand"
      );
    }
  }

  const domains = [
    ...new Set(
      emails
        .map((e) => domainOf(e.email))
        .filter((d) => d && !CONSUMER_DOMAINS.has(d))
    ),
  ];

  return { emails, domains, ragioneSociale };
}

/**
 * Timeline unificata per azienda (ordine crescente data/ora).
 * Sorgenti: webmail, rubrica_timeline, note, ordini, fatture.
 */
export async function listAziendaTimelineAction(raw: unknown): Promise<
  | { success: true; items: AziendaTimelineItem[] }
  | { success: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { success: false, error: "Azienda non valida." };
  }
  const { aziendaTipo, aziendaId } = parsed.data;
  const service = createServiceClient();
  const table =
    aziendaTipo === "cliente"
      ? "clienti"
      : aziendaTipo === "fornitore"
        ? "fornitori"
        : "clienti_possibili";
  const { data: azRow } = await service
    .from(table)
    .select("created_by")
    .eq("id", aziendaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!azRow) {
    return { success: false, error: "Azienda non trovata." };
  }
  let commercialeId: string | null = null;
  if (aziendaTipo !== "fornitore") {
    const { data: azComm } = await service
      .from(table)
      .select("commerciale_id")
      .eq("id", aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    const raw = (azComm as { commerciale_id?: string | null } | null)
      ?.commerciale_id;
    commercialeId = raw ? String(raw) : null;
  }
  const timelineKind = kindFromAziendaTipo(aziendaTipo);
  if (timelineKind) {
    const tlGate = await assertAnagraficaPrivilege({
      kind: timelineKind,
      op: "timeline",
      createdBy: azRow.created_by ? String(azRow.created_by) : null,
      commercialeId,
    });
    if (!tlGate.ok) return { success: false, error: tlGate.error };
  }
  const items: AziendaTimelineItem[] = [];
  const vis = await resolveWebmailAccountVisibility(auth);
  const grantedIds = vis.mode === "granted" ? vis.ids : null;

  if (!grantedIds || grantedIds.length > 0) {
    let mailQ = service
      .from("webmail_messaggi")
      .select(
        "id, subject, from_address, from_name, to_addresses, received_at, sent_at, direction"
      )
      .eq("azienda_tipo", aziendaTipo)
      .eq("azienda_id", aziendaId)
      .is("deleted_at", null)
      .order("received_at", { ascending: true })
      .limit(300);
    if (grantedIds) mailQ = mailQ.in("account_id", grantedIds);
    const { data } = await mailQ;
    for (const r of data ?? []) {
      const outbound = String(r.direction ?? "") === "outbound";
      const when =
        (outbound
          ? ((r.sent_at as string | null) ?? (r.received_at as string | null))
          : (r.received_at as string | null)) ?? null;
      if (!when) continue;
      const toFirst = Array.isArray(r.to_addresses)
        ? String(r.to_addresses[0] ?? "")
        : "";
      pushSorted(items, {
        id: `webmail:${r.id}`,
        kind: "webmail",
        occurredAt: when,
        title: String(r.subject ?? "(senza oggetto)"),
        subtitle: outbound
          ? `Mail inviata a ${toFirst || "—"}`
          : `Mail da ${r.from_name || r.from_address || "—"}`,
        sourceId: String(r.id),
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
      .select(
        "id, titolo, body, body_rich, allegati, due_at, created_at, colore"
      )
      .eq("entity_type", aziendaTipo)
      .eq("entity_id", aziendaId)
      .is("deleted_at", null)
      .limit(200);
    for (const r of data ?? []) {
      const createdAt = r.created_at as string | null;
      if (!createdAt) continue;
      const dueAt = (r.due_at as string | null) ?? null;
      // Posizione = data evento (due_at), altrimenti inserimento. created_at resta audit.
      const occurredAt = dueAt || createdAt;
      const body = String(r.body ?? "");
      const bodyRich = String(r.body_rich ?? body);
      const allegati = Array.isArray(r.allegati)
        ? (r.allegati as Array<{
            id: string;
            kind: string;
            label: string;
            url: string;
            storagePath?: string;
          }>)
        : [];
      pushSorted(items, {
        id: `nota:${r.id}`,
        kind: "nota",
        occurredAt,
        title: String(r.titolo || "Nota").trim() || "Nota",
        subtitle: body.slice(0, 120),
        href: "/app/promemorie-e-note",
        notaId: String(r.id),
        notaBody: body,
        notaBodyRich: bodyRich,
        notaDueAt: dueAt,
        notaCreatedAt: createdAt,
        notaAllegati: allegati,
      });
    }
  }

  if (aziendaTipo === "cliente" || aziendaTipo === "cliente_possibile") {
    const { data } = await service
      .from("ordini")
      .select("id, numero_interno, data_ordine, stato, importo_euro")
      .eq(
        aziendaTipo === "cliente" ? "cliente_id" : "cliente_possibile_id",
        aziendaId
      )
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

    const { data: camp } = await service
      .from("campionature")
      .select(
        "id, numero_interno, data_invio, stato, mezzo, origine, tracking_url, pn_nota_id"
      )
      .eq(
        aziendaTipo === "cliente" ? "cliente_id" : "cliente_possibile_id",
        aziendaId
      )
      .is("deleted_at", null)
      .order("data_invio", { ascending: true })
      .limit(200);
    for (const r of camp ?? []) {
      const when = (r.data_invio as string | null) ?? null;
      if (!when) continue;
      const day = when.length === 10 ? `${when}T12:00:00.000Z` : when;
      pushSorted(items, {
        id: `campionatura:${r.id}`,
        kind: "campionatura",
        occurredAt: day,
        title: `Campionatura ${r.numero_interno ?? ""}`.trim(),
        subtitle: [
          `Stato: ${r.stato ?? "—"}`,
          r.origine === "storico" ? "Storico" : null,
          `Mezzo: ${r.mezzo ?? "—"}`,
          r.tracking_url ? "Tracking" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        href:
          typeof r.tracking_url === "string" && r.tracking_url
            ? String(r.tracking_url)
            : "/app/amministrazione/ordini",
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
        sourceId: String(r.id),
        href: "/app/amministrazione/fatture",
      });
    }
  }

  {
    let promoQ = service
      .from("clienti_possibili_promozioni")
      .select(
        "id, stato, numero_fattura, data_fattura, totale, completed_at, created_at, cliente_id, cliente_possibile_id"
      )
      .is("deleted_at", null)
      .limit(80);
    promoQ =
      aziendaTipo === "cliente"
        ? promoQ.eq("cliente_id", aziendaId)
        : aziendaTipo === "cliente_possibile"
          ? promoQ.eq("cliente_possibile_id", aziendaId)
          : promoQ.eq("id", "00000000-0000-0000-0000-000000000000");
    const { data: promozioni } = await promoQ;
    for (const r of promozioni ?? []) {
      const when =
        (r.completed_at as string | null) ||
        (r.created_at as string | null) ||
        "";
      if (!when) continue;
      const fat = String(r.numero_fattura ?? "").trim();
      const aperta = String(r.stato) === "aperta";
      pushSorted(items, {
        id: `promo:${r.id}`,
        kind: "promozione_cliente",
        occurredAt: when,
        title: aperta
          ? "Fattura rilevata — attende promozione a cliente"
          : "Promosso da possibile cliente a cliente",
        subtitle: [
          fat ? `Fattura ${fat}` : null,
          r.totale != null ? `Totale: ${r.totale}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        sourceId: String(r.id),
        href: "/app/amministrazione/schede/possibili-clienti",
      });
    }
  }

  {
    const { data: copie } = await service
      .from("azienda_timeline_pn_copie")
      .select("id, origine_tipo, origine_id, occurred_at, titolo, testo")
      .eq("azienda_tipo", aziendaTipo)
      .eq("azienda_id", aziendaId)
      .is("deleted_at", null)
      .limit(400);
    const copiaKeys = new Set<string>();
    for (const r of copie ?? []) {
      const when = r.occurred_at as string | null;
      if (!when) continue;
      const origine = String(r.origine_tipo) as TimelinePnOrigine;
      copiaKeys.add(`${origine}:${r.origine_id}`);
      const kind =
        origine === "attivita"
          ? "copia_attivita"
          : origine === "promemoria"
            ? "copia_promemoria"
            : "copia_nota";
      const testo = String(r.testo ?? "");
      pushSorted(items, {
        id: `pn-copia:${r.id}`,
        kind,
        occurredAt: when,
        title: String(r.titolo || etichettaPnOrigine(origine)).trim(),
        subtitle: testo.slice(0, 140),
        sourceId: String(r.origine_id),
        href: "/app/promemorie-e-note",
        notaBody: testo,
        notaBodyRich: testo,
      });
    }

    const mentionKind =
      aziendaTipo === "cliente"
        ? "cliente"
        : aziendaTipo === "cliente_possibile"
          ? "cliente_possibile"
          : "fornitore";
    const { data: cols } = await service
      .from("pn_attivita_collegamenti")
      .select("attivita_id")
      .eq("kind", mentionKind)
      .eq("entity_id", aziendaId)
      .is("deleted_at", null)
      .limit(200);
    const attivitaIds = [
      ...new Set(
        (cols ?? [])
          .map((r) => String(r.attivita_id))
          .filter((id) => id && !copiaKeys.has(`attivita:${id}`))
      ),
    ];
    if (attivitaIds.length) {
      const { data: att } = await service
        .from("pn_attivita")
        .select("id, titolo, descrizione, due_at, created_at")
        .in("id", attivitaIds)
        .is("deleted_at", null);
      for (const r of att ?? []) {
        const when = (r.due_at as string | null) || (r.created_at as string | null);
        if (!when) continue;
        const testo = String(r.descrizione ?? "");
        pushSorted(items, {
          id: `pn-att:${r.id}`,
          kind: "copia_attivita",
          occurredAt: when,
          title: String(r.titolo || "Attività").trim(),
          subtitle: testo.slice(0, 140),
          sourceId: String(r.id),
          href: "/app/promemorie-e-note",
          notaBody: testo,
          notaBodyRich: testo,
        });
      }
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
        sourceId: String(r.id),
        href: "/app/amministrazione/fatture",
      });
    }
  }

  items.sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });

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
  toAddresses: string[];
  direction: "inbound" | "outbound";
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
  const { auth } = await requireAreaAccess("amministrazione");
  await requireWebmailAccess();
  const parsed = searchSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Ricerca non valida." };
  const vis = await resolveWebmailAccountVisibility(auth);
  const { aziendaTipo, aziendaId, emailQuery } = parsed.data;
  const hints = await collectAziendaEmailHints(aziendaTipo, aziendaId);
  if (vis.mode === "granted" && vis.ids.length === 0) {
    return { success: true, items: [], domains: hints.domains };
  }
  const manual = normalizeEmail(emailQuery);

  const orParts: string[] = [];
  function pushToContains(addr: string) {
    const clean = addr.replace(/[{}"]/g, "").trim();
    if (!clean) return;
    orParts.push(`to_addresses.cs.{"${clean}"}`);
    orParts.push(`cc_addresses.cs.{"${clean}"}`);
  }
  if (manual) {
    orParts.push(`from_address.ilike.%${manual}%`);
    pushToContains(manual);
  } else {
    for (const e of hints.emails) {
      orParts.push(`from_address.ilike.%${e.email}%`);
      pushToContains(e.email);
    }
    for (const d of hints.domains) {
      orParts.push(`from_address.ilike.%@${d}%`);
    }
  }

  if (orParts.length === 0) {
    return { success: true, items: [], domains: hints.domains };
  }

  const supabase = await createClient();
  let mailQ = supabase
    .from("webmail_messaggi")
    .select(
      "id, subject, from_address, from_name, to_addresses, direction, received_at, sent_at, azienda_tipo, azienda_id"
    )
    .is("deleted_at", null)
    .or(orParts.join(","))
    .order("received_at", { ascending: false })
    .limit(60);
  if (vis.mode === "granted") mailQ = mailQ.in("account_id", vis.ids);
  const { data, error } = await mailQ;

  if (error) return { success: false, error: error.message };

  const emailSet = new Set(hints.emails.map((e) => e.email));
  const domainSet = new Set(hints.domains);

  const items: AziendaTimelineMailHit[] = (data ?? []).map((r) => {
    const from = normalizeEmail(String(r.from_address ?? ""));
    const toList = Array.isArray(r.to_addresses)
      ? (r.to_addresses as string[]).map((x) => normalizeEmail(String(x)))
      : [];
    const outbound = String(r.direction ?? "") === "outbound";
    const dom = domainOf(from);
    const toDom = toList.map(domainOf).find(Boolean);
    let matchReason = "ricerca";
    if (manual && (from.includes(manual) || toList.some((t) => t.includes(manual)))) {
      matchReason = outbound ? "destinatario cercato" : "indirizzo cercato";
    } else if (emailSet.has(from) || toList.some((t) => emailSet.has(t))) {
      matchReason = outbound ? "destinatario scheda" : "scheda / referente";
    } else if (dom && domainSet.has(dom)) matchReason = `dominio @${dom}`;
    else if (toDom && domainSet.has(toDom)) matchReason = `dominio @${toDom}`;

    const alreadyLinked =
      String(r.azienda_tipo ?? "") === aziendaTipo &&
      String(r.azienda_id ?? "") === aziendaId;

    return {
      id: String(r.id),
      subject: String(r.subject ?? "(senza oggetto)"),
      fromAddress: String(r.from_address ?? ""),
      fromName: String(r.from_name ?? ""),
      toAddresses: toList,
      direction: outbound ? "outbound" : "inbound",
      receivedAt:
        (outbound
          ? ((r.sent_at as string | null) ?? (r.received_at as string | null))
          : (r.received_at as string | null)) ?? null,
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

function etichettaPnOrigine(tipo: TimelinePnOrigine): string {
  if (tipo === "attivita") return "Attività";
  if (tipo === "promemoria") return "Promemoria";
  return "Nota";
}

export type TimelinePnPickItem = {
  id: string;
  origineTipo: TimelinePnOrigine;
  titolo: string;
  testo: string;
  occurredAt: string;
};

export async function listPnPerTimelineAction(): Promise<
  | { success: true; items: TimelinePnPickItem[] }
  | { success: false; error: string }
> {
  await requireAreaAccess("amministrazione");
  const service = createServiceClient();
  const items: TimelinePnPickItem[] = [];

  const { data: note } = await service
    .from("pn_note")
    .select("id, titolo, body, due_at, created_at")
    .is("deleted_at", null)
    .eq("stato", "attiva")
    .order("created_at", { ascending: false })
    .limit(200);
  for (const r of note ?? []) {
    items.push({
      id: String(r.id),
      origineTipo: "nota",
      titolo: String(r.titolo || "Nota").trim() || "Nota",
      testo: String(r.body ?? ""),
      occurredAt: String(r.due_at || r.created_at),
    });
  }

  const { data: att } = await service
    .from("pn_attivita")
    .select("id, titolo, descrizione, due_at, created_at")
    .is("deleted_at", null)
    .neq("stato", "archiviata")
    .order("due_at", { ascending: false })
    .limit(200);
  for (const r of att ?? []) {
    items.push({
      id: String(r.id),
      origineTipo: "attivita",
      titolo: String(r.titolo || "Attività").trim() || "Attività",
      testo: String(r.descrizione ?? ""),
      occurredAt: String(r.due_at || r.created_at),
    });
  }

  const { data: pro } = await service
    .from("pn_promemoria")
    .select("id, titolo, descrizione, due_at, created_at")
    .is("deleted_at", null)
    .neq("stato", "archiviato")
    .order("due_at", { ascending: false })
    .limit(200);
  for (const r of pro ?? []) {
    items.push({
      id: String(r.id),
      origineTipo: "promemoria",
      titolo: String(r.titolo || "Promemoria").trim() || "Promemoria",
      testo: String(r.descrizione ?? ""),
      occurredAt: String(r.due_at || r.created_at),
    });
  }

  items.sort((a, b) => {
    const ta = new Date(a.occurredAt).getTime();
    const tb = new Date(b.occurredAt).getTime();
    return tb - ta;
  });
  return { success: true, items };
}

const collegaPnSchema = z.object({
  aziendaTipo: z.enum(["cliente", "fornitore", "cliente_possibile"]),
  aziendaId: z.string().uuid(),
  origineTipo: z.enum(["nota", "attivita", "promemoria"]),
  origineId: z.string().uuid(),
});

export async function collegaPnATimelineAction(
  raw: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = collegaPnSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const service = createServiceClient();
  const { aziendaTipo, aziendaId, origineTipo, origineId } = parsed.data;

  let titolo = etichettaPnOrigine(origineTipo);
  let testo = "";
  let occurredAt = "";

  if (origineTipo === "nota") {
    const { data } = await service
      .from("pn_note")
      .select("titolo, body, due_at, created_at")
      .eq("id", origineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Nota non trovata." };
    titolo = String(data.titolo || "Nota").trim() || "Nota";
    testo = String(data.body ?? "");
    occurredAt = String(data.due_at || data.created_at);
  } else if (origineTipo === "attivita") {
    const { data } = await service
      .from("pn_attivita")
      .select("titolo, descrizione, due_at, created_at")
      .eq("id", origineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Attività non trovata." };
    titolo = String(data.titolo || "Attività").trim() || "Attività";
    testo = String(data.descrizione ?? "");
    occurredAt = String(data.due_at || data.created_at);
  } else {
    const { data } = await service
      .from("pn_promemoria")
      .select("titolo, descrizione, due_at, created_at")
      .eq("id", origineId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return { success: false, error: "Promemoria non trovato." };
    titolo = String(data.titolo || "Promemoria").trim() || "Promemoria";
    testo = String(data.descrizione ?? "");
    occurredAt = String(data.due_at || data.created_at);
  }

  const id = await upsertTimelinePnCopia(service, auth.userId, {
    aziendaTipo,
    aziendaId,
    origineTipo,
    origineId,
    occurredAt,
    titolo,
    testo,
  });
  if (!id) return { success: false, error: "Copia in timeline non salvata." };

  await writeAuditLog({
    entity_type: "azienda_timeline_pn_copie",
    entity_id: id,
    action: "create",
    actor_id: auth.userId,
    summary: `Copia ${origineTipo} in timeline ${aziendaTipo}`,
    payload: { aziendaId, origineTipo, origineId },
  });
  return { success: true };
}

function aziendaTable(
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile"
) {
  return aziendaTipo === "cliente"
    ? "clienti"
    : aziendaTipo === "fornitore"
      ? "fornitori"
      : "clienti_possibili";
}

function sanitizeIlikeToken(raw: string): string {
  return raw
    .trim()
    .replace(/[,()%_\\]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

async function assertTimelineSyncAccess(raw: unknown): Promise<
  | {
      ok: true;
      auth: Awaited<ReturnType<typeof requireAreaAccess>>["auth"];
      aziendaTipo: "cliente" | "fornitore" | "cliente_possibile";
      aziendaId: string;
      aziendaLabel: string;
    }
  | { ok: false; error: string }
> {
  const { auth } = await requireAreaAccess("amministrazione");
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Azienda non valida." };
  const { aziendaTipo, aziendaId } = parsed.data;
  const service = createServiceClient();
  const { data: azRow } = await service
    .from(aziendaTable(aziendaTipo))
    .select("created_by, ragione_sociale")
    .eq("id", aziendaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!azRow) return { ok: false, error: "Azienda non trovata." };
  let commercialeId: string | null = null;
  if (aziendaTipo === "cliente") {
    const { data: comm } = await service
      .from("clienti")
      .select("commerciale_id")
      .eq("id", aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    commercialeId = comm?.commerciale_id ? String(comm.commerciale_id) : null;
  } else if (aziendaTipo === "cliente_possibile") {
    const { data: comm } = await service
      .from("clienti_possibili")
      .select("commerciale_id")
      .eq("id", aziendaId)
      .is("deleted_at", null)
      .maybeSingle();
    commercialeId = comm?.commerciale_id ? String(comm.commerciale_id) : null;
  }
  const timelineKind = kindFromAziendaTipo(aziendaTipo);
  if (timelineKind) {
    const tlGate = await assertAnagraficaPrivilege({
      kind: timelineKind,
      op: "timeline",
      createdBy: azRow.created_by ? String(azRow.created_by) : null,
      commercialeId,
    });
    if (!tlGate.ok) return { ok: false, error: tlGate.error };
  }
  return {
    ok: true,
    auth,
    aziendaTipo,
    aziendaId,
    aziendaLabel: String(
      (azRow as { ragione_sociale?: string }).ragione_sociale ?? ""
    ).trim(),
  };
}

type PnSyncCandidate = {
  origineTipo: TimelinePnOrigine;
  origineId: string;
  titolo: string;
  testo: string;
  occurredAt: string;
  already: boolean;
};

async function collectPnSyncCandidates(
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile",
  aziendaId: string,
  ragioneSociale: string
): Promise<PnSyncCandidate[]> {
  const service = createServiceClient();
  const { data: copie } = await service
    .from("azienda_timeline_pn_copie")
    .select("origine_tipo, origine_id")
    .eq("azienda_tipo", aziendaTipo)
    .eq("azienda_id", aziendaId)
    .is("deleted_at", null)
    .limit(400);
  const have = new Set(
    (copie ?? []).map((r) => `${r.origine_tipo}:${r.origine_id}`)
  );
  const out: PnSyncCandidate[] = [];
  const seen = new Set<string>();

  function push(
    origineTipo: TimelinePnOrigine,
    origineId: string,
    titolo: string,
    testo: string,
    occurredAt: string
  ) {
    if (!origineId || !occurredAt) return;
    const key = `${origineTipo}:${origineId}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      origineTipo,
      origineId,
      titolo: titolo.trim() || etichettaPnOrigine(origineTipo),
      testo,
      occurredAt,
      already: have.has(key),
    });
  }

  const mentionKind =
    aziendaTipo === "cliente"
      ? "cliente"
      : aziendaTipo === "cliente_possibile"
        ? "cliente_possibile"
        : "fornitore";
  const { data: cols } = await service
    .from("pn_attivita_collegamenti")
    .select("attivita_id")
    .eq("kind", mentionKind)
    .eq("entity_id", aziendaId)
    .is("deleted_at", null)
    .limit(200);
  const attivitaIds = [
    ...new Set((cols ?? []).map((r) => String(r.attivita_id)).filter(Boolean)),
  ];
  if (attivitaIds.length) {
    const { data: att } = await service
      .from("pn_attivita")
      .select("id, titolo, descrizione, due_at, created_at")
      .in("id", attivitaIds)
      .is("deleted_at", null);
    for (const r of att ?? []) {
      push(
        "attivita",
        String(r.id),
        String(r.titolo ?? ""),
        String(r.descrizione ?? ""),
        String(r.due_at || r.created_at || "")
      );
    }
  }

  const token = sanitizeIlikeToken(ragioneSociale);
  if (token.length >= 5) {
    const like = `%${token}%`;
    const [noteRes, attRes, proRes] = await Promise.all([
      service
        .from("pn_note")
        .select("id, titolo, body, due_at, created_at, entity_type, entity_id")
        .is("deleted_at", null)
        .or(`titolo.ilike.${like},body.ilike.${like}`)
        .limit(80),
      service
        .from("pn_attivita")
        .select("id, titolo, descrizione, due_at, created_at")
        .is("deleted_at", null)
        .or(`titolo.ilike.${like},descrizione.ilike.${like}`)
        .limit(80),
      service
        .from("pn_promemoria")
        .select("id, titolo, descrizione, due_at, created_at")
        .is("deleted_at", null)
        .or(`titolo.ilike.${like},descrizione.ilike.${like}`)
        .limit(80),
    ]);
    for (const r of noteRes.data ?? []) {
      if (
        String(r.entity_type ?? "") === aziendaTipo &&
        String(r.entity_id ?? "") === aziendaId
      ) {
        continue;
      }
      push(
        "nota",
        String(r.id),
        String(r.titolo ?? ""),
        String(r.body ?? ""),
        String(r.due_at || r.created_at || "")
      );
    }
    for (const r of attRes.data ?? []) {
      push(
        "attivita",
        String(r.id),
        String(r.titolo ?? ""),
        String(r.descrizione ?? ""),
        String(r.due_at || r.created_at || "")
      );
    }
    for (const r of proRes.data ?? []) {
      push(
        "promemoria",
        String(r.id),
        String(r.titolo ?? ""),
        String(r.descrizione ?? ""),
        String(r.due_at || r.created_at || "")
      );
    }
  }

  return out;
}

async function countDocumentiAzienda(
  aziendaTipo: "cliente" | "fornitore" | "cliente_possibile",
  aziendaId: string
): Promise<number> {
  const service = createServiceClient();
  let n = 0;
  if (aziendaTipo === "cliente" || aziendaTipo === "cliente_possibile") {
    const col =
      aziendaTipo === "cliente" ? "cliente_id" : "cliente_possibile_id";
    const [ord, camp] = await Promise.all([
      service
        .from("ordini")
        .select("id", { count: "exact", head: true })
        .eq(col, aziendaId)
        .is("deleted_at", null),
      service
        .from("campionature")
        .select("id", { count: "exact", head: true })
        .eq(col, aziendaId)
        .is("deleted_at", null),
    ]);
    n += ord.count ?? 0;
    n += camp.count ?? 0;
  }
  if (aziendaTipo === "cliente") {
    const { count } = await service
      .from("fatture_emesse")
      .select("id", { count: "exact", head: true })
      .eq("cliente_id", aziendaId)
      .is("deleted_at", null);
    n += count ?? 0;
  }
  if (aziendaTipo === "fornitore") {
    const { count } = await service
      .from("fatture_ricevute")
      .select("id", { count: "exact", head: true })
      .eq("fornitore_id", aziendaId)
      .is("deleted_at", null);
    n += count ?? 0;
  }
  return n;
}

export type AziendaTimelineSyncPreview = {
  mailNuove: number;
  mailGiaCollegate: number;
  mailAltroProfilo: number;
  mailEsempi: string[];
  pnNuove: number;
  pnGia: number;
  documenti: number;
  emailsUsate: number;
};

export async function previewAziendaTimelineSyncAction(
  raw: unknown
): Promise<
  | { success: true; preview: AziendaTimelineSyncPreview }
  | { success: false; error: string }
> {
  const gate = await assertTimelineSyncAccess(raw);
  if (!gate.ok) return { success: false, error: gate.error };
  const { auth, aziendaTipo, aziendaId } = gate;
  const vis = await resolveWebmailAccountVisibility(auth);
  const grantedIds = vis.mode === "granted" ? vis.ids : null;
  if (grantedIds && grantedIds.length === 0) {
    const hintsEmpty = await collectAziendaEmailHints(aziendaTipo, aziendaId);
    const pn = await collectPnSyncCandidates(
      aziendaTipo,
      aziendaId,
      hintsEmpty.ragioneSociale
    );
    return {
      success: true,
      preview: {
        mailNuove: 0,
        mailGiaCollegate: 0,
        mailAltroProfilo: 0,
        mailEsempi: [],
        pnNuove: pn.filter((p) => !p.already).length,
        pnGia: pn.filter((p) => p.already).length,
        documenti: await countDocumentiAzienda(aziendaTipo, aziendaId),
        emailsUsate: hintsEmpty.emails.length,
      },
    };
  }

  const hints = await collectAziendaEmailHints(aziendaTipo, aziendaId);
  const [mails, pn, documenti] = await Promise.all([
    findWebmailMatchesForAziendaEmails({
      emails: hints.emails.map((e) => e.email),
      aziendaTipo,
      aziendaId,
      accountIds: grantedIds,
    }),
    collectPnSyncCandidates(aziendaTipo, aziendaId, hints.ragioneSociale),
    countDocumentiAzienda(aziendaTipo, aziendaId),
  ]);

  const nuove = mails.filter((m) => !m.alreadyLinked && !m.linkedElsewhere);
  return {
    success: true,
    preview: {
      mailNuove: nuove.length,
      mailGiaCollegate: mails.filter((m) => m.alreadyLinked).length,
      mailAltroProfilo: mails.filter((m) => m.linkedElsewhere).length,
      mailEsempi: nuove.slice(0, 5).map((m) => m.subject),
      pnNuove: pn.filter((p) => !p.already).length,
      pnGia: pn.filter((p) => p.already).length,
      documenti,
      emailsUsate: hints.emails.length,
    },
  };
}

const runSyncSchema = inputSchema.extend({
  mail: z.boolean(),
  pn: z.boolean(),
  documenti: z.boolean(),
});

export async function runAziendaTimelineSyncAction(
  raw: unknown
): Promise<
  | {
      success: true;
      linkedMail: number;
      copiedPn: number;
      documenti: number;
    }
  | { success: false; error: string }
> {
  const parsed = runSyncSchema.safeParse(raw);
  if (!parsed.success) return { success: false, error: "Dati non validi." };
  const gate = await assertTimelineSyncAccess(parsed.data);
  if (!gate.ok) return { success: false, error: gate.error };
  const { auth, aziendaTipo, aziendaId, aziendaLabel } = gate;
  const vis = await resolveWebmailAccountVisibility(auth);
  const grantedIds = vis.mode === "granted" ? vis.ids : null;
  const hints = await collectAziendaEmailHints(aziendaTipo, aziendaId);

  let linkedMail = 0;
  if (parsed.data.mail && (!grantedIds || grantedIds.length > 0)) {
    const res = await linkUnlinkedWebmailByEmails({
      emails: hints.emails.map((e) => e.email),
      aziendaTipo,
      aziendaId,
      aziendaLabel: aziendaLabel || hints.ragioneSociale,
      actorId: auth.userId,
      accountIds: grantedIds,
      persistAutoLink:
        aziendaTipo === "cliente" || aziendaTipo === "cliente_possibile",
    });
    linkedMail = res.linked;
  }

  let copiedPn = 0;
  if (parsed.data.pn) {
    const service = createServiceClient();
    const candidates = await collectPnSyncCandidates(
      aziendaTipo,
      aziendaId,
      hints.ragioneSociale
    );
    for (const c of candidates.filter((x) => !x.already).slice(0, 200)) {
      const id = await upsertTimelinePnCopia(service, auth.userId, {
        aziendaTipo,
        aziendaId,
        origineTipo: c.origineTipo,
        origineId: c.origineId,
        occurredAt: c.occurredAt,
        titolo: c.titolo,
        testo: c.testo,
      });
      if (id) copiedPn += 1;
    }
  }

  const documenti = parsed.data.documenti
    ? await countDocumentiAzienda(aziendaTipo, aziendaId)
    : 0;

  await writeAuditLog({
    entity_type: aziendaTable(aziendaTipo),
    entity_id: aziendaId,
    action: "timeline_sync",
    actor_id: auth.userId,
    summary: `Sincronizza timeline ${aziendaTipo}: ${linkedMail} mail, ${copiedPn} PN`,
    payload: {
      aziendaTipo,
      mail: parsed.data.mail,
      pn: parsed.data.pn,
      documenti: parsed.data.documenti,
      linkedMail,
      copiedPn,
    },
  });

  return { success: true, linkedMail, copiedPn, documenti };
}
