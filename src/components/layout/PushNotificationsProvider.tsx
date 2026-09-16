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

function canUseNotifications(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

export function EnablePcNotificationsButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canUseNotifications()) return;
    if (Notification.permission === "granted") return;
    setVisible(true);
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      if (!canUseNotifications()) {
        setError("Questo browser non supporta le notifiche.");
        return;
      }
      const key = await vapidPublicKeyAction();
      if (!key) {
        setError(
          "Manca la chiave su Vercel (VAPID_PUBLIC_KEY). Salvala e fai Redeploy."
        );
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Hai cliccato Blocca. Dal lucchetto del sito metti Consentile.");
        return;
      }
      const ok = await subscribePush(key);
      if (!ok) {
        setError("Attivazione non riuscita. Ricarica la pagina.");
        return;
      }
      setVisible(false);
    } catch {
      setError("Il browser ha rifiutato le notifiche.");
    } finally {
      setBusy(false);
    }
  }

  if (!visible && !error) return null;

  if (compact) {
    return (
      <div className="min-w-0">
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-teal-500 disabled:opacity-50"
          title="Attiva le notifiche sul PC"
        >
          Notifiche
        </button>
        {error ? (
          <p className="mt-0.5 max-w-[11rem] text-[9px] leading-tight text-amber-200">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-lg print:hidden">
      <p className="font-medium text-slate-900">Notifiche sul PC</p>
      <p className="mt-1 text-xs text-slate-600">
        Clicca per far comparire la domanda del browser (Windows o Mac). Senza
        questo clic il sistema non può chiedere il consenso da solo.
      </p>
      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => void enable()}
        className="mt-3 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-50"
      >
        Attiva notifiche
      </button>
    </div>
  );
}

export function PushNotificationsProvider() {
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
      if (!canUseNotifications()) return;
      if (Notification.permission !== "granted") return;
      try {
        const key = await vapidPublicKeyAction();
        if (!key || cancelled) return;
        await subscribePush(key);
      } catch {
        /* ignore */
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  return <EnablePcNotificationsButton />;
}
