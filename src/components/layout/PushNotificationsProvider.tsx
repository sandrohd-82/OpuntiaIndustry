"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  savePushSubscriptionAction,
  vapidPublicKeyAction,
} from "@/app/actions/notifiche";
import {
  ackAvvisoAction,
  listMieiAvvisiPendentiAction,
  type DueAvvisoRow,
} from "@/app/actions/pn-avvisi";
import { notifyNotificheNav } from "@/lib/notifiche/nav-event";
import { PnAvvisoSvegliaModal } from "@/components/layout/PnAvvisoSvegliaModal";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

function canAskPermission(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function canUsePush(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

async function subscribePush(publicKey: string): Promise<boolean> {
  if (!canUsePush()) return false;
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

function playSvegliaBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    /* ignore */
  }
}

type ConsentState = {
  needsConsent: boolean;
  denied: boolean;
  unsupported: boolean;
  busy: boolean;
  error: string | null;
  enable: () => void;
};

const ConsentContext = createContext<ConsentState | null>(null);

export function useNotificationConsent(): ConsentState {
  return (
    useContext(ConsentContext) ?? {
      needsConsent: false,
      denied: false,
      unsupported: false,
      busy: false,
      error: null,
      enable: () => undefined,
    }
  );
}

export function NotificationConsentBanner() {
  const { needsConsent, denied, unsupported, busy, error, enable } =
    useNotificationConsent();
  if (!needsConsent && !error) return null;
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-teal-200 bg-teal-50 px-3 py-1.5 text-xs text-teal-950 print:hidden">
      <p className="min-w-0 flex-1">
        {unsupported
          ? "Questo browser non può chiedere le notifiche. Usa Chrome o Edge, oppure su iPhone aggiungi il gestionale alla schermata Home."
          : denied
            ? "Le notifiche sono bloccate. Dal lucchetto del sito scegli Consentile, poi ricarica."
            : "Consenti le notifiche per avvisi e sveglie sul PC o sul telefono."}
        {error ? <span className="ml-1 text-red-800">{error}</span> : null}
      </p>
      {!unsupported ? (
        <button
          type="button"
          disabled={busy || denied}
          onClick={() => enable()}
          className="shrink-0 rounded bg-teal-700 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "Attivo…" : denied ? "Sblocco dal browser" : "Consenti notifiche"}
        </button>
      ) : null}
    </div>
  );
}

export function EnablePcNotificationsButton({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { needsConsent, busy, error, enable, unsupported } =
    useNotificationConsent();
  if (!needsConsent && !error) return null;
  if (compact) {
    return (
      <button
        type="button"
        disabled={busy || unsupported}
        onClick={() => enable()}
        className="rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-teal-500 disabled:opacity-50"
        title="Attiva le notifiche"
      >
        Notifiche
      </button>
    );
  }
  return null;
}

export function PushNotificationsProvider({
  children,
}: {
  children?: React.ReactNode;
}) {
  const [needsConsent, setNeedsConsent] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sveglia, setSveglia] = useState<DueAvvisoRow | null>(null);
  const [seenSveglie, setSeenSveglie] = useState<Set<string>>(new Set());

  const refreshConsent = useCallback(() => {
    if (!canAskPermission()) {
      setUnsupported(true);
      setNeedsConsent(true);
      setDenied(false);
      return;
    }
    setUnsupported(false);
    const perm = Notification.permission;
    setDenied(perm === "denied");
    setNeedsConsent(perm !== "granted");
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!canAskPermission()) {
        setUnsupported(true);
        setError("Questo browser non supporta le notifiche.");
        return;
      }
      const perm = await Notification.requestPermission();
      refreshConsent();
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Hai cliccato Blocca. Dal lucchetto del sito metti Consentile."
            : "Consenso non dato."
        );
        return;
      }
      const key =
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
        (await vapidPublicKeyAction());
      if (key && canUsePush()) {
        const ok = await subscribePush(key);
        if (!ok) {
          setError(
            "Consenso ok. La push sul telefono/PC chiuso non è partita: ricarica la pagina."
          );
        }
      }
    } catch {
      setError("Il browser ha rifiutato le notifiche.");
    } finally {
      setBusy(false);
    }
  }, [refreshConsent]);

  useEffect(() => {
    refreshConsent();
  }, [refreshConsent]);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      const href = ev.data?.href;
      if (ev.data?.type === "oi-notifica-open" && typeof href === "string") {
        notifyNotificheNav();
        if (href.startsWith("/")) window.location.assign(href);
      }
      if (ev.data?.type === "oi-notifica-push") {
        notifyNotificheNav();
        const titolo = String(ev.data.title || "Sveglia");
        const body = String(ev.data.body || "");
        if (ev.data.tipo === "avviso") {
          setSveglia((prev) =>
            prev ?? {
              id: String(ev.data.entityId || crypto.randomUUID()),
              origineTipo:
                String(ev.data.href || "").includes("attivita")
                  ? "attivita"
                  : "promemoria",
              origineId: String(ev.data.entityId || ""),
              offsetValore: 0,
              offsetUnita: "",
              notifyAt: new Date().toISOString(),
              titolo,
              dueAt: new Date().toISOString(),
              createdBy: null,
            }
          );
          playSvegliaBeep();
        }
        void body;
      }
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);

    let cancelled = false;
    void (async () => {
      if (!canAskPermission()) return;
      if (Notification.permission !== "granted") return;
      try {
        const key =
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ||
          (await vapidPublicKeyAction());
        if (!key || cancelled || !canUsePush()) return;
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

  const showDueSveglia = useCallback((items: DueAvvisoRow[]) => {
    const now = Date.now();
    const due = items.find(
      (a) =>
        new Date(a.notifyAt).getTime() <= now && !seenSveglie.has(a.id)
    );
    if (!due) return;
    setSeenSveglie((prev) => new Set(prev).add(due.id));
    setSveglia(due);
    playSvegliaBeep();
    if (canAskPermission() && Notification.permission === "granted") {
      try {
        new Notification("Sveglia", {
          body: `Avvisami ${due.offsetValore} ${due.offsetUnita} prima: «${due.titolo}»`,
          tag: `oi-avviso-${due.id}`,
        });
      } catch {
        /* ignore */
      }
    }
  }, [seenSveglie]);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const res = await listMieiAvvisiPendentiAction();
      if (cancelled || !res.success) return;
      showDueSveglia(res.items);
    }
    void tick();
    const id = window.setInterval(() => void tick(), 20_000);
    const onFocus = () => void tick();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [showDueSveglia]);

  const value = useMemo<ConsentState>(
    () => ({
      needsConsent,
      denied,
      unsupported,
      busy,
      error,
      enable: () => void enable(),
    }),
    [needsConsent, denied, unsupported, busy, error, enable]
  );

  return (
    <ConsentContext.Provider value={value}>
      {children}
      {sveglia ? (
        <PnAvvisoSvegliaModal
          avviso={sveglia}
          onAck={() => {
            const id = sveglia.id;
            setSveglia(null);
            void ackAvvisoAction({ avvisoId: id });
          }}
        />
      ) : null}
    </ConsentContext.Provider>
  );
}
