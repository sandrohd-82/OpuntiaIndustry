/**
 * Crea o reimposta il profilo Senior in fase Test.
 * Nessuna mail, nessuna password nota, nessun 2FA.
 *
 *   node --env-file=.env.local scripts/create-segnor-test.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.SEGNOR_EMAIL ?? "seleniarcurella@gmail.com")
  .trim()
  .toLowerCase();
const fullName = (process.env.SEGNOR_FULL_NAME ?? "Selenia Rita Curella").trim();

function fail(message) {
  console.error(`\n[create-segnor-test] ${message}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function randomUnusedPassword() {
  return `${randomBytes(24).toString("base64url")}Aa1!`;
}

async function waitForProfile(userId) {
  for (let i = 0; i < 12; i++) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (data?.id) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const { data: role, error: roleErr } = await admin
  .from("app_roles")
  .select("id")
  .eq("code", "manager")
  .maybeSingle();
if (roleErr || !role) fail(roleErr?.message ?? "Ruolo manager assente.");

const { data: existing } = await admin
  .from("profiles")
  .select("id")
  .ilike("email", email)
  .maybeSingle();

let userId = existing?.id ? String(existing.id) : null;
let created = false;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomUnusedPassword(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) fail(`createUser: ${error?.message ?? "errore"}`);
  userId = data.user.id;
  created = true;
  await waitForProfile(userId);
} else {
  const { error: pwErr } = await admin.auth.admin.updateUserById(userId, {
    password: randomUnusedPassword(),
  });
  if (pwErr) fail(`update password: ${pwErr.message}`);
}

const now = new Date().toISOString();
const { error: upErr } = await admin.from("profiles").upsert(
  {
    id: userId,
    email,
    full_name: fullName,
    first_name: "Selenia Rita",
    last_name: "Curella",
    job_title: "Senior",
    role_id: role.id,
    is_active: true,
    gerarchia: "senior",
    potere: "operatore",
    stato_operativo: "test",
    stato_operativo_at: now,
    primo_accesso_token_hash: null,
    primo_accesso_expires_at: null,
    password_impostata_at: null,
    welcome_visto_at: null,
    attivato_at: null,
    attivato_by: null,
  },
  { onConflict: "id" }
);
if (upErr) fail(`profiles: ${upErr.message}`);

const { error: accErr } = await admin
  .from("profile_page_access")
  .update({ deleted_at: now })
  .eq("profile_id", userId)
  .is("deleted_at", null);
if (accErr) fail(`page_access: ${accErr.message}`);

const { error: fErr } = await admin.from("user_second_factor").upsert(
  {
    user_id: userId,
    method: "email",
    totp_secret_encrypted: null,
    verified_at: null,
    otp_hash: null,
    otp_expires_at: null,
    otp_attempts: 0,
    updated_at: now,
  },
  { onConflict: "user_id" }
);
if (fErr) fail(`2fa: ${fErr.message}`);

await admin.from("audit_log").insert({
  entity_type: "profiles",
  entity_id: userId,
  action: created ? "profile_create_test" : "profile_reset_test",
  summary: `Profilo Senior (${email}) ${created ? "creato" : "reimpostato"} in fase Test`,
  payload: { email, role: "manager" },
});

console.log(
  created
    ? `Profilo Senior creato in Test: ${email} (${userId})`
    : `Profilo Senior reimpostato in Test: ${email} (${userId})`
);
console.log("Login diretto disabilitato. Entra dallo switch Super Admin.");
