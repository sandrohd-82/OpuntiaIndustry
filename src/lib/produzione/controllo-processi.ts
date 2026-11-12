/**
 * Logica dei fogli di Controllo Processi.
 * Le funzioni (foto, firme, SMS, DDT) si attivano una voce alla volta.
 */

export type SoggettoControllo =
  | "agrinsicilia"
  | "fornitore"
  | "trasportatore"
  | "responsabile";

export type FunzioneVoce =
  | "documento"
  | "controllo"
  | "foto"
  | "archivio"
  | "segnalazione"
  | "contatto"
  | "dato"
  | "lotto"
  | "ddt"
  | "otp"
  | "orario"
  | "arrivo";

export type VoceControllo = {
  codice: string;
  titolo: string;
  testo: string;
  /** Chi compila o chi deve agire. */
  soggetti: SoggettoControllo[];
  funzione: FunzioneVoce;
  /** Il fornitore la vede nella sua area. */
  latoFornitore: boolean;
  /** Dopo questa voce il foglio può restare in attesa. */
  attesaDopo?: boolean;
  /** Rinvio a un'altra voce della stessa procedura. */
  riferimento?: string;
  nota?: string;
};

export type GruppoControllo = {
  codice: string;
  titolo: string;
  voci: VoceControllo[];
};

export type ProcessoControllo = {
  slug: string;
  titolo: string;
  sintesi: string;
  areaFornitore: string | null;
  gruppi: GruppoControllo[];
};

export const REGOLE_FOGLIO_CONTROLLO = [
  "Ogni esecuzione di un processo apre un foglio, salvato nel gestionale.",
  "Il foglio ha una data di apertura.",
  "Un foglio può coinvolgere più soggetti nello stesso percorso.",
  "Si può fare una parte, lasciare il foglio in attesa e riprenderlo dopo.",
  "Il foglio resta aperto fino all'ultima voce.",
] as const;

export const ETICHETTA_SOGGETTO: Record<SoggettoControllo, string> = {
  agrinsicilia: "Agrinsicilia",
  fornitore: "Fornitore",
  trasportatore: "Trasportatore",
  responsabile: "Responsabile",
};

export const ETICHETTA_FUNZIONE: Record<FunzioneVoce, string> = {
  documento: "Documento e presa visione",
  controllo: "Controllo sul campo",
  foto: "Foto",
  archivio: "Salvataggio nel gestionale",
  segnalazione: "Segnalazione",
  contatto: "Contatto con il responsabile",
  dato: "Dato da inserire",
  lotto: "Lotto",
  ddt: "DDT",
  otp: "Firma con codice SMS",
  orario: "Orario",
  arrivo: "Arrivo",
};

const materialeInIngresso: ProcessoControllo = {
  slug: "materiale-in-ingresso",
  titolo: "Materiale in ingresso",
  sintesi:
    "Parte dal controllo sul campo del fornitore e si chiude all'arrivo in sede Agrinsicilia.",
  areaFornitore: "/app/area-fornitori/materiale-in-ingresso",
  gruppi: [
    {
      codice: "responsabilita",
      titolo: "Controlli e responsabilità",
      voci: [
        {
          codice: "doc",
          titolo: "Presa visione",
          testo:
            "Agrinsicilia invia al fornitore un documento. Il fornitore è obbligato a firmarlo per presa visione. È responsabile di informare i propri collaboratori, per esempio il trasportatore se il trasporto è conto terzi, sulle procedure e sui controlli che li riguardano.",
          soggetti: ["agrinsicilia", "fornitore"],
          funzione: "documento",
          latoFornitore: true,
        },
      ],
    },
    {
      codice: "mezzo",
      titolo: "Controllo del mezzo",
      voci: [
        {
          codice: "mezzo",
          titolo: "Cassone prima del carico delle pale",
          testo:
            "Controllo del mezzo usato per caricare i contenitori con le pale. Nel cassone non devono esserci agenti contaminanti: olii, polveri, cladodi o altri materiali degradati, muffe, o qualsiasi cosa ritenuta pericolosa o contaminante per i cladodi.",
          soggetti: ["fornitore"],
          funzione: "controllo",
          latoFornitore: true,
        },
      ],
    },
    {
      codice: "obblighi",
      titolo: "1. Obblighi",
      voci: [
        {
          codice: "1a",
          titolo: "Fotografare il cassone",
          testo:
            "Fotografare con particolare attenzione i punti sospetti o dubbi del cassone: olii, ruggine o altri agenti contaminanti.",
          soggetti: ["fornitore"],
          funzione: "foto",
          latoFornitore: true,
        },
        {
          codice: "1b",
          titolo: "Salvare le foto",
          testo: "Le foto si caricano e restano salvate nel gestionale.",
          soggetti: ["fornitore"],
          funzione: "archivio",
          latoFornitore: true,
          riferimento: "1a",
        },
        {
          codice: "1c",
          titolo: "Materiale rimovibile",
          testo:
            "Se l'anomalia è materiale facilmente rimovibile, il fornitore lo segnala all'autista. L'autista è obbligato a rimuoverlo prima del carico.",
          soggetti: ["fornitore", "trasportatore"],
          funzione: "segnalazione",
          latoFornitore: true,
        },
        {
          codice: "1d",
          titolo: "Dubbio sul carico",
          testo:
            "Per qualsiasi dubbio il fornitore contatta il responsabile e insieme valutano se il prodotto si può caricare.",
          soggetti: ["fornitore", "responsabile"],
          funzione: "contatto",
          latoFornitore: true,
          attesaDopo: true,
        },
        {
          codice: "1e",
          titolo: "Messa in sicurezza dei contenitori",
          testo:
            "Controllo dell'avvenuta messa in sicurezza dei contenitori con cinghie, cime o altro.",
          soggetti: ["fornitore"],
          funzione: "controllo",
          latoFornitore: true,
        },
      ],
    },
    {
      codice: "procedure",
      titolo: "2. Procedure",
      voci: [
        {
          codice: "2a",
          titolo: "Tipo di contenitore",
          testo:
            "Indicare il tipo di contenitore usato: bins, big bag se già utilizzato, o altro.",
          soggetti: ["fornitore"],
          funzione: "dato",
          latoFornitore: true,
        },
        {
          codice: "2b",
          titolo: "Lavaggio contenitore",
          testo: "Registrare il lavaggio del contenitore.",
          soggetti: ["fornitore"],
          funzione: "controllo",
          latoFornitore: true,
        },
        {
          codice: "2c",
          titolo: "Area di raccolta",
          testo: "Indicare sul gestionale l'area di raccolta.",
          soggetti: ["fornitore"],
          funzione: "dato",
          latoFornitore: true,
        },
        {
          codice: "2d",
          titolo: "Contenitori pronti",
          testo: "Indicare sul gestionale il numero di contenitori pronti.",
          soggetti: ["fornitore"],
          funzione: "dato",
          latoFornitore: true,
        },
        {
          codice: "2e",
          titolo: "Lotto",
          testo: "Attribuzione del lotto sul gestionale.",
          soggetti: ["fornitore"],
          funzione: "lotto",
          latoFornitore: true,
        },
        {
          codice: "2f",
          titolo: "Controllo mezzo",
          testo:
            "Ripetere il controllo del mezzo come al punto 1a, con le foto dei punti sospetti.",
          soggetti: ["fornitore"],
          funzione: "foto",
          latoFornitore: true,
          riferimento: "1a",
        },
        {
          codice: "2g",
          titolo: "Carico merce",
          testo: "Carico della merce.",
          soggetti: ["fornitore", "trasportatore"],
          funzione: "controllo",
          latoFornitore: true,
        },
        {
          codice: "2h",
          titolo: "Controllo fissaggio",
          testo:
            "Controllo del fissaggio dei contenitori. Nella bozza il rinvio è scritto «punto 1.b»: la messa in sicurezza è l'obbligo 1e, mentre 1b è il salvataggio delle foto.",
          soggetti: ["fornitore"],
          funzione: "controllo",
          latoFornitore: true,
          riferimento: "1e",
          nota: "Da confermare se il rinvio deve restare 1b oppure 1e.",
        },
        {
          codice: "2i",
          titolo: "Contenitori caricati",
          testo: "Inserire nel gestionale il numero di contenitori caricati.",
          soggetti: ["fornitore"],
          funzione: "dato",
          latoFornitore: true,
        },
        {
          codice: "2l",
          titolo: "Pesata",
          testo: "Pesare il prodotto e caricare il peso nel gestionale.",
          soggetti: ["fornitore"],
          funzione: "dato",
          latoFornitore: true,
        },
        {
          codice: "2m",
          titolo: "DDT",
          testo: "Creare il DDT dal gestionale e prepararlo alla firma.",
          soggetti: ["fornitore"],
          funzione: "ddt",
          latoFornitore: true,
        },
        {
          codice: "n1",
          titolo: "Firma del fornitore",
          testo:
            "Il fornitore firma tramite OTP: un codice di conferma inviato per SMS.",
          soggetti: ["fornitore"],
          funzione: "otp",
          latoFornitore: true,
        },
        {
          codice: "n2",
          titolo: "Firma del trasportatore",
          testo:
            "Il fornitore inserisce nome, cognome e telefono del trasportatore. Il gestionale invia l'OTP per SMS. Il trasportatore comunica il codice al fornitore, che lo inserisce. Il documento risulta firmato da entrambi e si può scaricare.",
          soggetti: ["fornitore", "trasportatore"],
          funzione: "otp",
          latoFornitore: true,
        },
        {
          codice: "p",
          titolo: "Ora di partenza",
          testo: "Salvare l'ora di partenza.",
          soggetti: ["fornitore"],
          funzione: "orario",
          latoFornitore: true,
          attesaDopo: true,
        },
        {
          codice: "q",
          titolo: "Arrivo in sede",
          testo: "Arrivo in sede Agrinsicilia. Con questa voce il foglio si completa.",
          soggetti: ["agrinsicilia"],
          funzione: "arrivo",
          latoFornitore: false,
        },
      ],
    },
  ],
};

export const PROCESSI_CONTROLLO: readonly ProcessoControllo[] = [
  materialeInIngresso,
];

export function processoControlloBySlug(
  slug: string
): ProcessoControllo | null {
  return PROCESSI_CONTROLLO.find((processo) => processo.slug === slug) ?? null;
}

export function vociProcesso(
  processo: ProcessoControllo,
  soloFornitore = false
): VoceControllo[] {
  return processo.gruppi.flatMap((gruppo) =>
    soloFornitore ? gruppo.voci.filter((voce) => voce.latoFornitore) : gruppo.voci
  );
}
