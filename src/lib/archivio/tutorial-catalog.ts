import { ACTION_SECTIONS } from "@/lib/areas/action";
import { AMMINISTRAZIONE_SECTIONS } from "@/lib/areas/amministrazione";
import { ARCHIVIO_SECTIONS } from "@/lib/areas/archivio";
import { AREA_FORNITORI_SECTIONS } from "@/lib/areas/area-fornitori";
import { AREA_FISCALE_SECTIONS } from "@/lib/areas/area-fiscale";
import { CHAT_SECTIONS } from "@/lib/areas/chat";
import { COMMERCIALE_SECTIONS } from "@/lib/areas/commerciale";
import { AREA_ROUTES } from "@/lib/areas/config";
import { MAGAZZINO_SECTIONS } from "@/lib/areas/magazzino";
import { isNavBranch, type NavItem } from "@/lib/areas/nav-tree";
import { PRODUZIONE_SECTIONS } from "@/lib/areas/produzione";
import { PROMEMORIE_E_NOTE_SECTIONS } from "@/lib/areas/promemorie-e-note";
import { RICERCA_SVILUPPO_SECTIONS } from "@/lib/areas/ricerca-sviluppo";
import {
  CANALI_PUBBLICAZIONE_NAV,
  OPUNTIA_ITALIA_NAV,
  WIKI_UNDER_WEB,
} from "@/lib/areas/web";
import { WEBMAIL_SECTIONS } from "@/lib/areas/webmail";
import { TUTORIAL_CORE_ARTICLES } from "@/lib/archivio/tutorial-core";
import {
  PAGE_EXTRAS,
  PLACEHOLDER_PATHS,
  TUTORIAL_EXTRA_ARTICLES,
} from "@/lib/archivio/tutorial-pages";
import {
  makeArticle,
  pathToArticleId,
  TUTORIAL_SECTIONS,
  type TutorialArticle,
  type TutorialBlock,
  type TutorialMaturity,
} from "@/lib/archivio/tutorial-types";

const SKIP_PATHS = new Set(["/app/archivio/tutorial", "/app/archivio"]);

function defaultBlocks(input: {
  label: string;
  description: string;
  path: string;
  crumbs: string[];
  maturity: TutorialMaturity;
}): TutorialBlock[] {
  const extra = PAGE_EXTRAS[input.path] ?? [];
  const blocks: TutorialBlock[] = [
    {
      type: "p",
      text: input.description || `Pagina «${input.label}» del gestionale.`,
    },
    { type: "h", text: "Dove si trova" },
    {
      type: "p",
      text: `Menu: ${input.crumbs.join(" → ")}. Percorso: ${input.path}`,
    },
    ...extra,
  ];
  if (input.maturity === "placeholder") {
    blocks.push({
      type: "warn",
      text: "Questa voce è già nel menu, ma la pagina non è ancora pronta. Aprirla mostra un segnaposto. Non è un errore di permessi.",
    });
  }
  if (input.path.startsWith("/app/archivio/") && extra.length === 0) {
    blocks.push({
      type: "p",
      text: "È uno storico: qui trovi documenti già chiusi o eliminati in modo controllato (soft delete). Non si lavora il quotidiano, si consulta e si traccia.",
    });
  }
  if (extra.length === 0 && input.maturity !== "placeholder") {
    blocks.push({
      type: "h",
      text: "Come si usa",
    });
    blocks.push({
      type: "ol",
      items: [
        `Apri ${input.crumbs.join(" → ")}.`,
        "Usa ricerca o filtri in cima alla pagina, se ci sono.",
        "Apri la riga o il pulsante + per creare o modificare.",
        "I dati operativi non si cancellano: si chiudono o restano in Archivio.",
      ],
    });
  }
  return blocks;
}

function walkNav(
  items: readonly NavItem[],
  sectionId: string,
  sectionTitle: string,
  crumbs: string[],
  out: TutorialArticle[],
  seen: Set<string>
) {
  for (const item of items) {
    if (SKIP_PATHS.has(item.path) || item.slug === "tutorial") continue;
    const nextCrumbs = [...crumbs, item.label];
    if (!seen.has(item.path)) {
      seen.add(item.path);
      const maturity: TutorialMaturity = PLACEHOLDER_PATHS.has(item.path)
        ? "placeholder"
        : "completo";
      out.push(
        makeArticle({
          id: pathToArticleId(item.path),
          sectionId,
          sectionTitle,
          title: item.label,
          summary: item.description,
          path: item.path,
          maturity,
          tags: nextCrumbs,
          blocks: defaultBlocks({
            label: item.label,
            description: item.description,
            path: item.path,
            crumbs: nextCrumbs,
            maturity,
          }),
        })
      );
    }
    if (isNavBranch(item)) {
      walkNav(item.children, sectionId, sectionTitle, nextCrumbs, out, seen);
    }
  }
}

function addHub(
  sectionId: string,
  title: string,
  path: string,
  summary: string,
  out: TutorialArticle[],
  seen: Set<string>
) {
  if (seen.has(path)) return;
  seen.add(path);
  const meta = Object.values(AREA_ROUTES).find((r) => r.path === path);
  out.push(
    makeArticle({
      id: pathToArticleId(path),
      sectionId,
      sectionTitle: title,
      title: meta?.label ?? title,
      summary: summary,
      path,
      tags: [title],
      blocks: [
        { type: "p", text: summary },
        {
          type: "p",
          text: `Apri l’area dal menu laterale. Percorso: ${path}`,
        },
      ],
    })
  );
}

function buildPageArticles(): TutorialArticle[] {
  const out: TutorialArticle[] = [];
  const seen = new Set<string>();

  seen.add("/app/dashboard");
  out.push(
    makeArticle({
      id: pathToArticleId("/app/dashboard"),
      sectionId: "dashboard",
      sectionTitle: "Dashboard",
      title: "Dashboard",
      summary: "Pagina di ingresso dopo il login. Oggi è un segnaposto.",
      path: "/app/dashboard",
      maturity: "placeholder",
      tags: ["Dashboard"],
      blocks: [
        {
          type: "p",
          text: "Dopo il login arrivi in Dashboard. La pagina vera (grafici, alert) non è ancora costruita. Per lavorare vai alle altre aree del menu.",
        },
        {
          type: "warn",
          text: "Segnaposto. Non è un problema di permessi.",
        },
      ],
    })
  );

  walkNav(
    AMMINISTRAZIONE_SECTIONS,
    "amministrazione",
    "Amministrazione",
    ["Amministrazione"],
    out,
    seen
  );
  walkNav(
    [OPUNTIA_ITALIA_NAV, CANALI_PUBBLICAZIONE_NAV, WIKI_UNDER_WEB],
    "web",
    "Web (Opuntia Italia e Wiki)",
    ["Web"],
    out,
    seen
  );
  walkNav(
    RICERCA_SVILUPPO_SECTIONS,
    "ricerca-sviluppo",
    "Ricerca e sviluppo",
    ["Ricerca e sviluppo"],
    out,
    seen
  );
  walkNav(
    PRODUZIONE_SECTIONS as unknown as NavItem[],
    "produzione",
    "Produzione",
    ["Produzione"],
    out,
    seen
  );
  walkNav(ACTION_SECTIONS, "action", "Action (IoT)", ["Action"], out, seen);
  walkNav(CHAT_SECTIONS, "chat", "Chat", ["Chat"], out, seen);
  walkNav(WEBMAIL_SECTIONS, "webmail", "WebMail", ["WebMail"], out, seen);
  walkNav(MAGAZZINO_SECTIONS, "magazzino", "Magazzino", ["Magazzino"], out, seen);
  walkNav(
    PROMEMORIE_E_NOTE_SECTIONS,
    "promemorie-e-note",
    "Promemorie e note",
    ["Promemorie e note"],
    out,
    seen
  );
  walkNav(
    AREA_FISCALE_SECTIONS,
    "area-fiscale",
    "Area Fiscale",
    ["Area Fiscale"],
    out,
    seen
  );
  walkNav(
    AREA_FORNITORI_SECTIONS,
    "area-fornitori",
    "Gestionale Fornitori",
    ["Gestionale Fornitori"],
    out,
    seen
  );
  walkNav(
    ARCHIVIO_SECTIONS,
    "archivio",
    "Archivio",
    ["Archivio"],
    out,
    seen
  );
  walkNav(
    COMMERCIALE_SECTIONS,
    "nascoste",
    "Aree nascoste o in arrivo",
    ["Commerciale"],
    out,
    seen
  );

  addHub(
    "impostazioni",
    "Impostazioni",
    "/app/impostazioni",
    "Solo admin: 2FA e profilo fiscale aziendale.",
    out,
    seen
  );
  const imp = out.find((a) => a.path === "/app/impostazioni");
  if (imp && PAGE_EXTRAS["/app/impostazioni"]) {
    const idx = out.indexOf(imp);
    out[idx] = makeArticle({
      id: imp.id,
      sectionId: imp.sectionId,
      sectionTitle: imp.sectionTitle,
      title: imp.title,
      summary: imp.summary,
      path: imp.path,
      tags: imp.tags,
      blocks: PAGE_EXTRAS["/app/impostazioni"],
    });
  }

  addHub(
    "nascoste",
    "Aree nascoste o in arrivo",
    "/app/acquisti",
    "Area Acquisti prevista, oggi segnaposto. I fornitori e le schede stanno in Amministrazione.",
    out,
    seen
  );
  addHub(
    "nascoste",
    "Aree nascoste o in arrivo",
    "/app/hr",
    "Area HR prevista, oggi segnaposto. Persone e contratti stanno in Amministrazione → Organigramma.",
    out,
    seen
  );

  return out;
}

let cached: TutorialArticle[] | null = null;

export function listTutorialArticles(): TutorialArticle[] {
  if (cached) return cached;
  const pages = buildPageArticles();
  const seen = new Set<string>();
  const merged: TutorialArticle[] = [];
  for (const a of [
    ...TUTORIAL_CORE_ARTICLES,
    ...TUTORIAL_EXTRA_ARTICLES,
    ...pages,
  ]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    merged.push(a);
  }
  cached = merged;
  return merged;
}

export function getTutorialArticle(id: string): TutorialArticle | undefined {
  return listTutorialArticles().find((a) => a.id === id);
}

export function tutorialSectionsWithCounts(articles: TutorialArticle[]) {
  const count = new Map<string, number>();
  for (const a of articles) {
    count.set(a.sectionId, (count.get(a.sectionId) ?? 0) + 1);
  }
  return TUTORIAL_SECTIONS.filter((s) => (count.get(s.id) ?? 0) > 0).map(
    (s) => ({ ...s, count: count.get(s.id) ?? 0 })
  );
}

export { TUTORIAL_SECTIONS };
