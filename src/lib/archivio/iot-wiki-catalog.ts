import {
  CAMPIONI_DIDATTICI,
  ESEMPIO_COMANDO_WIKI,
  ML_TOLLERANZE,
  stimaPercBruciatore,
  tolKg,
} from "@/lib/action/essiccatore-apprendimento";
import {
  makeArticle,
  type TutorialArticle,
  type TutorialSection,
} from "@/lib/archivio/tutorial-types";

export const IOT_WIKI_SECTIONS: TutorialSection[] = [
  { id: "guida", title: "Guida" },
  { id: "protocollo", title: "Protocollo Mex" },
  { id: "sicurezza", title: "Sicurezza" },
  { id: "apprendimento", title: "Apprendimento" },
  { id: "api", title: "Riferimento API" },
];

const invernoTappo = stimaPercBruciatore(ESEMPIO_COMANDO_WIKI, CAMPIONI_DIDATTICI);
const estateVuoto = stimaPercBruciatore(
  {
    essiccatoreId: "ess-a",
    kgProdotto: 0,
    tempAmbienteC: 35,
    umiditaAmbientePct: 40,
    percVentilazione: 70,
    tempObiettivoC: 40,
  },
  CAMPIONI_DIDATTICI
);

function listIotWikiArticles(): TutorialArticle[] {
  return [
    makeArticle({
      id: "come-usare-wiki",
      sectionId: "guida",
      sectionTitle: "Guida",
      title: "Come usare la Wiki IoT",
      summary:
        "Indice ricercabile di protocollo, sicurezza, apprendimento e API Mex. Stesso schema del Tutorial.",
      path: "/app/archivio/iot/wiki",
      tags: ["wiki", "iot", "ricerca", "tutorial", "api"],
      blocks: [
        {
          type: "p",
          text: "Questa Wiki sta in Archivio → IoT → Wiki. A sinistra cerchi (mex, checksum, ventola, kg, umidità…). A destra leggi la scheda. Le frecce in fondo passano alla scheda successiva.",
        },
        {
          type: "ol",
          items: [
            "Apri Archivio → IoT → Wiki.",
            "Scrivi nella ricerca: es. «bruciatore», «7E», «tappo», «A05».",
            "Apri la scheda. Se c’è un percorso, il link porta alla pagina operativa.",
          ],
        },
        {
          type: "note",
          text: "Le spiegazioni operative restano anche in Archivio → Tutorial. Qui c’è il dettaglio IoT / Action come se fosse la documentazione API del protocollo.",
        },
      ],
    }),
    makeArticle({
      id: "mex-unico",
      sectionId: "protocollo",
      sectionTitle: "Protocollo Mex",
      title: "Frame unico Mex",
      summary:
        "Un solo hex per WiFi, XBee e LoRa: 7E, classe, UID 8 byte SH+SL, comando, checksum.",
      path: "/app/archivio/iot/leggenda-mex",
      tags: ["mex", "7e", "uid", "sh", "sl", "checksum"],
      blocks: [
        {
          type: "code",
          caption: "Struttura (18 byte)",
          text: "7E | LEN=15 | CLS | UID[8] SH+SL | DIR | TIPO | CMD | D0 D1 D2 | CHK",
        },
        {
          type: "ul",
          items: [
            "7E = solo inizio frame (non è la classe).",
            "CLS = C comunicazione, I impostazione, E errore, A allerta.",
            "UID = 8 byte: su XBee è SH (4 alti) + SL (4 bassi); su LoRa è il DevEUI; su WiFi la stessa chiave.",
            "DIR O = Out (gestionale→device), I = In.",
            "TIPO A Action, R Request, K acK, S Sensor.",
            "CHK = 0xFF − (somma da CLS a D2).",
          ],
        },
        {
          type: "p",
          text: "L’Arduino gateway non traduce il significato: inoltra gli stessi 18 byte. Cambia solo l’involucro (JSON HTTPS, telaio XBee 0x10, FRMPayload LoRa).",
        },
      ],
    }),
    makeArticle({
      id: "tre-mezzi",
      sectionId: "protocollo",
      sectionTitle: "Protocollo Mex",
      title: "WiFi, XBee e LoRa",
      summary: "Stesso Mex, tre involucri. Esempio On bruciatore (A01).",
      tags: ["wifi", "xbee", "lora", "a01"],
      blocks: [
        {
          type: "p",
          text: "Esempio UID Digi SH 0013A200 + SL 4162C81F. On bruciatore = comando A01, D0=01.",
        },
        {
          type: "table",
          headers: ["Mezzo", "Cosa cambia", "Cosa resta"],
          rows: [
            ["WiFi / HTTPS", "JSON con campo mex (hex)", "18 byte Mex + CHK"],
            ["XBee API 0x10", "Telaio radio, dest 64 bit = SH+SL, FFFE", "RF Data = Mex"],
            ["LoRaWAN", "DevEUI = UID, FPort, MIC dello stack", "FRMPayload = Mex"],
          ],
        },
        {
          type: "note",
          text: "In XBee AP=2 i byte 7E/7D/11/13 sul UART si escapano. Il 7E interno del Mex diventa 7D 5E. Non confondere il 7E del telaio XBee con quello del Mex.",
        },
      ],
    }),
    makeArticle({
      id: "cadenza-sicurezza",
      sectionId: "sicurezza",
      sectionTitle: "Sicurezza",
      title: "Cadenza ventola prima del bruciatore",
      summary:
        "È proibito accendere o tenere il bruciatore senza ventola On. Un Mex alla volta, attesa conferma.",
      path: "/app/action/aree/essiccatori",
      tags: ["sicurezza", "ventola", "bruciatore", "interblocco"],
      blocks: [
        {
          type: "warn",
          text: "Mai far partire o tenere acceso il bruciatore se la ventola non è confermata On. Il sistema blocca l’invio.",
        },
        {
          type: "ol",
          items: [
            "Imposta potenza ventola → attesa conferma.",
            "On ventola → attesa conferma.",
            "Imposta temperatura obiettivo → attesa.",
            "Imposta apertura bruciatore (stima A+) → attesa.",
            "On bruciatore → attesa.",
          ],
        },
        {
          type: "p",
          text: "Il pannello Mex non è vincolante: click fuori lo riduce a banner in basso (ultimo messaggio o «in attesa conferma»). Click sul banner lo riporta al centro.",
        },
      ],
    }),
    makeArticle({
      id: "apprendimento-a",
      sectionId: "apprendimento",
      sectionTitle: "Apprendimento",
      title: "Opzione A+: media sui vicini",
      summary:
        "Campioni quando la temperatura si mantiene. La partenza è la media pesata dei cicli simili. Action la esegue subito.",
      tags: ["apprendimento", "campioni", "media", "kg", "umidita", "ambiente"],
      blocks: [
        {
          type: "p",
          text: "Un campione si registra quando, dopo circa 5 minuti dalla modifica, la temperatura si mantiene. Non si usa il primo transitorio. Soft delete e audit: i cicli non si cancellano.",
        },
        {
          type: "note",
          text: "In Avvio non si digitano kg, aria e umidità. TEMP-AMB e UMID-AMB arrivano periodicamente dalla sonda e restano in action_essiccatore_sensor_letture. I kg sono la somma degli effetti essiccatore.carica_cestone eseguiti sul foglio; senza carichi il carico è 0 kg (scarico libero).",
        },
        {
          type: "h",
          text: "Cosa entra nella media",
        },
        {
          type: "table",
          headers: ["Parametro", "Perché conta", "Vicino se"],
          rows: [
            [
              "Kg prodotto",
              "Vuoto = scarico libero. ~2000 kg = effetto tappo: l’aria non attraversa uguale.",
              `±10% (minimo ${tolKg(0)} kg, così lo 0 non si confonde col pieno)`,
            ],
            [
              "Temperatura aria ingresso",
              "35°C estivi o 5°C invernali sono l’aria che entra nel bruciatore.",
              `±${ML_TOLLERANZE.tempAmbienteC}°C`,
            ],
            [
              "Umidità aria ingresso",
              "Aria umida e fredda cambia il calore utile.",
              `±${ML_TOLLERANZE.umiditaAmbientePct}% UR`,
            ],
            ["Ventilazione", "Portata d’aria sul prodotto.", "±5%"],
            ["Temperatura tenuta", "Il risultato del ciclo, vicino all’obiettivo.", "±3°C"],
          ],
        },
        {
          type: "p",
          text: "Se non c’è nessun vicino stretto, il raggio raddoppia una volta. Se ancora nessuno, si usa una ricetta seme (da affinare dopo 5 minuti). Non si parte da 0% a scalini di 3%: 20 scatti × 5 min = 1 ora e 40 solo per arrivare in zona.",
        },
        {
          type: "note",
          text: "Dopo la partenza il sistema rifinisce in corso d’opera: ogni 5 minuti un piccolo correttivo. Quando la temperatura si mantiene, quel ciclo diventa un nuovo campione.",
        },
      ],
    }),
    makeArticle({
      id: "esempio-40-gradi",
      sectionId: "apprendimento",
      sectionTitle: "Apprendimento",
      title: "Esempio: 40°C a ventola 70%",
      summary:
        "Stesso obiettivo e stessa ventola, partenze diverse se cambia kg e clima (estate vuoto vs inverno tappo).",
      tags: ["esempio", "40", "70", "2000", "tappo", "inverno"],
      blocks: [
        {
          type: "p",
          text: "Hai già visto cicli che si mantengono, per esempio: ventola 100% + bruciatore 20% → 60°C; 90% + 30% → 70°C; 100% + 10% → 35°C. Non basta. Lo stesso 40°C a ventola 70% richiede aperture diverse se l’essiccatore è vuoto d’estate o pieno d’inverno.",
        },
        {
          type: "h",
          text: "Comando nuovo",
        },
        {
          type: "p",
          text: "Obiettivo 40°C, ventola 70%, 2000 kg (effetto tappo), aria in ingresso 5°C e 70% UR (inverno).",
        },
        {
          type: "table",
          headers: ["Vicino usato", "Ventola", "Bruciatore", "Temp tenuta", "Kg", "Aria"],
          rows: invernoTappo.vicini.slice(0, 6).map((v) => [
            v.campione.note || v.campione.id,
            `${v.campione.percVentilazione}%`,
            `${v.campione.percBruciatore}%`,
            `${v.campione.tempTenutaC}°C`,
            `${v.campione.kgProdotto} kg`,
            `${v.campione.tempAmbienteC}°C / ${v.campione.umiditaAmbientePct}%`,
          ]),
        },
        {
          type: "p",
          text: `${invernoTappo.spiegazione} Action esegue subito circa ${invernoTappo.percBruciatore}% di apertura, non 0% + 3% ogni 5 minuti.`,
        },
        {
          type: "h",
          text: "Stesso 40°C / 70% ventola, ma estate e vuoto",
        },
        {
          type: "p",
          text: `0 kg (scarico libero), aria 35°C / 40% UR. ${estateVuoto.spiegazione} Partenza circa ${estateVuoto.percBruciatore}%.`,
        },
        {
          type: "warn",
          text: `Inverno + 2000 kg ≈ ${invernoTappo.percBruciatore}% bruciatore. Estate + vuoto ≈ ${estateVuoto.percBruciatore}%. Stesso obiettivo, stesso % ventola: il tappo e l’aria fredda/umida in ingresso chiedono più fuoco in partenza.`,
        },
      ],
    }),
    makeArticle({
      id: "api-comandi",
      sectionId: "api",
      sectionTitle: "Riferimento API",
      title: "Comandi Mex (A01–A05, R10)",
      summary: "Lettere tipo + numero comando. Checksum stile XBee.",
      tags: ["api", "a01", "a02", "a03", "a04", "a05", "r10"],
      blocks: [
        {
          type: "table",
          headers: ["Codice", "Dir", "Nome", "Dati"],
          rows: [
            ["A04", "Out", "Imposta potenza ventola", "D0 = % 0–100"],
            ["A03", "Out", "On / Off ventola", "D0 = 01 On, 00 Off"],
            ["A02", "Out", "Imposta temperatura", "D0 = °C 35–70"],
            ["A05", "Out", "Imposta apertura bruciatore", "D0 = % stimata A+"],
            ["A01", "Out", "On / Off bruciatore", "D0 = 01 On (solo se ventola On)"],
            ["Kxx", "In", "Conferma", "D0 ok, D1 stato/valore"],
            ["R10 / S10", "Out / In", "Sensore", "D0 id, D1–D2 valore"],
          ],
        },
        {
          type: "code",
          caption: "Invio Avvio (ordine obbligatorio)",
          text: "A04 → attesa K04\nA03 On → attesa K03\nA02 → attesa K02\nA05 → attesa K05\nA01 On → attesa K01",
        },
        {
          type: "p",
          text: "UID di esempio 0013A200 4162C81F. Dettaglio hex in Archivio → IoT → Leggenda Mex.",
        },
      ],
    }),
    makeArticle({
      id: "api-campioni",
      sectionId: "api",
      sectionTitle: "Riferimento API",
      title: "Tabella campioni e stima",
      summary:
        "action_essiccatore_ml_campioni: chi, quando, condizioni, % usata, temperatura tenuta.",
      tags: ["api", "campioni", "rls", "audit", "iso"],
      blocks: [
        {
          type: "p",
          text: "Tabella action_essiccatore_ml_campioni: created_at/by, updated_at/by, deleted_at (mai delete fisico), versione, stato documento (Bozza / Approvato / Chiuso). RLS area Action. Solo campioni Approvato + esito stabile entrano nella media.",
        },
        {
          type: "ul",
          items: [
            "kg_prodotto, temp_ambiente_c, umidita_ambiente_pct",
            "perc_ventilazione, perc_bruciatore",
            "temp_obiettivo_c, temp_tenuta_c, finestra_min (default 5)",
            "azione_id (collegamento all’avvio che ha generato il ciclo)",
          ],
        },
        {
          type: "p",
          text: "All’Avvio il server ricalcola la stima, la scrive in perc_bruciatore_prevista, invia A05 e registra l’audit (fonte vicini / raggio allargato / seme, numero vicini, kg e clima).",
        },
      ],
    }),
  ];
}

let cache: TutorialArticle[] | null = null;

export function listIotWikiArticlesCached(): TutorialArticle[] {
  if (!cache) cache = listIotWikiArticles();
  return cache;
}

export function getIotWikiArticle(id: string): TutorialArticle | undefined {
  return listIotWikiArticlesCached().find((a) => a.id === id);
}

export function iotWikiSectionsWithCounts(articles: TutorialArticle[]) {
  return IOT_WIKI_SECTIONS.filter((s) =>
    articles.some((a) => a.sectionId === s.id)
  ).map((s) => ({
    ...s,
    count: articles.filter((a) => a.sectionId === s.id).length,
  }));
}
