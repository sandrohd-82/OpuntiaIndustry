/**
 * Crea (o promuove) l'unico profilo superadmin su Supabase.
 *
 * Uso:
 *   node --env-file=.env.local scripts/create-superadmin.mjs
 *
 * Oppure imposta le variabili d'ambiente e poi:
 *   node scripts/create-superadmin.mjs
 *
 * Richiede:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SUPERADMIN_EMAIL
 *   SUPERADMIN_PASSWORD   (solo se l'utente non esiste ancora)
 *   SUPERADMIN_FULL_NAME  (opzionale)
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SUPERADMIN_PASSWORD;
const fullName = process.env.SUPERADMIN_FULL_NAME?.trim() || "Super Admin";

function fail(message) {
  console.error(`\n[create-superadmin] ${message}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}
if (!email) {
  fail("Imposta SUPERADMIN_EMAIL (es. la tua email).");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function findUserByEmail() {
  const perPage = 200;
  let page = 1;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) fail(`listUsers: ${error.message}`);

    const found = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email
    );
    if (found) return found;

    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser() {
  const existing = await findUserByEmail();
  if (existing) {
    console.log(`Utente Auth già presente: ${existing.id}`);
    return existing;
  }

  if (!password || password.length < 8) {
    fail(
      "Utente non trovato: imposta SUPERADMIN_PASSWORD (min 8 caratteri) per crearlo."
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error || !data.user) {
    fail(`createUser: ${error?.message ?? "errore sconosciuto"}`);
  }

  console.log(`Utente Auth creato: ${data.user.id}`);
  return data.user;
}

async function promoteToSuperadmin(userId) {
  const { data: role, error: roleError } = await admin
    .from("app_roles")
    .select("id")
    .eq("code", "superadmin")
    .single();

  if (roleError || !role) {
    fail(
      "Ruolo superadmin assente. Esegui la migration 20260804160000_superadmin_totp.sql."
    );
  }

  const { data: other } = await admin
    .from("profiles")
    .select("id, email")
    .eq("role_id", role.id)
    .neq("id", userId);

  if (other && other.length > 0) {
    fail(
      `Esiste già un superadmin (${other.map((p) => p.email).join(", ")}).`
    );
  }

  // Attendi il trigger handle_new_user se utente appena creato
  for (let i = 0; i < 10; i++) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (profile) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  const { error: upsertError } = await admin.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role_id: role.id,
      is_active: true,
    },
    { onConflict: "id" }
  );

  if (upsertError) {
    fail(`profiles upsert: ${upsertError.message}`);
  }

  const { error: factorError } = await admin.from("user_second_factor").upsert(
    {
      user_id: userId,
      method: "email",
    },
    { onConflict: "user_id" }
  );

  if (factorError) {
    fail(`user_second_factor upsert: ${factorError.message}`);
  }

  console.log(`Profilo ${email} promosso a superadmin.`);
  console.log(
    "Accedi all'app → Impostazioni → configura Google Authenticator."
  );
}

const user = await ensureAuthUser();
await promoteToSuperadmin(user.id);
