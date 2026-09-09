import type { SupabaseClient } from "@supabase/supabase-js";
import {
  domainFromEmail,
  modeFromConfirmCount,
  normalizeSenderEmail,
  WEBMAIL_LEARN_AUTO_SILENT_AT,
  type WebmailCategoriaRegola,
  type WebmailLearnMode,
} from "@/lib/webmail/category-learn";

type Db = SupabaseClient;

function mapRegola(r: Record<string, unknown>): WebmailCategoriaRegola {
  return {
    id: String(r.id),
    accountId: r.account_id ? String(r.account_id) : null,
    matchType: r.match_type as "email" | "domain",
    matchKey: String(r.match_key),
    categoriaId: String(r.categoria_id),
    confirmCount: Number(r.confirm_count) || 0,
    mode: r.mode as WebmailLearnMode,
  };
}

/** Preferisce regola email specifica, poi dominio; account-specific prima di globale. */
export async function findBestCategoriaRegola(
  supabase: Db,
  input: { accountId: string; fromAddress: string }
): Promise<WebmailCategoriaRegola | null> {
  const email = normalizeSenderEmail(input.fromAddress);
  const domain = domainFromEmail(email);
  if (!email) return null;

  const { data } = await supabase
    .from("webmail_categoria_regole")
    .select(
      "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
    )
    .is("deleted_at", null)
    .or(`account_id.eq.${input.accountId},account_id.is.null`)
    .in("match_type", ["email", "domain"]);

  const rows = (data ?? []).map((r) => mapRegola(r as Record<string, unknown>));
  const emailRules = rows.filter(
    (r) =>
      r.matchType === "email" &&
      r.matchKey.toLowerCase() === email
  );
  const domainRules = domain
    ? rows.filter(
        (r) =>
          r.matchType === "domain" &&
          r.matchKey.toLowerCase() === domain
      )
    : [];

  const pick = (list: WebmailCategoriaRegola[]) => {
    const forAccount = list.find((r) => r.accountId === input.accountId);
    return forAccount ?? list.find((r) => !r.accountId) ?? null;
  };

  return pick(emailRules) ?? pick(domainRules);
}

export type CategoryApplyResult = {
  categoriaId: string | null;
  categoriaSuggestId: string | null;
  categoriaSuggestMode: WebmailLearnMode | null;
  categoriaAutoPending: boolean;
  categoriaAutoAppliedAt: string | null;
  categoriaAutoNotified: boolean;
  info?: string;
};

export async function applyLearningOnImport(
  supabase: Db,
  input: { accountId: string; fromAddress: string }
): Promise<CategoryApplyResult> {
  const empty: CategoryApplyResult = {
    categoriaId: null,
    categoriaSuggestId: null,
    categoriaSuggestMode: null,
    categoriaAutoPending: false,
    categoriaAutoAppliedAt: null,
    categoriaAutoNotified: false,
  };

  const rule = await findBestCategoriaRegola(supabase, input);
  if (!rule || rule.mode === "learning") return empty;

  const now = new Date().toISOString();
  await supabase
    .from("webmail_categoria_regole")
    .update({ last_matched_at: now })
    .eq("id", rule.id);

  if (rule.mode === "suggest") {
    return {
      ...empty,
      categoriaSuggestId: rule.categoriaId,
      categoriaSuggestMode: "suggest",
      info: "Suggerimento categoria da apprendimento.",
    };
  }

  if (rule.mode === "auto_notify") {
    return {
      categoriaId: rule.categoriaId,
      categoriaSuggestId: null,
      categoriaSuggestMode: "auto_notify",
      categoriaAutoPending: true,
      categoriaAutoAppliedAt: now,
      categoriaAutoNotified: true,
      info: "Mail spostata automaticamente in categoria (conferma richiesta).",
    };
  }

  // auto_silent
  return {
    categoriaId: rule.categoriaId,
    categoriaSuggestId: null,
    categoriaSuggestMode: "auto_silent",
    categoriaAutoPending: false,
    categoriaAutoAppliedAt: now,
    categoriaAutoNotified: true,
    info: "Mail spostata automaticamente in categoria.",
  };
}

/** Dopo assegnazione manuale o conferma: aggiorna/crea regola email (+ dominio soft). */
export async function reinforceCategoriaLearning(
  supabase: Db,
  input: {
    accountId: string;
    fromAddress: string;
    categoriaId: string;
    userId: string;
    /** Quanti punti aggiungere (default 1). */
    delta?: number;
    /** Aggiorna anche la regola di dominio (più query). Default false. */
    includeDomain?: boolean;
  }
): Promise<WebmailCategoriaRegola> {
  const email = normalizeSenderEmail(input.fromAddress);
  const domain = domainFromEmail(email);
  const delta = input.delta ?? 1;

  async function upsertOne(
    matchType: "email" | "domain",
    matchKey: string
  ): Promise<WebmailCategoriaRegola | null> {
    const { data: existing } = await supabase
      .from("webmail_categoria_regole")
      .select(
        "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
      )
      .eq("account_id", input.accountId)
      .eq("match_type", matchType)
      .ilike("match_key", matchKey)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      const sameCat = String(existing.categoria_id) === input.categoriaId;
      const nextCount = sameCat
        ? Number(existing.confirm_count) + delta
        : delta;
      const nextMode = modeFromConfirmCount(nextCount);
      const { data: updated } = await supabase
        .from("webmail_categoria_regole")
        .update({
          categoria_id: input.categoriaId,
          confirm_count: nextCount,
          mode: nextMode,
          updated_by: input.userId,
          last_matched_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select(
          "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
        )
        .single();
      return updated
        ? mapRegola(updated as Record<string, unknown>)
        : null;
    }

    const nextMode = modeFromConfirmCount(delta);
    const { data: inserted } = await supabase
      .from("webmail_categoria_regole")
      .insert({
        account_id: input.accountId,
        match_type: matchType,
        match_key: matchKey,
        categoria_id: input.categoriaId,
        confirm_count: delta,
        mode: nextMode,
        created_by: input.userId,
        updated_by: input.userId,
        last_matched_at: new Date().toISOString(),
      })
      .select(
        "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
      )
      .single();
    return inserted ? mapRegola(inserted as Record<string, unknown>) : null;
  }

  const emailRule = await upsertOne("email", email);
  if (domain && (input.includeDomain ?? false)) {
    // Dominio cresce più lentamente (solo se stessa categoria già presente o nuovo)
    const { data: domExisting } = await supabase
      .from("webmail_categoria_regole")
      .select("id, categoria_id, confirm_count")
      .eq("account_id", input.accountId)
      .eq("match_type", "domain")
      .ilike("match_key", domain)
      .is("deleted_at", null)
      .maybeSingle();
    if (
      !domExisting ||
      String(domExisting.categoria_id) === input.categoriaId
    ) {
      await upsertOne("domain", domain);
    }
  }

  if (!emailRule) {
    throw new Error("Impossibile aggiornare regola apprendimento.");
  }
  return emailRule;
}

/** Imposta subito lo spostamento automatico per questo indirizzo (solo email, non dominio). */
export async function forceAutoCategoriaRule(
  supabase: Db,
  input: {
    accountId: string;
    fromAddress: string;
    categoriaId: string;
    userId: string;
  }
): Promise<WebmailCategoriaRegola> {
  const email = normalizeSenderEmail(input.fromAddress);
  if (!email || !email.includes("@")) {
    throw new Error("Indirizzo mittente non valido.");
  }
  const confirmCount = Math.max(WEBMAIL_LEARN_AUTO_SILENT_AT, 1);
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("webmail_categoria_regole")
    .select(
      "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
    )
    .eq("account_id", input.accountId)
    .eq("match_type", "email")
    .ilike("match_key", email)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from("webmail_categoria_regole")
      .update({
        categoria_id: input.categoriaId,
        confirm_count: Math.max(Number(existing.confirm_count) || 0, confirmCount),
        mode: "auto_silent",
        updated_by: input.userId,
        last_matched_at: now,
      })
      .eq("id", existing.id)
      .select(
        "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
      )
      .single();
    if (error || !updated) {
      throw new Error(error?.message ?? "Impossibile aggiornare la regola.");
    }
    return mapRegola(updated as Record<string, unknown>);
  }

  const { data: inserted, error } = await supabase
    .from("webmail_categoria_regole")
    .insert({
      account_id: input.accountId,
      match_type: "email",
      match_key: email,
      categoria_id: input.categoriaId,
      confirm_count: confirmCount,
      mode: "auto_silent",
      created_by: input.userId,
      updated_by: input.userId,
      last_matched_at: now,
    })
    .select(
      "id, account_id, match_type, match_key, categoria_id, confirm_count, mode"
    )
    .single();
  if (error || !inserted) {
    throw new Error(error?.message ?? "Impossibile creare la regola.");
  }
  return mapRegola(inserted as Record<string, unknown>);
}

/** Sposta le mail inbound già presenti (stessa casella + stesso mittente) nella categoria. */
export async function moveAllMessagesFromAddress(
  supabase: Db,
  input: {
    accountId: string;
    fromAddress: string;
    categoriaId: string;
    userId: string;
  }
): Promise<number> {
  const email = normalizeSenderEmail(input.fromAddress);
  if (!email) return 0;

  const safeLike = email.replace(/[%_]/g, "");
  let moved = 0;
  let offset = 0;
  const page = 400;

  for (;;) {
    const { data, error } = await supabase
      .from("webmail_messaggi")
      .select("id, from_address")
      .eq("account_id", input.accountId)
      .eq("direction", "inbound")
      .is("deleted_at", null)
      .is("purged_at", null)
      .is("archived_at", null)
      .is("spam_at", null)
      .neq("folder", "TRASH")
      .neq("folder", "JUNK")
      .ilike("from_address", `%${safeLike}%`)
      .range(offset, offset + page - 1);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const ids = rows
      .filter(
        (r) => normalizeSenderEmail(String(r.from_address ?? "")) === email
      )
      .map((r) => String(r.id));

    if (ids.length > 0) {
      const { data: upd, error: uErr } = await supabase
        .from("webmail_messaggi")
        .update({
          categoria_id: input.categoriaId,
          categoria_suggest_id: null,
          categoria_suggest_mode: null,
          categoria_auto_pending: false,
          updated_by: input.userId,
        })
        .in("id", ids)
        .select("id");
      if (uErr) throw new Error(uErr.message);
      moved += upd?.length ?? 0;
    }

    if (rows.length < page) break;
    offset += page;
    if (offset > 20000) break;
  }

  return moved;
}
