import { makeArticle, type TutorialArticle, type TutorialBlock } from "@/lib/archivio/tutorial-types";

export const PLACEHOLDER_PATHS = new Set<string>([
  "/app/dashboard",
  "/app/amministrazione/fornitori/possibili",
  "/app/produzione/calendario/turnistica",
  "/app/produzione/calendario/area-di-taglio",
  "/app/produzione/calendario/essiccazioni",
  "/app/produzione/calendario/triturazioni",
  "/app/produzione/calendario/estrazione",
  "/app/action/aree/taglio",
  "/app/action/aree/triturazione",
  "/app/action/sensori",
  "/app/action/azioni",
  "/app/action/programmi",
  "/app/magazzino/materia-prima/nuovo-ingresso",
  "/app/magazzino/materia-prima/scartati-non-conformi",
  "/app/magazzino/prodotti-di-consumo/registra-nuovo",
  "/app/magazzino/prodotti-agrinsicilia/preleva-quantita",
  "/app/magazzino/prodotti-agrinsicilia/scartati-non-conformi",
  "/app/magazzino/note-di-acquisto/nuova",
  "/app/area-fiscale/ddt/nuovo",
  "/app/area-fiscale/ddt/emessi",
  "/app/area-fiscale/ddt/ricevuti",
  "/app/area-fiscale/dati-e-calcoli/utili",
  "/app/area-fiscale/dati-e-calcoli/analisi-costi",
  "/app/area-fiscale/banca/disponi-bonifico",
  "/app/area-fiscale/banca/pagamenti-dipendenti",
  "/app/area-fornitori/quaderno-di-campagna",
  "/app/area-fornitori/calendario-raccolto",
  "/app/acquisti",
]);

export const PAGE_EXTRAS: Record<string, TutorialBlock[]> = {
  "/app/amministrazione/clienti/elenco": [
    { type: "h", text: "Cosa fai qui" },
    {
      type: "p",
      text: "Elenco dei clienti attivi. Ogni cliente ha una targa C…, ragione sociale, contatti, commerciale di riferimento.",
    },
    { type: "h", text: "Passi" },
    {
      type: "ol",
      items: [
        "Cerca per nome, targa o partita IVA.",
        "Apri la scheda: anagrafica, contatti, timeline.",
        "Collega rubrica, ordini, mail.",
        "Se non serve più: soft delete (non sparisce, va in traccia).",
      ],
    },
  ],
  "/app/amministrazione/clienti/possibili": [
    { type: "h", text: "Cosa fai qui" },
    {
      type: "p",
      text: "Possibili clienti = lead e prospect, anche quelli arrivati dal sito Opuntia Italia. Non sono ancora clienti di vendita.",
    },
    {
      type: "ol",
      items: [
        "Registra o prendi in carico un contatto.",
        "Lavora la timeline (chiamate, mail).",
        "Diventa cliente solo con una fattura: l’operatore in carico completa la promozione e arriva la targa C….",
      ],
    },
  ],
  "/app/amministrazione/fornitori/bio": [
    {
      type: "p",
      text: "Solo fornitori con profilo bio / certificato. Servono per materia prima bio sul Foglio Ingresso MP: se spunti «bio» sul foglio, il fornitore deve avere il certificato caricato.",
    },
  ],
  "/app/amministrazione/fornitori/elenco": [
    {
      type: "p",
      text: "Fornitori senza profilo bio. Stessa scheda (targa F…, tipologie: materia prima, servizi, ecc.). In magazzino, nella composizione lotto, vedi solo chi ha tipologia Materia prima.",
    },
  ],
  "/app/amministrazione/rubrica": [
    {
      type: "p",
      text: "Rubrica unica di persone: dipendenti, referenti clienti/fornitori, autisti. Ha mansioni. Dal foglio ingresso scegli l’autista da qui (con scrematura). Dalla rubrica parti anche chat e mail.",
    },
  ],
  "/app/amministrazione/schede/materia-prima": [
    {
      type: "p",
      text: "Schede Mp…: il «tipo» di materia (cladodi, fico, ecc.), non il singolo arrivo. Il singolo arrivo è il Codice MP sul foglio ingresso. Qui sistemi nome, codice, barcode, bio.",
    },
  ],
  "/app/amministrazione/schede/prodotti-propri": [
    {
      type: "p",
      text: "Prodotti Agrinsicilia. Il codice della scheda (es. NDRi) è la targa prodotto nel lotto L-…. Senza questa scheda non puoi caricare quantità in magazzino su quel prodotto.",
    },
  ],
  "/app/amministrazione/schede/listini-b2b": [
    {
      type: "p",
      text: "Listini vendita. Ciclo: Bozza → Listino completo (in revisione) → un admin approva (operazione sensibile) → In uso. Quando ne entra uno nuovo, il vecchio diventa Obsoleto. Le condizioni possono avere targa sconto Sc00001.",
    },
  ],
  "/app/amministrazione/ordini/nuovo": [
    { type: "h", text: "Passi" },
    {
      type: "ol",
      items: [
        "Apri il wizard Nuovo ordine.",
        "Scegli il cliente (targa C…).",
        "Scegli se è merce o campionatura.",
        "Aggiungi righe (prezzi da listino se c’è).",
        "Salva: nasce Or-AA-TARGA/n e va verso «Da processare».",
      ],
    },
  ],
  "/app/amministrazione/ordini/da-processare": [
    {
      type: "p",
      text: "Pagina riservata ad Admin / Super Admin. Qui gli ordini appena nati e le campionature «inserite» aspettano di essere processati (controllo, lotti, preparazione). Poi possono andare in scaletta produzione.",
    },
    {
      type: "p",
      text: "Ciclo ordine in sintesi: Inserito → Processato → Pronto spedizione → Inviato → (storico in Archivio).",
    },
  ],
  "/app/amministrazione/ordini/elenco": [
    {
      type: "p",
      text: "Tutti gli ordini con filtri di stato. È la vista operativa quotidiana, non lo storico chiuso (quello sta in Archivio).",
    },
  ],
  "/app/amministrazione/ordini/preventivi": [
    {
      type: "p",
      text: "Preventivi Pv-…. Li crei, li invii, il cliente accetta o respinge. Da un accettato puoi arrivare all’ordine.",
    },
  ],
  "/app/amministrazione/organigramma/elenco-e-mansioni": [
    {
      type: "p",
      text: "Persone interne: mansioni, documenti, contratti, foto tessera e matricola (targa a 6 caratteri) per le timbrature Fluida. Da qui puoi creare il profilo per entrare nel gestionale.",
    },
  ],
  "/app/amministrazione/organigramma/presenze": [
    {
      type: "p",
      text: "Dashboard timbrature da Fluida (Zucchetti): chi è presente, ingressi/uscite e ore del giorno. Ogni operatore ha una matricola a 6 caratteri (targa) usata dal badge. Sincronizza per aggiornare; il cron aggiorna da solo ogni 15 minuti.",
    },
  ],
  "/app/produzione/foglio-ingresso-mp/nuovo": [
    {
      type: "p",
      text: "Il cuore dell’ingresso merce. Compila fornitore (anche rapido), materiale, quantità, confezioni (la riga è 75% select e 25% numero), DDT, foto destro e sinistro del carico, mezzo e autista.",
    },
    {
      type: "ul",
      items: [
        "Salva Parziale: resta negli Aperti (bozza).",
        "Genera codice lotto: nasce il Codice MP e lo stato diventa Registrato. Puoi stampare l’etichetta A4 orizzontale.",
        "Dichiara completato: se manca il lotto lo genera, poi chiude. Va in Storico/Archivio.",
      ],
    },
    {
      type: "note",
      text: "C’è un interruttore «Modalità test» solo di questa pagina: prova locale, niente scritture vere. Non è il profilo Test del Super Admin.",
    },
  ],
  "/app/produzione/foglio-ingresso-mp/aperti": [
    {
      type: "p",
      text: "Bozze e fogli registrati non ancora chiusi. Apri, completa, genera lotto, chiudi. I fogli di inventario non stanno qui: nascono già chiusi.",
    },
  ],
  "/app/produzione/fogli-lavorazione/nuovo": [
    {
      type: "p",
      text: "Crea il foglio del giorno (FL-anno-numero), collega processi e attività, poi lavoralo in «Foglio in esecuzione». Durata prevista circa 24 ore dalla data inizio.",
    },
  ],
  "/app/produzione/fogli-lavorazione/in-esecuzione": [
    {
      type: "p",
      text: "Fogli aperti in corso. Qui segni avanzamenti, eventi linea, tempi. Quando hai finito, chiudi il foglio: finisce in Archivio storico fogli.",
    },
  ],
  "/app/produzione/ordini/scaletta": [
    {
      type: "p",
      text: "Ordini già processati in amministrazione, da mettere in coda di produzione e collegare ai fogli di lavorazione. È il ponte vendite → reparto.",
    },
  ],
  "/app/produzione/processi-e-attivita/elenco-processi": [
    {
      type: "p",
      text: "Catalogo processi (spesso PX-…). Hanno versione e stato documento (bozza / approvato / chiuso). Se un processo non si usa più non si cancella: si depreca e va nello Storico in Archivio.",
    },
  ],
  "/app/produzione/processi-e-attivita/elenco-attivita": [
    {
      type: "p",
      text: "Attività di processo (spesso AP-…). Stessa logica ISO: versione, stato, deprecazione con traccia. Si riusano sui fogli.",
    },
  ],
  "/app/produzione/gestione-aree/elenco": [
    {
      type: "p",
      text: "Catalogo aree (lavaggio, taglio, essiccatori…). Aggiungere un’area aggiorna il menu Produzione. Ogni area ha poi macchinari, postazioni, eventi linea e telecamere.",
    },
  ],
  "/app/action/aree/essiccatori": [
    {
      type: "p",
      text: "Comandi IoT sugli essiccatori (accendi/spegni, stato). Lo spostamento sulla mappa lo fa solo il Super Admin non impersonato. Il resto delle voci Action è ancora in costruzione.",
    },
  ],
  "/app/magazzino/mappa": [
    {
      type: "p",
      text: "Elenco delle piante già collegate (Nome magazzino [Vista]). Il disegno si fa in Strumenti → Editor di aree: le bozze salvate non si cancellano; «Collega ad area» le pubblica qui.",
    },
  ],
  "/app/strumenti/editor-aree": [
    {
      type: "p",
      text: "Editor di aree. Ogni salvataggio è una bozza e resta in elenco. Quando è pronta, collegala a Magazzino → Mappa Magazzino → Nome [Vista]. Rettangolo: primo click partenza, secondo click senso, poi le misure. Righelli e palette colori aiutano il tracciato.",
    },
  ],
  "/app/magazzino/panoramica": [
    {
      type: "p",
      text: "Quadro giacenze (materia prima, consumo, Agrinsicilia) e telecamere. Da qui capisci se sei sotto soglia, non registri i lotti.",
    },
  ],
  "/app/magazzino/materia-prima/stato": [
    {
      type: "p",
      text: "Giacenze di materia prima presenti in azienda. L’ingresso «ufficiale» con lotto si fa dal Foglio Ingresso MP in Produzione (la voce «Nuovo ingresso» di magazzino è ancora un segnaposto).",
    },
  ],
  "/app/magazzino/prodotti-di-consumo/inserisci": [
    {
      type: "p",
      text: "Carico prodotti di consumo con scan/barcode. Crea un movimento e aggiorna la giacenza. Non usa il lotto L- dei prodotti Agrinsicilia.",
    },
  ],
  "/app/magazzino/prodotti-di-consumo/preleva": [
    {
      type: "p",
      text: "Scarico prodotti di consumo (scan). Stesso motore del carico, direzione opposta.",
    },
  ],
  "/app/magazzino/prodotti-agrinsicilia/inserisci-quantita": [
    {
      type: "p",
      text: "Qui nasce il lotto L-… e, se serve, il foglio Codice MP di inventario. Scegli prodotto, quantità e unità, componi il lotto (data, targa fornitore solo MP, Codice MP, progressivo), decidi se collegare un foglio di lavorazione aperto oppure motiva il bypass, poi Registra carico.",
    },
    {
      type: "p",
      text: "Dopo il salvataggio vedi giacenza aggiornata, eventuale codice FIMP-… e l’elenco ultimi movimenti con colonna Foglio MP.",
    },
  ],
  "/app/magazzino/prodotti-agrinsicilia/elenco-e-quantita": [
    {
      type: "p",
      text: "Elenco prodotti propri con quantità. Per entrare merce usa Inserisci quantità (lotti). Questa pagina è la scheda/giacenza, non il compositore lotto.",
    },
  ],
  "/app/magazzino/note-di-acquisto/aperte": [
    {
      type: "p",
      text: "Note d’acquisto ancora aperte (da chiudere dopo il controllo merce/fattura). Lo storico chiuso sta in Archivio. «Nuova nota» dal menu è ancora in costruzione.",
    },
  ],
  "/app/chat/argomenti/nuovo": [
    {
      type: "p",
      text: "Crea un argomento di lavoro (titolo, persone). Poi si discute nel thread. Quando è finito si archivia: lo trovi in Archivio → Chat → Per argomento.",
    },
  ],
  "/app/chat/dirette/nuova": [
    {
      type: "p",
      text: "Chat 1 a 1 partendo dalla rubrica. Se la elimini «per davvero», resta in Archivio → Fra utenti → Eliminate (traccia, non cestino definitivo).",
    },
  ],
  "/app/webmail/caselle": [
    {
      type: "p",
      text: "Caselle aziendali. Ogni casella ha In arrivo, categorie, bozze (anche AI da approvare), spam, cestino. Le mail «Archiviate» non sono il cestino: stanno in Archivio → WebMail.",
    },
    {
      type: "p",
      text: "Puoi collegare una mail a un’azienda della rubrica. Il Super Admin gestisce caselle e blacklist da Impostazioni WebMail.",
    },
  ],
  "/app/promemorie-e-note/promemoria/elenco": [
    {
      type: "p",
      text: "Promemoria semplici («chiamare X»). Stesso schema per Attività (@persone, luogo, orario) e Note (post-it collegabili alle anagrafiche). Ogni tipo ha Nuovo / Elenco / Calendario.",
    },
  ],
  "/app/area-fiscale/fatture/nuova": [
    {
      type: "p",
      text: "Emissione fattura interna, allineata a Fatture in Cloud. Numero tipo Ft-AA-TARGA/n (a video spesso senza Ft-). Stati documento: bozza / registrato / approvato / chiuso. Gli scostamenti di totale restano in audit.",
    },
  ],
  "/app/area-fiscale/commercialista": [
    {
      type: "p",
      text: "Lavoro del commercialista sulle fatture cartacee/elaborazioni, con traccia e operazioni protette (OTP). Non mescolare con «Da processare» degli ordini.",
    },
  ],
  "/app/area-fiscale/contratti/elenco": [
    {
      type: "p",
      text: "Contratti fiscali: bozza → attivo → scaduto → archiviato. Gli archiviati si aprono da Archivio → Area Fiscale → Contratti.",
    },
  ],
  "/app/area-fiscale/banca/movimenti": [
    {
      type: "p",
      text: "Import movimenti banca (PDF/CSV), abbinamento a fatture interne e dilazioni. «Disponi bonifico» e «Pagamenti dipendenti» sono ancora segnaposto.",
    },
  ],
  "/app/ricerca-sviluppo/ricerche-processi/elenco": [
    {
      type: "p",
      text: "Ricerche scientifiche sui processi. Timeline di report. Stati: bozza → in corso → approvato → archiviato. L’area ha un lucchetto: la sblocca il Super Admin sul profilo. L’archivio unificato sta in Archivio → Ricerca e sviluppo.",
    },
  ],
  "/app/wikiopuntia/biblioteca/elenco": [
    {
      type: "p",
      text: "Biblioteca paper: bozza / pubblicato / archiviato, con versione. La Knowledge Base AI ingerisce i testi. Le richieste PDF e i contatti dal sito wiki stanno nelle voci accanto, sotto il hub Web.",
    },
  ],
  "/app/amministrazione/portale/richieste-contatto": [
    {
      type: "p",
      text: "Lead dal form di opuntiaitalia.com. Stati: nuova → presa in carico → chiusa. Possono diventare Possibili clienti.",
    },
  ],
  "/app/impostazioni": [
    {
      type: "p",
      text: "Solo admin: attiva il 2FA (TOTP) e il profilo fiscale aziendale (dati per fatture e dashboard). Non è il posto dei lotti.",
    },
  ],
  "/app/archivio/amministrazione/ordini/storico": [
    {
      type: "p",
      text: "Ordini conclusi. Non si cancellano: restano qui per audit e consulto.",
    },
  ],
  "/app/archivio/amministrazione/registro-accessi": [
    {
      type: "p",
      text: "Chi è entrato nel gestionale e quando (timeline o elenco). Utile per qualità e sicurezza, non per i lotti merce.",
    },
  ],
  "/app/archivio/produzione/foglio-ingresso-mp/storico": [
    {
      type: "p",
      text: "Tutti i fogli ingresso chiusi: sia arrivi produttore sia fogli «Codice MP Lavorata» nati da carico/settaggio magazzino. Il badge Origine ti dice quale dei due è.",
    },
  ],
  "/app/produzione/foglio-ingresso-mp/storico": [
    {
      type: "p",
      text: "Questa voce del menu Produzione apre lo stesso elenco in Archivio: fogli chiusi, arrivi e inventari. Non è un secondo archivio.",
    },
  ],
};

export const TUTORIAL_EXTRA_ARTICLES: TutorialArticle[] = [
  makeArticle({
    id: "qualita-iso",
    sectionId: "qualita",
    sectionTitle: "Qualità, ruoli e prove",
    title: "Qualità ISO 9001 in pratica",
    summary:
      "Cosa significa «non si cancella», audit, stati documento, firme.",
    tags: ["ISO", "9001", "audit", "soft delete", "versione", "approvazione"],
    blocks: [
      {
        type: "p",
        text: "Il gestionale è costruito come un sistema qualità, non come un blocco note. Tradotto in gesti quotidiani:",
      },
      {
        type: "ul",
        items: [
          "Non cancelli un ordine, un lotto, un foglio: lo chiudi o lo metti da parte (soft delete). Resta la data e chi l’ha fatto.",
          "Le cose importanti (carico, chiusura foglio, fattura, cambio stato ordine) lasciano una riga di registro (audit): chi, quando, cosa.",
          "I documenti hanno stato (Bozza / Registrato o Approvato / Chiuso) e spesso una versione.",
          "Dove serve una firma, il sistema ricorda chi ha confermato (e a volte chiede un codice OTP).",
          "Gli scarti e le anomalie hanno (o avranno) un posto dedicato: non si «aggiustano» togliendo il dato.",
        ],
      },
    ],
  }),
  makeArticle({
    id: "qualita-ruoli",
    sectionId: "qualita",
    sectionTitle: "Qualità, ruoli e prove",
    title: "Ruoli, lucchetti e Super Admin",
    summary:
      "Chi vede cosa: aree, pagine On/Off, Area Fiscale e R&S, impersonation.",
    tags: ["RBAC", "superadmin", "impersonation", "lucchetto", "test"],
    blocks: [
      {
        type: "p",
        text: "Ogni persona ha un profilo, delle aree (Amministrazione, Magazzino, …) e, se serve, delle pagine accese o spente. «Da processare» lo vedono solo Admin e Super Admin.",
      },
      {
        type: "ul",
        items: [
          "Super Admin: vede tutto, se non sta «indossando» un altro profilo.",
          "Impersonation: il Super Admin prova il gestionale come un collega. Ogni ingresso/uscita è registrato. I profili protetti non si impersonano.",
          "Profilo Test: esiste per le prove. Si entra solo tramite lo switch, non come login normale.",
          "Area Fiscale e Ricerca e sviluppo hanno un lucchetto extra sul profilo.",
          "In Impostazioni (admin) si attiva il 2FA.",
        ],
      },
      {
        type: "note",
        text: "Se una pagina «non c’è», prima chiediti: è un permesso? è un lucchetto? è ancora in costruzione? Questo Tutorial lo dice nella scheda della pagina.",
      },
    ],
  }),
  makeArticle({
    id: "webmail-cartelle",
    sectionId: "webmail",
    sectionTitle: "WebMail",
    title: "Cartelle di una casella (In arrivo, inviati, bozze, spam, cestino)",
    summary:
      "Ogni casella ha le stesse cartelle. Archiviate non è il cestino.",
    path: "/app/webmail/caselle",
    tags: ["inbox", "inviati", "bozze", "spam", "cestino", "archiviate", "AI"],
    blocks: [
      {
        type: "table",
        headers: ["Cartella", "A cosa serve"],
        rows: [
          ["In arrivo", "Posta nuova da leggere e classificare"],
          ["Inviati", "Mail uscite (IMAP Inviate e invio dal gestionale); vanno in timeline"],
          ["Categorie", "Sotto-cartelle che create voi"],
          ["Bozze", "Mail non spedite, anche bozze scritte con AI da approvare"],
          ["Spam", "Mail indesiderate"],
          ["Cestino", "Cancellate di recente"],
          ["Archiviate", "Conservate in Archivio → WebMail, non buttate"],
          ["Nuova mail", "Composizione e invio"],
        ],
      },
      {
        type: "p",
        text: "Puoi collegare una mail a un’azienda. Il Super Admin gestisce caselle, permessi e blacklist da Impostazioni WebMail (non è nel menu normale).",
      },
    ],
  }),
  makeArticle({
    id: "nascoste-hub",
    sectionId: "nascoste",
    sectionTitle: "Aree nascoste o in arrivo",
    title: "Aree nascoste dal menu e pagine in arrivo",
    summary:
      "Commerciale, Acquisti, HR, Dashboard, calendari, DDT fiscali, scarti.",
    tags: ["placeholder", "commerciale", "acquisti", "hr", "dashboard"],
    blocks: [
      {
        type: "p",
        text: "Alcune aree esistono nei permessi ma non nel menu laterale: Commerciale (oggi soprattutto redirect verso WebMail e un pezzo ordini), Acquisti, HR (l’organigramma vero è in Amministrazione), WikiOpuntia (la trovi sotto Web).",
      },
      {
        type: "p",
        text: "Pagine già in menu ma ancora da costruire: Dashboard, Possibili fornitori, calendari produzione, gran parte di Action oltre essiccatori, nuovo ingresso MP lato magazzino, scarti, prelievo Agrinsicilia, nuova nota d’acquisto, DDT fiscali, bonifici, pagamenti dipendenti, Gestionale Fornitori.",
      },
      {
        type: "p",
        text: "Percorsi «di servizio» non in menu: generatore barcode /app/magazzino/barcode/…, dettaglio fattura, impostazioni WebMail per Super Admin.",
      },
    ],
  }),
];
