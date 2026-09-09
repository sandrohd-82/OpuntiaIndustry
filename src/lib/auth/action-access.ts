import {
  ACTION_ACCESS_KEY_PREFIX,
  type AccessTone,
  type PageAccessMap,
} from "@/lib/auth/page-access";

export type AnagraficaPrivilegeKind =
  | "cliente"
  | "cliente_possibile"
  | "fornitore";

export type ActionAccessItem = {
  key: string;
  path: string;
  label: string;
  area: string;
  /** Se presente, l’azione sta negli ambiti anagrafica (non in «Azioni di creazione»). */
  privilegeKind?: AnagraficaPrivilegeKind;
};

function item(
  area: string,
  path: string,
  slug: string,
  label: string,
  privilegeKind?: AnagraficaPrivilegeKind
): ActionAccessItem {
  return {
    key: `${ACTION_ACCESS_KEY_PREFIX}${path}/${slug}`,
    path,
    label,
    area,
    privilegeKind,
  };
}

/**
 * Azioni di creazione/registrazione sulle pagine (non le pagine di menu).
 * Elenco ampio: il Super Admin potrà togliere voci in un secondo momento.
 */
export const ACTION_ACCESS_CATALOG: readonly ActionAccessItem[] = [
  item("Amministrazione", "/app/amministrazione/clienti/elenco", "nuovo-cliente", "Nuovo cliente"),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/elenco",
    "timeline",
    "Mostra timeline",
    "cliente"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/elenco",
    "modifica-altrui",
    "Modifica schede non create da lui",
    "cliente"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/elenco",
    "elimina",
    "Eliminazione",
    "cliente"
  ),
  item("Amministrazione", "/app/amministrazione/clienti/possibili", "nuovo-possibile-cliente", "Nuovo possibile cliente"),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/possibili",
    "timeline",
    "Mostra timeline",
    "cliente_possibile"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/possibili",
    "modifica-altrui",
    "Modifica schede non create da lui",
    "cliente_possibile"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/clienti/possibili",
    "elimina",
    "Eliminazione",
    "cliente_possibile"
  ),
  item("Amministrazione", "/app/amministrazione/fornitori/bio", "nuovo-fornitore", "Nuovo fornitore"),
  item("Amministrazione", "/app/amministrazione/fornitori/elenco", "nuovo-fornitore", "Nuovo fornitore"),
  item(
    "Amministrazione",
    "/app/amministrazione/fornitori/elenco",
    "timeline",
    "Mostra timeline",
    "fornitore"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/fornitori/elenco",
    "modifica-altrui",
    "Modifica schede non create da lui",
    "fornitore"
  ),
  item(
    "Amministrazione",
    "/app/amministrazione/fornitori/elenco",
    "elimina",
    "Eliminazione",
    "fornitore"
  ),
  item("Amministrazione", "/app/amministrazione/rubrica", "nuovo-contatto", "Nuovo contatto"),
  item("Amministrazione", "/app/amministrazione/schede/materia-prima", "nuova-materia-prima", "Nuova materia prima"),
  item("Amministrazione", "/app/amministrazione/schede/servizi", "nuovo-servizio", "Nuovo servizio"),
  item("Amministrazione", "/app/amministrazione/schede/prodotti", "nuovo-prodotto", "Nuovo prodotto"),
  item("Amministrazione", "/app/amministrazione/schede/prodotti-propri", "nuovo-prodotto-proprio", "Nuovo prodotto proprio"),
  item("Amministrazione", "/app/amministrazione/schede/imballaggi-spedizioni", "aggiungi-voce", "Aggiungi voce catalogo"),
  item("Amministrazione", "/app/amministrazione/schede/listini-b2b", "crea-bozza", "Crea bozza"),
  item("Amministrazione", "/app/amministrazione/schede/listini-b2b", "crea-bozza-dal-modello", "Crea bozza dal modello"),
  item("Amministrazione", "/app/amministrazione/ordini/crea-nuovo", "crea-ordine", "Crea ordine"),
  item("Amministrazione", "/app/amministrazione/ordini/crea-nuovo", "invio-campionatura", "Invio campionatura"),
  item("Amministrazione", "/app/amministrazione/ordini/preventivi", "crea-nuovo", "Crea nuovo"),
  item("Amministrazione", "/app/archivio/amministrazione/ordini/storico", "aggiungi-ordine-storico", "Aggiungi ordine Storico"),
  item("Amministrazione", "/app/amministrazione/organigramma/elenco-e-mansioni", "nuovo-operatore", "Nuovo operatore"),
  item("Amministrazione", "/app/amministrazione/organigramma/elenco-e-mansioni", "nuova-mansione", "Nuova mansione"),
  item("Amministrazione", "/app/amministrazione/organigramma/elenco-e-mansioni", "nuovo-reparto", "Nuovo reparto"),
  item("Amministrazione", "/app/amministrazione/organigramma/elenco-e-mansioni", "crea-profilo", "Crea Profilo"),

  item("Produzione", "/app/produzione/processi-e-attivita/elenco-processi", "nuovo-processo", "Nuovo processo"),
  item("Produzione", "/app/produzione/processi-e-attivita/elenco-processi", "nuova-attivita", "Nuova attività"),
  item("Produzione", "/app/produzione/processi-e-attivita/elenco-attivita", "nuova-attivita", "Nuova attività"),
  item("Produzione", "/app/produzione/gestione-aree/elenco", "nuova-area", "Nuova area"),
  item("Produzione", "/app/produzione/gestione-aree", "aggiungi-macchinario", "Aggiungi macchinario"),
  item("Produzione", "/app/produzione/gestione-aree", "aggiungi-postazioni", "Aggiungi postazioni"),
  item("Produzione", "/app/produzione/gestione-aree", "aggiungi-evento", "Aggiungi evento"),
  item("Produzione", "/app/produzione/gestione-aree", "aggiungi-ricambio", "Aggiungi ricambio"),

  item("Magazzino", "/app/magazzino/materia-prima/elenco", "nuova-materia-prima", "Nuova materia prima"),
  item("Magazzino", "/app/magazzino/prodotti-di-consumo/elenco", "nuovo-prodotto", "Nuovo prodotto"),
  item("Magazzino", "/app/magazzino/prodotti-di-consumo/inserisci", "crea-nuovo-prodotto", "Crea nuovo prodotto"),
  item("Magazzino", "/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita", "nuovo-prodotto-proprio", "Nuovo prodotto proprio"),

  item("Area fiscale", "/app/area-fiscale/fatture/emesse", "registra-fattura", "Registra fattura"),
  item("Area fiscale", "/app/area-fiscale/fatture/ricevute", "registra-fattura", "Registra fattura"),
  item("Area fiscale", "/app/area-fiscale/note-di-credito/emesse", "registra-nota-di-credito", "Registra nota di credito"),
  item("Area fiscale", "/app/area-fiscale/dati-e-calcoli/iva-e-imposte", "aggiungi-adempimento", "Aggiungi adempimento"),
  item(
    "Area fiscale",
    "/app/area-fiscale",
    "elabora-contabilita",
    "Elabora contabilità (commercialista / Super Admin)"
  ),

  item("WebMail", "/app/webmail/impostazioni", "nuova-casella", "Nuova casella"),
] as const;

export const ACTION_ACCESS_KEY_SET = new Set(
  ACTION_ACCESS_CATALOG.map((row) => row.key)
);

export const AZ = {
  nuovoCliente:
    "action:/app/amministrazione/clienti/elenco/nuovo-cliente",
  clientiTimeline: "action:/app/amministrazione/clienti/elenco/timeline",
  clientiModificaAltrui:
    "action:/app/amministrazione/clienti/elenco/modifica-altrui",
  clientiElimina: "action:/app/amministrazione/clienti/elenco/elimina",
  nuovoPossibileCliente:
    "action:/app/amministrazione/clienti/possibili/nuovo-possibile-cliente",
  possibiliTimeline:
    "action:/app/amministrazione/clienti/possibili/timeline",
  possibiliModificaAltrui:
    "action:/app/amministrazione/clienti/possibili/modifica-altrui",
  possibiliElimina: "action:/app/amministrazione/clienti/possibili/elimina",
  nuovoFornitoreBio:
    "action:/app/amministrazione/fornitori/bio/nuovo-fornitore",
  nuovoFornitore:
    "action:/app/amministrazione/fornitori/elenco/nuovo-fornitore",
  fornitoriTimeline:
    "action:/app/amministrazione/fornitori/elenco/timeline",
  fornitoriModificaAltrui:
    "action:/app/amministrazione/fornitori/elenco/modifica-altrui",
  fornitoriElimina: "action:/app/amministrazione/fornitori/elenco/elimina",
  nuovoContatto: "action:/app/amministrazione/rubrica/nuovo-contatto",
  nuovaMateriaPrima:
    "action:/app/amministrazione/schede/materia-prima/nuova-materia-prima",
  nuovoServizio: "action:/app/amministrazione/schede/servizi/nuovo-servizio",
  nuovoProdotto: "action:/app/amministrazione/schede/prodotti/nuovo-prodotto",
  nuovoProdottoProprio:
    "action:/app/amministrazione/schede/prodotti-propri/nuovo-prodotto-proprio",
  aggiungiImballaggio:
    "action:/app/amministrazione/schede/imballaggi-spedizioni/aggiungi-voce",
  creaBozzaListino:
    "action:/app/amministrazione/schede/listini-b2b/crea-bozza",
  creaBozzaListinoModello:
    "action:/app/amministrazione/schede/listini-b2b/crea-bozza-dal-modello",
  creaOrdine: "action:/app/amministrazione/ordini/crea-nuovo/crea-ordine",
  invioCampionatura:
    "action:/app/amministrazione/ordini/crea-nuovo/invio-campionatura",
  creaPreventivo: "action:/app/amministrazione/ordini/preventivi/crea-nuovo",
  aggiungiOrdineStorico:
    "action:/app/archivio/amministrazione/ordini/storico/aggiungi-ordine-storico",
  nuovoOperatore:
    "action:/app/amministrazione/organigramma/elenco-e-mansioni/nuovo-operatore",
  nuovaMansione:
    "action:/app/amministrazione/organigramma/elenco-e-mansioni/nuova-mansione",
  nuovoReparto:
    "action:/app/amministrazione/organigramma/elenco-e-mansioni/nuovo-reparto",
  creaProfilo:
    "action:/app/amministrazione/organigramma/elenco-e-mansioni/crea-profilo",
  nuovoProcesso:
    "action:/app/produzione/processi-e-attivita/elenco-processi/nuovo-processo",
  nuovaAttivitaInProcesso:
    "action:/app/produzione/processi-e-attivita/elenco-processi/nuova-attivita",
  nuovaAttivita:
    "action:/app/produzione/processi-e-attivita/elenco-attivita/nuova-attivita",
  nuovaArea: "action:/app/produzione/gestione-aree/elenco/nuova-area",
  aggiungiMacchinario:
    "action:/app/produzione/gestione-aree/aggiungi-macchinario",
  aggiungiPostazioni:
    "action:/app/produzione/gestione-aree/aggiungi-postazioni",
  aggiungiEvento: "action:/app/produzione/gestione-aree/aggiungi-evento",
  aggiungiRicambio: "action:/app/produzione/gestione-aree/aggiungi-ricambio",
  nuovaMateriaPrimaMag:
    "action:/app/magazzino/materia-prima/elenco/nuova-materia-prima",
  nuovoProdottoMag:
    "action:/app/magazzino/prodotti-di-consumo/elenco/nuovo-prodotto",
  creaNuovoProdottoScan:
    "action:/app/magazzino/prodotti-di-consumo/inserisci/crea-nuovo-prodotto",
  nuovoProdottoProprioMag:
    "action:/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita/nuovo-prodotto-proprio",
  registraFatturaEmessa:
    "action:/app/area-fiscale/fatture/emesse/registra-fattura",
  registraFatturaRicevuta:
    "action:/app/area-fiscale/fatture/ricevute/registra-fattura",
  registraNotaCredito:
    "action:/app/area-fiscale/note-di-credito/emesse/registra-nota-di-credito",
  aggiungiAdempimento:
    "action:/app/area-fiscale/dati-e-calcoli/iva-e-imposte/aggiungi-adempimento",
  elaboraContabilita: "action:/app/area-fiscale/elabora-contabilita",
  nuovaCasella: "action:/app/webmail/impostazioni/nuova-casella",
} as const;

export function findActionItem(key: string): ActionAccessItem | undefined {
  return ACTION_ACCESS_CATALOG.find((row) => row.key === key);
}

/** Operativo: Off nasconde l’azione. On o non impostato = consentita. */
export function isActionAllowed(
  map: PageAccessMap,
  actionKey: string
): boolean {
  return map[actionKey] !== false;
}

/** Deny-by-default: solo On esplicito. */
export function isPrivilegedActionOn(
  map: PageAccessMap,
  actionKey: string
): boolean {
  return map[actionKey] === true;
}

export const ANAGRAFICA_PRIVILEGE_BLOCKS: ReadonlyArray<{
  scopeKey: string;
  kind: AnagraficaPrivilegeKind;
  title: string;
  items: readonly ActionAccessItem[];
}> = [
  {
    scopeKey: "anagrafiche_clienti",
    kind: "cliente",
    title: "Clienti — operazioni sulla scheda",
    items: ACTION_ACCESS_CATALOG.filter((row) => row.privilegeKind === "cliente"),
  },
  {
    scopeKey: "anagrafiche_clienti",
    kind: "cliente_possibile",
    title: "Possibili clienti — operazioni sulla scheda",
    items: ACTION_ACCESS_CATALOG.filter(
      (row) => row.privilegeKind === "cliente_possibile"
    ),
  },
  {
    scopeKey: "fornitori",
    kind: "fornitore",
    title: "Fornitori — operazioni sulla scheda",
    items: ACTION_ACCESS_CATALOG.filter((row) => row.privilegeKind === "fornitore"),
  },
];

/** Deny-by-default: solo commercialista, Super Admin reale, o On esplicito. */
export function canElaboraContabilitaAccess(opts: {
  isSuperadminSelf: boolean;
  isCommercialista: boolean;
  actionAccess: PageAccessMap;
}): boolean {
  if (opts.isSuperadminSelf) return true;
  if (opts.isCommercialista) return true;
  return opts.actionAccess[AZ.elaboraContabilita] === true;
}

export function toneForAction(
  map: PageAccessMap,
  actionKey: string
): AccessTone {
  if (!(actionKey in map)) return "unset";
  return map[actionKey] ? "on" : "off";
}

export function groupActionCatalog(
  items: readonly ActionAccessItem[] = ACTION_ACCESS_CATALOG.filter(
    (row) => !row.privilegeKind
  )
): Array<{ area: string; items: ActionAccessItem[] }> {
  const groups: Array<{ area: string; items: ActionAccessItem[] }> = [];
  const index = new Map<string, ActionAccessItem[]>();
  for (const row of items) {
    let list = index.get(row.area);
    if (!list) {
      list = [];
      index.set(row.area, list);
      groups.push({ area: row.area, items: list });
    }
    list.push(row);
  }
  return groups;
}
