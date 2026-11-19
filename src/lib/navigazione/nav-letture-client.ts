import type { AccessTone } from "@/lib/auth/page-access";
import type { MappaMenuFogliaNav, MappaMenuNodo } from "@/lib/magazzino/menu-mappa";
import type { DueAvvisoRow } from "@/app/actions/pn-avvisi";
import type { ProduzioneArea } from "@/lib/produzione/aree-posti";
import type { HaccpCategoria, HaccpVoce } from "@/lib/produzione/haccp";
import type { WebmailAccountPublic } from "@/lib/webmail/types";
import { letturaSecondaria } from "@/lib/navigazione/letture-secondarie";

type Esito = { success: false; error: string };
type Ok<T> = { success: true } & T;

async function chiedi<T>(url: string, init: RequestInit): Promise<T | Esito> {
  try {
    const risposta = await fetch(url, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      redirect: "manual",
      headers: { accept: "application/json", ...init.headers },
    });
    if (!risposta.ok) return { success: false, error: "Lettura non disponibile." };
    return (await risposta.json()) as T;
  } catch {
    return { success: false, error: "Lettura non disponibile." };
  }
}

function getJson<T>(url: string) {
  return chiedi<T>(url, { method: "GET" });
}

function postJson<T>(url: string, corpo: unknown) {
  return chiedi<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

export function leggiNotificheNonLette(tipo?: string) {
  const chiave = tipo ? `notifiche:${tipo}` : "notifiche";
  const url = tipo
    ? `/api/nav/letture?controllo=notifiche-non-lette&tipo=${encodeURIComponent(tipo)}`
    : "/api/nav/letture?controllo=notifiche-non-lette";
  return letturaSecondaria(chiave, () =>
    getJson<Ok<{ totale: number; perTipo: Record<string, number> }>>(url)
  );
}

export function leggiAvvisiPendenti() {
  return letturaSecondaria("avvisi-pendenti", () =>
    getJson<Ok<{ items: DueAvvisoRow[] }>>("/api/nav/letture?controllo=avvisi-pendenti")
  );
}

export function leggiChiaveVapid() {
  return letturaSecondaria("vapid-pubblica", async () => {
    const res = await getJson<{ chiave: string | null }>("/api/nav/letture?controllo=vapid-pubblica");
    if ("chiave" in res) return res.chiave;
    return null;
  });
}

export function leggiTicketBadge() {
  return letturaSecondaria("ticket-badge", () =>
    getJson<Ok<{ tickets: number; messaggi: number }>>("/api/nav/letture?controllo=ticket-badge")
  );
}

export function leggiOrdiniDaProcessare() {
  return letturaSecondaria("ordini-da-processare", () =>
    getJson<Ok<{ totale: number; merce: number; campionature: number }>>(
      "/api/nav/letture?controllo=ordini-da-processare"
    )
  );
}

export function leggiMappaMenu() {
  return letturaSecondaria("mappa-menu", () =>
    getJson<Ok<{ nodi: MappaMenuNodo[]; mappe: MappaMenuFogliaNav[] }>>(
      "/api/nav/letture?controllo=mappa-menu"
    )
  );
}

export function leggiProduzioneAree() {
  return letturaSecondaria("produzione-aree", () =>
    getJson<Ok<{ items: ProduzioneArea[]; isAdmin: boolean }>>(
      "/api/nav/letture?controllo=produzione-aree"
    )
  );
}

export function leggiHaccpRoutine() {
  return letturaSecondaria("haccp-routine", () =>
    getJson<Ok<{ categorie: HaccpCategoria[]; voci: HaccpVoce[] }>>(
      "/api/nav/letture?controllo=haccp-routine"
    )
  );
}

export function leggiWebmailMenu() {
  return letturaSecondaria("webmail-menu", () =>
    getJson<
      Ok<{
        accounts: WebmailAccountPublic[];
        grantedIds: string[];
        assignMode: boolean;
        grantTone: AccessTone;
      }>
    >("/api/nav/letture?controllo=webmail-menu")
  );
}

export type BandiereMenu = {
  ordini: boolean;
  notifiche: boolean;
  ticket: boolean;
  mappa: boolean;
  produzione: boolean;
  webmailAccounts: boolean;
  webmailGrant: boolean;
  spedizione: boolean;
};

export type RispostaBootstrap = {
  ordini: Ok<{ totale: number }> | null;
  notifiche: Ok<{ totale: number }> | null;
  ticket: Ok<{ tickets: number; messaggi: number }> | null;
  mappa: Ok<{ nodi: MappaMenuNodo[]; mappe: MappaMenuFogliaNav[] }> | null;
  produzione: Ok<{ items: ProduzioneArea[] }> | null;
  haccp: Ok<{ categorie: HaccpCategoria[]; voci: HaccpVoce[] }> | null;
  webmailAccounts: Ok<{ accounts: { id: string; label: string }[] }> | null;
  webmailGrant: Ok<{ grantTone: AccessTone }> | null;
  spedizione: Ok<{ totale: number }> | null;
};

const bootstrapVuoto: RispostaBootstrap = {
  ordini: null,
  notifiche: null,
  ticket: null,
  mappa: null,
  produzione: null,
  haccp: null,
  webmailAccounts: null,
  webmailGrant: null,
  spedizione: null,
};

export function leggiBootstrapMenu(flags: BandiereMenu) {
  return letturaSecondaria("bootstrap", async () => {
    const res = await postJson<RispostaBootstrap>("/api/nav/controlli", {
      controllo: "bootstrap",
      flags,
    });
    if ("ordini" in res) return res;
    return bootstrapVuoto;
  });
}

export function leggiPreventiviSpedizione() {
  return letturaSecondaria("preventivi-spedizione", () =>
    postJson<Ok<{ totale: number }>>("/api/nav/controlli", {
      controllo: "preventivi-spedizione",
    })
  );
}

export function leggiSchedeTrello() {
  return letturaSecondaria("trello", () =>
    postJson<Ok<{ nuove: number }>>("/api/nav/controlli", { controllo: "trello" })
  );
}
