import { parseProfilePotere } from "@/lib/auth/gerarchia";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWebmailGrantedAccountIds } from "@/lib/webmail/account-access";

export type OpzioneMailOperatore = {
  email: string;
  etichetta: string;
};

function normalizzaMail(email: string): string {
  return email.trim().toLowerCase();
}

function codiceRuolo(value: unknown): string {
  if (Array.isArray(value)) {
    const first = value[0] as { code?: string } | undefined;
    return String(first?.code ?? "");
  }
  if (value && typeof value === "object" && "code" in value) {
    return String((value as { code?: string }).code ?? "");
  }
  return "";
}

/** Caselle dell'operatore della scheda: Super Admin tutte, gli altri i grant più la mail di accesso. */
export async function elencoMailOperatore(userId: string): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      attuale: string;
      opzioni: OpzioneMailOperatore[];
    }
> {
  const service = createServiceClient();
  const { data: profilo, error } = await service
    .from("profiles")
    .select("email, email_professionale, potere, app_roles(code)")
    .eq("id", userId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!profilo) return { ok: false, error: "Profilo operatore non trovato." };
  const riga = profilo as {
    email?: string | null;
    email_professionale?: string | null;
    potere?: string | null;
    app_roles?: unknown;
  };
  const accesso = String(riga.email ?? "").trim();
  const attuale = String(riga.email_professionale ?? "").trim();
  const superadmin =
    parseProfilePotere(riga.potere) === "superadmin" ||
    codiceRuolo(riga.app_roles) === "superadmin";
  const opzioni: OpzioneMailOperatore[] = [];
  const viste = new Set<string>();
  function aggiungi(email: string, etichetta: string) {
    const pulita = email.trim();
    const chiave = normalizzaMail(pulita);
    if (!chiave.includes("@") || viste.has(chiave)) return;
    viste.add(chiave);
    opzioni.push({ email: pulita, etichetta });
  }
  if (accesso) aggiungi(accesso, "Mail di accesso");
  if (superadmin) {
    const caselle = await service
      .from("webmail_accounts")
      .select("label, email_address")
      .is("deleted_at", null)
      .order("email_address", { ascending: true });
    if (caselle.error) return { ok: false, error: caselle.error.message };
    for (const row of caselle.data ?? []) {
      const email = String((row as { email_address?: string }).email_address ?? "");
      const label = String((row as { label?: string }).label ?? "").trim();
      aggiungi(email, label || "Casella aziendale");
    }
  } else {
    const ids = await loadWebmailGrantedAccountIds(userId);
    if (ids.length > 0) {
      const caselle = await service
        .from("webmail_accounts")
        .select("label, email_address")
        .in("id", ids)
        .is("deleted_at", null)
        .order("email_address", { ascending: true });
      if (caselle.error) return { ok: false, error: caselle.error.message };
      for (const row of caselle.data ?? []) {
        const email = String((row as { email_address?: string }).email_address ?? "");
        const label = String((row as { label?: string }).label ?? "").trim();
        aggiungi(email, label || "Casella aziendale");
      }
    }
  }
  if (attuale && !viste.has(normalizzaMail(attuale))) {
    aggiungi(attuale, "Già in scheda");
  }
  return { ok: true, attuale, opzioni };
}

export async function mailProfessionaleConsentita(
  userId: string,
  email: string
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const scelta = email.trim();
  if (!scelta) return { ok: true, email: "" };
  const elenco = await elencoMailOperatore(userId);
  if (!elenco.ok) return elenco;
  const chiave = normalizzaMail(scelta);
  const trovata = elenco.opzioni.find(
    (opzione) => normalizzaMail(opzione.email) === chiave
  );
  if (!trovata) {
    return {
      ok: false,
      error: "Scegli una mail tra le caselle a cui ha accesso questo operatore.",
    };
  }
  return { ok: true, email: trovata.email };
}
