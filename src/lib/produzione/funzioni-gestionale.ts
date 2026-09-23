import { ACTION_ACCESS_CATALOG } from "@/lib/auth/action-access";
import { ACTION_SECTIONS } from "@/lib/areas/action";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { ARCHIVIO_SECTIONS } from "@/lib/areas/archivio";
import { AREA_FORNITORI_SECTIONS } from "@/lib/areas/area-fornitori";
import { IMPOSTAZIONI_SECTIONS } from "@/lib/areas/impostazioni";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { AREA_ROUTES } from "@/lib/areas/config";
import { CHAT_SECTIONS } from "@/lib/areas/chat";
import { COMMERCIALE_SECTIONS } from "@/lib/areas/commerciale";
import { MAGAZZINO_SECTIONS } from "@/lib/areas/magazzino";
import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";
import { PROMEMORIE_E_NOTE_SECTIONS } from "@/lib/areas/promemorie-e-note";
import { RICERCA_SVILUPPO_SECTIONS } from "@/lib/areas/ricerca-sviluppo";
import { STRUMENTI_SECTIONS } from "@/lib/areas/strumenti";
import { WEBMAIL_SECTIONS } from "@/lib/areas/webmail";
import { WIKIOPUNTIA_SECTIONS } from "@/lib/areas/wikiopuntia";
import { PAGE_EXTRAS } from "@/lib/archivio/tutorial-pages";
import { z } from "zod";

export type FunzioneAvvio = "navigate" | "inline_pesata";
export type FunzioneTipo = "pagina" | "azione" | "inline";

export type FunzioneGestionale = {
  key: string;
  area: string;
  etichetta: string;
  spiegazione: string;
  percorso: string;
  tipo: FunzioneTipo;
  avvio: FunzioneAvvio;
};

export type AttivitaFunzioneLink = FunzioneGestionale;

export const funzioneKeysSchema = z
  .array(z.string().trim().min(1).max(240))
  .max(80)
  .optional()
  .default([]);

function spiegazioneDaTutorial(path: string, fallback: string): string {
  const blocks = PAGE_EXTRAS[path];
  if (!blocks?.length) return fallback;
  const texts = blocks
    .map((b) => ("text" in b ? String(b.text ?? "").trim() : ""))
    .filter(Boolean);
  return texts[0] || fallback;
}

function avvioDaPercorso(path: string, label: string): FunzioneAvvio {
  const hay = `${path} ${label}`.toLowerCase();
  if (hay.includes("pesata")) return "inline_pesata";
  return "navigate";
}

function etichettaAvvioDaItem(item: FunzioneGestionale): string {
  if (item.avvio === "inline_pesata") return "Registra pesata";
  const hay = `${item.percorso} ${item.etichetta}`.toLowerCase();
  if (hay.includes("prelev")) return "Effettua prelievo";
  if (hay.includes("inserisci-quantita") || hay.endsWith("/inserisci")) {
    return "Effettua carico";
  }
  return `Apri ${item.etichetta}`;
}

export function etichettaAvvioFunzione(item: FunzioneGestionale): string {
  return etichettaAvvioDaItem(item);
}

function pushUnique(
  map: Map<string, FunzioneGestionale>,
  item: FunzioneGestionale
) {
  if (!item.key || !item.percorso) return;
  if (!map.has(item.key)) map.set(item.key, item);
}

function flattenNav(
  items: readonly NavItem[],
  area: string,
  map: Map<string, FunzioneGestionale>
) {
  for (const item of items) {
    pushUnique(map, {
      key: `page:${item.path}`,
      area,
      etichetta: item.label,
      spiegazione: spiegazioneDaTutorial(item.path, item.description),
      percorso: item.path,
      tipo: "pagina",
      avvio: avvioDaPercorso(item.path, item.label),
    });
    if (isNavBranch(item)) flattenNav(item.children, area, map);
  }
}

const AREA_SECTIONS: Array<{ area: string; sections: readonly NavItem[] }> = [
  { area: "Amministrazione", sections: AMMINISTRAZIONE_SECTIONS },
  { area: "Commerciale", sections: COMMERCIALE_SECTIONS },
  { area: "Produzione", sections: PRODUZIONE_SECTIONS },
  { area: "Action", sections: ACTION_SECTIONS },
  { area: "Magazzino", sections: MAGAZZINO_SECTIONS },
  { area: "Area Fiscale", sections: AREA_FISCALE_SECTIONS },
  { area: "Strumenti", sections: STRUMENTI_SECTIONS },
  { area: "Chat", sections: CHAT_SECTIONS },
  { area: "WebMail", sections: WEBMAIL_SECTIONS },
  { area: "Promemorie e note", sections: PROMEMORIE_E_NOTE_SECTIONS },
  { area: "Gestionale Fornitori", sections: AREA_FORNITORI_SECTIONS },
  { area: "Ricerca e sviluppo", sections: RICERCA_SVILUPPO_SECTIONS },
  { area: "Archivio", sections: ARCHIVIO_SECTIONS },
  { area: "WikiOpuntia", sections: WIKIOPUNTIA_SECTIONS },
  { area: "Impostazioni", sections: IMPOSTAZIONI_SECTIONS },
];

let cached: FunzioneGestionale[] | null = null;

export function listFunzioniGestionaleCatalogo(): FunzioneGestionale[] {
  if (cached) return cached;
  const map = new Map<string, FunzioneGestionale>();

  pushUnique(map, {
    key: "inline:pesata",
    area: "Produzione",
    etichetta: "Pesata",
    spiegazione:
      "Registra un peso sul foglio di lavorazione. Il sistema chiede i kg e li salva nel registro pesate del processo.",
    percorso: "/app/produzione/fogli-in-esecuzione",
    tipo: "inline",
    avvio: "inline_pesata",
  });

  for (const [slug, meta] of Object.entries(AREA_ROUTES)) {
    pushUnique(map, {
      key: `page:${meta.path}`,
      area: meta.label,
      etichetta: meta.label,
      spiegazione: spiegazioneDaTutorial(meta.path, meta.description),
      percorso: meta.path,
      tipo: "pagina",
      avvio: "navigate",
    });
    void slug;
  }

  for (const group of AREA_SECTIONS) {
    flattenNav(group.sections, group.area, map);
  }

  for (const action of ACTION_ACCESS_CATALOG) {
    const path = `${action.path}#${action.key.replace(/^action:/, "")}`;
    pushUnique(map, {
      key: action.key.startsWith("action:")
        ? action.key
        : `action:${action.key}`,
      area: action.area,
      etichetta: action.label,
      spiegazione: `Azione di registrazione su ${action.path}: ${action.label}.`,
      percorso: path,
      tipo: "azione",
      avvio: "navigate",
    });
  }

  cached = [...map.values()].sort((a, b) => {
    const area = a.area.localeCompare(b.area, "it");
    if (area !== 0) return area;
    if (a.tipo !== b.tipo) {
      const order = { inline: 0, pagina: 1, azione: 2 };
      return order[a.tipo] - order[b.tipo];
    }
    return a.etichetta.localeCompare(b.etichetta, "it");
  });
  return cached;
}

export function getFunzioneGestionale(
  key: string
): FunzioneGestionale | undefined {
  return listFunzioniGestionaleCatalogo().find((f) => f.key === key);
}

export function resolveFunzioniDaKeys(
  keys: string[]
): { success: true; items: FunzioneGestionale[] } | { success: false; error: string } {
  const unique = [...new Set(keys.filter(Boolean))];
  const items: FunzioneGestionale[] = [];
  for (const key of unique) {
    const hit = getFunzioneGestionale(key);
    if (!hit) {
      return {
        success: false,
        error: `Funzione gestionale sconosciuta: ${key}`,
      };
    }
    items.push(hit);
  }
  return { success: true, items };
}

export function groupFunzioniByArea(
  items: FunzioneGestionale[]
): Array<{ area: string; items: FunzioneGestionale[] }> {
  const map = new Map<string, FunzioneGestionale[]>();
  for (const item of items) {
    const list = map.get(item.area) ?? [];
    list.push(item);
    map.set(item.area, list);
  }
  return [...map.entries()].map(([area, grouped]) => ({
    area,
    items: grouped,
  }));
}

export function buildFunzioneHref(
  item: FunzioneGestionale,
  ctx?: {
    foglioId?: string | null;
    processoId?: string | null;
    attivitaId?: string | null;
    ritorno?: string | null;
  }
): string | null {
  if (item.avvio === "inline_pesata") return null;
  const base = item.percorso.split("#")[0] || item.percorso;
  const params = new URLSearchParams();
  if (ctx?.foglioId) params.set("foglio", ctx.foglioId);
  if (ctx?.processoId) params.set("processo", ctx.processoId);
  if (ctx?.attivitaId) params.set("attivita", ctx.attivitaId);
  if (ctx?.ritorno) params.set("ritorno", ctx.ritorno);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
