/**
 * Diagnosi notifiche / VAPID / DB / cron. Non stampa secret.
 * node --env-file=.env.local scripts/test-notifiche-stack.mjs
 */
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const out = [];
function ok(name, pass, detail = "") {
  out.push(`${pass ? "OK  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function present(name) {
  const v = (process.env[name] || "").trim();
  return Boolean(v);
}

function keyMeta(name) {
  const v = (process.env[name] || "").trim();
  return { set: Boolean(v), len: v.length, prefix: v.slice(0, 2) };
}

const pub =
  (process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
const priv = (process.env.VAPID_PRIVATE_KEY || "").trim();
const subject = (process.env.VAPID_SUBJECT || "").trim();

ok("VAPID_PUBLIC_KEY", present("VAPID_PUBLIC_KEY"), present("VAPID_PUBLIC_KEY") ? "impostata" : "MANCANTE (si usa solo NEXT_PUBLIC)");
ok("NEXT_PUBLIC_VAPID_PUBLIC_KEY", present("NEXT_PUBLIC_VAPID_PUBLIC_KEY"));
ok("VAPID_PRIVATE_KEY", present("VAPID_PRIVATE_KEY"));
ok("VAPID_SUBJECT", present("VAPID_SUBJECT"), subject.startsWith("mailto:") ? "mailto ok" : "formato strano o vuoto");
ok("CRON_SECRET", present("CRON_SECRET"));
ok("SUPABASE_URL", present("NEXT_PUBLIC_SUPABASE_URL"));
ok("SERVICE_ROLE", present("SUPABASE_SERVICE_ROLE_KEY"));

const pubM = keyMeta("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
const privM = keyMeta("VAPID_PRIVATE_KEY");
ok("lunghezza chiave pubblica", pubM.len >= 80 && pubM.len <= 100, `len=${pubM.len}`);
ok("lunghezza chiave privata", privM.len >= 40 && privM.len <= 50, `len=${privM.len}`);
ok("pubblica inizia con B", pub.startsWith("B"), `prefisso=${pubM.prefix || "?"}`);

if (present("VAPID_PUBLIC_KEY") && present("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) {
  ok(
    "pubbliche uguali",
    process.env.VAPID_PUBLIC_KEY.trim() === process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim()
  );
} else {
  ok("pubbliche uguali", false, "VAPID_PUBLIC_KEY assente: su Vercel il client potrebbe non avere la chiave a build");
}

try {
  webpush.setVapidDetails(subject || "mailto:support@opuntiaindustry.com", pub, priv);
  ok("web-push setVapidDetails", true, "coppia accettata dalla libreria");
} catch (e) {
  ok("web-push setVapidDetails", false, e instanceof Error ? e.message : "errore");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (url && service) {
  const sb = createClient(url, service, { auth: { persistSession: false } });

  const tables = [
    "app_notifiche",
    "app_push_subscriptions",
    "pn_evento_avvisi",
    "pn_attivita",
    "pn_promemoria",
  ];
  for (const t of tables) {
    const { error, count } = await sb.from(t).select("id", { count: "exact", head: true });
    ok(`tabella ${t}`, !error, error ? error.message : `righe=${count ?? 0}`);
  }

  const { data: subs, error: se } = await sb
    .from("app_push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, deleted_at, created_at, updated_at")
    .is("deleted_at", null)
    .limit(20);
  ok("sottoscrizioni attive", !se, se ? se.message : `n=${(subs ?? []).length}`);

  const { count: notifN } = await sb
    .from("app_notifiche")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const { count: avvisoN } = await sb
    .from("app_notifiche")
    .select("id", { count: "exact", head: true })
    .eq("tipo", "avviso")
    .is("deleted_at", null);
  ok("inbox app_notifiche", true, `totali=${notifN ?? 0} tipo=avviso=${avvisoN ?? 0}`);

  const { data: pendingAvvisi, error: pe } = await sb
    .from("pn_evento_avvisi")
    .select("id, notify_at, sent_at, origine_tipo")
    .is("deleted_at", null)
    .is("sent_at", null)
    .limit(20);
  ok("avvisi non spediti", !pe, pe ? pe.message : `n=${(pendingAvvisi ?? []).length}`);

  const { error: tipoErr } = await sb.from("app_notifiche").insert({
    recipient_id: "00000000-0000-0000-0000-000000000000",
    tipo: "avviso",
    title: "probe",
    body: "probe",
    href: "/app/dashboard",
  });
  if (tipoErr && /tipo|check/i.test(tipoErr.message)) {
    ok("constraint tipo=avviso", false, tipoErr.message);
  } else {
    ok("constraint tipo=avviso", true, tipoErr ? `insert atteso fallito per FK (${tipoErr.code || "ok"})` : "insert inatteso, pulire");
    if (!tipoErr) {
      await sb.from("app_notifiche").delete().eq("title", "probe").eq("href", "/app/dashboard");
    }
  }

  if ((subs ?? []).length) {
    let sent = 0;
    let gone = 0;
    let other = 0;
    const hosts = new Set();
    for (const row of subs) {
      try {
        const host = new URL(String(row.endpoint)).host;
        hosts.add(host);
        await webpush.sendNotification(
          {
            endpoint: String(row.endpoint),
            keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
          },
          JSON.stringify({
            tipo: "sistema",
            title: "Test notifiche Industry",
            body: "Prova automatica: se la vedi, push e chiavi coincidono.",
            href: "/app/dashboard",
            tag: "oi-test-diagnosi",
          })
        );
        sent += 1;
      } catch (err) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) gone += 1;
        else {
          other += 1;
          ok(
            `push verso ${new URL(String(row.endpoint)).host}`,
            false,
            `status=${status || "?"} ${err?.body || err?.message || ""}`.slice(0, 180)
          );
        }
      }
    }
    ok(
      "invio push reale",
      sent > 0 || (gone > 0 && other === 0),
      `ok=${sent} scadute=${gone} errori=${other} host=${[...hosts].join(",")}`
    );
  } else {
    ok("invio push reale", false, "nessuna sottoscrizione salvata: nessuno ha completato Consenti notifiche");
  }

  const { data: att } = await sb
    .from("pn_attivita")
    .select("id, titolo, due_at, created_by, stato")
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();
  const owner = (subs ?? [])[0]?.user_id || att?.created_by;
  if (att?.id && owner) {
    const notifyAt = new Date(Date.now() - 60_000).toISOString();
    const { data: av, error: ae } = await sb
      .from("pn_evento_avvisi")
      .insert({
        origine_tipo: "attivita",
        origine_id: att.id,
        offset_valore: 1,
        offset_unita: "ore",
        notify_at: notifyAt,
        created_by: owner,
        updated_by: owner,
      })
      .select("id")
      .single();
    if (ae || !av) {
      ok("e2e crea avviso scaduto", false, ae?.message || "insert fallito");
    } else {
      ok("e2e crea avviso scaduto", true, "avviso di prova creato");
      const { data: claimed } = await sb
        .from("pn_evento_avvisi")
        .update({
          sent_at: new Date().toISOString(),
          sent_by: owner,
          updated_by: owner,
        })
        .eq("id", av.id)
        .is("sent_at", null)
        .select("id")
        .maybeSingle();
      ok("e2e claim avviso", Boolean(claimed?.id), claimed?.id ? "sent_at impostato" : "già preso");
      const { error: ne } = await sb.from("app_notifiche").insert({
        recipient_id: owner,
        actor_id: owner,
        tipo: "avviso",
        title: "Sveglia (test automatico)",
        body: `Test sveglia su «${att.titolo}»`,
        href: "/app/promemorie-e-note/attivita/elenco",
        entity_type: "pn_evento_avvisi",
        entity_id: av.id,
        created_by: owner,
        updated_by: owner,
      });
      ok("e2e insert inbox avviso", !ne, ne ? ne.message : "riga inbox creata");
      let pushed = 0;
      for (const row of (subs ?? []).filter((s) => s.user_id === owner)) {
        try {
          await webpush.sendNotification(
            {
              endpoint: String(row.endpoint),
              keys: { p256dh: String(row.p256dh), auth: String(row.auth) },
            },
            JSON.stringify({
              tipo: "avviso",
              title: "Sveglia (test automatico)",
              body: `Test sveglia su «${att.titolo}»`,
              href: "/app/promemorie-e-note/attivita/elenco",
              entityId: av.id,
              tag: `oi-test-avviso-${av.id}`,
            })
          );
          pushed += 1;
        } catch (err) {
          ok("e2e push sveglia", false, `status=${err?.statusCode || "?"}`.slice(0, 120));
        }
      }
      ok("e2e push sveglia", pushed > 0, `inviate=${pushed}`);
      await sb
        .from("pn_evento_avvisi")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: owner,
        })
        .eq("id", av.id);
      await sb
        .from("app_notifiche")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: owner,
        })
        .eq("entity_id", av.id)
        .eq("tipo", "avviso");
      ok("e2e pulizia avviso", true, "soft delete");
    }
  } else {
    ok("e2e crea avviso scaduto", false, "manca attività o utente con sottoscrizione");
  }
}

const cronSecret = (process.env.CRON_SECRET || "").trim();
if (cronSecret) {
  try {
    const r = await fetch("https://www.opuntiaindustry.com/api/cron/pn-avvisi", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const body = await r.text();
    let parsed = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body.slice(0, 80) };
    }
    ok(
      "cron prod /api/cron/pn-avvisi",
      r.ok && parsed.ok === true,
      `http=${r.status} fired=${parsed.fired ?? "?"} pushed=${parsed.pushed ?? "?"}`
    );
  } catch (e) {
    ok("cron prod /api/cron/pn-avvisi", false, e instanceof Error ? e.message : "fetch fail");
  }
}

const prodBase = "https://www.opuntiaindustry.com";
try {
  const r = await fetch(`${prodBase}/sw.js`, { redirect: "follow" });
  const text = r.ok ? await r.text() : "";
  const isSw =
    text.includes('addEventListener("push"') ||
    text.includes("addEventListener('push'");
  const isNew = text.includes("oi-notifica-push");
  ok(`prod ${prodBase}/sw.js`, r.ok && isSw && isNew, `http=${r.status} sw=${isSw} nuovo=${isNew}`);
  const man = await fetch(`${prodBase}/manifest.webmanifest`);
  const manTxt = man.ok ? await man.text() : "";
  ok(
    "prod manifest",
    man.ok && manTxt.includes("standalone"),
    `http=${man.status}`
  );
} catch (e) {
  ok(`prod ${prodBase}/sw.js`, false, e instanceof Error ? e.message : "fetch fail");
}

console.log(out.join("\n"));
const failed = out.filter((l) => l.startsWith("FAIL")).length;
console.log(`\nRisultato: ${out.length - failed} ok, ${failed} fail`);
process.exit(failed ? 1 : 0);
