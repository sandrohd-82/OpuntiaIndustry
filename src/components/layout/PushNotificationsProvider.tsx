"use client";

import { useEffect, useState } from "react";
import {
  savePushSubscriptionAction,
  vapidPublicKeyAction,
} from "@/app/actions/notifiche";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function subscribePush(publicKey: string): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return false;
  }
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
  }
  const json = sub.toJSON();
  const res = await savePushSubscriptionAction({
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent,
  });
  return res.success;
}

export function PushNotificationsProvider() {
  const [needConsent, setNeedConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const href = ev.data?.href;
      if (ev.data?.type === "oi-notifica-open" && typeof href === "string") {
        notifyNotificheNav();
        if (href.startsWith("/")) window.location.assign(href);
      }
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);

    let cancelled = false;
    void (async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        return;
      }
      const key = await vapidPublicKeyAction();
      if (!key || cancelled) return;
      if (Notification.permission === "granted") {
        try {
          await subscribePush(key);
        } catch {
          /* ignore */
        }
        return;
      }
      if (Notification.permission === "default") {
        setNeedConsent(true);
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const key = await vapidPublicKeyAction();
      if (!key) {
        setError("Notifiche PC non configurate (VAPID).");
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setNeedConsent(false);
        return;
      }
      const ok = await subscribePush(key);
      if (!ok) setError("Impossibile attivare le notifiche su questo browser.");
      else setNeedConsent(false);
    } catch {
      setError("Il browser ha rifiutato le notifiche.");
    } finally {
      setBusy(false);
    }
  }

  if (!needConsent && !error) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg print:hidden">
      <p className="font-medium text-slate-900">Notifiche sul PC</p>
      <p className="mt-1 text-xs text-slate-600">
        Windows e Mac: il gestionale può avvisarti (attività, mail, chat,
        scadenze) anche se la scheda è in secondo piano. Serve solo il consenso
        del browser, senza installare programmi.
      </p>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      {needConsent ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="mt-3 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          Attiva notifiche
        </button>
      ) : null}
    </div>
  );
}
