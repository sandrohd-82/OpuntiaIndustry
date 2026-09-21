import { makeArticle, type TutorialArticle } from "@/lib/archivio/tutorial-types";

export const TUTORIAL_CORE_ARTICLES: TutorialArticle[] = [
  makeArticle({
    id: "come-usare",
    sectionId: "guida",
    sectionTitle: "Guida",
    title: "Come usare questo Tutorial",
    summary:
      "Indice interno stile documentazione: cerca, apri una scheda, vai alla pagina reale.",
    tags: ["tutorial", "ricerca", "indice", "guida"],
    blocks: [
      {
        type: "p",
        text: "Questa pagina è il manuale del gestionale. L’elenco delle spiegazioni sta qui dentro, non nel menu laterale di Archivio. Nel menu trovi solo la voce Tutorial: una volta aperta, a sinistra hai l’indice e a destra la scheda.",
      },
      {
        type: "h",
        text: "Ricerca",
      },
      {
        type: "p",
        text: "Scrivi nel campo in alto a sinistra. Cerca come parli: «lotto», «FIMP», «inventario», «fattura», «da processare». La ricerca guarda titolo, percorso, tag e tutto il testo della scheda.",
      },
      {
        type: "ul",
        items: [
          "Puoi scrivere più parole: devono esserci tutte (es. lotto magazzino).",
          "Non servono maiuscole né accenti.",
          "Ogni scheda ha un indirizzo con ?p=…: lo puoi copiare e mandare a un collega.",
        ],
      },
      {
        type: "h",
        text: "Come è scritto",
      },
      {
        type: "p",
        text: "Ogni scheda dice: a cosa serve, dove si trova, cosa cliccare, che numeri usa, e se la pagina è già pronta oppure ancora in costruzione.",
      },
      {
        type: "note",
        text: "Le pagine «in costruzione» restano nel menu perché il posto è già deciso. Qui lo diciamo chiaro, così non pensi che sia un errore tuo.",
      },
    ],
  }),
  makeArticle({
    id: "mappa-gestionale",
    sectionId: "guida",
    sectionTitle: "Guida",
    title: "Mappa semplice del gestionale",
    summary:
      "Le aree del menu, cosa fa ciascuna e come si collegano tra loro.",
    tags: ["aree", "menu", "mappa", "sidebar"],
    blocks: [
      {
        type: "p",
        text: "Il menu a sinistra è diviso in aree. Ogni persona vede solo le aree che le sono state assegnate. Il Super Admin le vede tutte (se non sta provando un altro profilo).",
      },
      {
        type: "table",
        headers: ["Area", "In due parole"],
        rows: [
          ["Dashboard", "Pagina di ingresso (ancora in costruzione)"],
          ["Amministrazione", "Clienti, fornitori, cataloghi, ordini, organigramma"],
          ["Ricerca e sviluppo", "Ricerche su processi e materie prime (lucchetto)"],
          ["Web", "Sito Opuntia Italia e WikiOpuntia (non è un’area a parte nel RBAC)"],
          ["Produzione", "Ingresso MP, fogli di lavorazione, macchine, IoT"],
          ["Action", "Comandi IoT (oggi soprattutto essiccatori)"],
          ["Chat", "Argomenti di lavoro e chat tra persone"],
          ["WebMail", "Caselle email aziendali"],
          ["Magazzino", "Giacenze, carichi, scan, note d’acquisto"],
          ["Promemorie e note", "Promemoria, attività, post-it"],
          ["Area Fiscale", "Fatture, banca, commercialista (lucchetto)"],
          ["Gestionale Fornitori", "Portale collaborativo (in costruzione)"],
          ["Impostazioni", "2FA e profilo fiscale (solo admin)"],
          ["Archivio", "Storici chiusi + questo Tutorial"],
        ],
      },
      {
        type: "h",
        text: "Il viaggio di un prodotto",
      },
      {
        type: "ol",
        items: [
          "Il produttore arriva → Foglio Ingresso MP (Produzione) → nasce il Codice MP.",
          "Si lavora → Foglio di lavorazione (Produzione).",
          "Si mette a stock → Magazzino, lotto L-… collegato al Codice MP.",
          "Si vende → Ordine in Commerciale → Da processare / In Scaletta in Produzione → fattura in Area Fiscale.",
          "Quando è chiuso → Archivio (niente si butta via).",
        ],
      },
    ],
  }),
  makeArticle({
    id: "lotti-dove-siamo",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Dove siamo arrivati con i lotti (stato attuale)",
    summary:
      "Fotografia di settembre 2026: quali numeri esistono, quali sono collegati, cosa manca ancora.",
    tags: [
      "lotto",
      "stato",
      "inventario",
      "FIMP",
      "codice MP",
      "L-",
      "FL-",
    ],
    blocks: [
      {
        type: "p",
        text: "Oggi i lotti «veri» di tracciabilità materia prima e prodotto finito sono tre pezzi che si tengono per mano. Il resto del gestionale ha altri numeri (ordini, fatture, targhe) che non sono lotti di magazzino.",
      },
      {
        type: "h",
        text: "Quello che è già vivo",
      },
      {
        type: "table",
        headers: ["Numero", "Esempio", "Stato"],
        rows: [
          [
            "Codice MP lavorata",
            "14092600001",
            "Si genera sul Foglio Ingresso MP. Univoco. Anche da magazzino se fai inventario.",
          ],
          [
            "Foglio ingresso FIMP-",
            "FIMP-140926-1A2B3",
            "È il documento. Ogni Codice MP ha un foglio in Storico/Archivio.",
          ],
          [
            "Lotto prodotto L-",
            "L-14.09.26/NDRi/031/14092600001-001",
            "Si compone in Inserisci quantità. Al Registra carico, se il MP non ha foglio, il foglio nasce da solo.",
          ],
          [
            "Foglio lavorazione FL-",
            "FL-2026-001",
            "Foglio giornaliero di produzione. Si può collegare al carico, non è obbligatorio.",
          ],
          [
            "Lotto in uscita (esterno)",
            "1426000001",
            "10 caratteri: settimana ISO + anno + 6 hex. Nasce col foglio di lavorazione. È il lotto di vendita (fatture, DDT, QR pubblico).",
          ],
          [
            "Targhe C / F",
            "C003 · F031",
            "Anagrafiche. Nel lotto L- la F si toglie: F031 diventa 031.",
          ],
          [
            "Documenti Or / Ft / Nc / Pv / Cp",
            "Or-26-C003/391",
            "Numerazione commerciale, non di magazzino.",
          ],
        ],
      },
      {
        type: "h",
        text: "Due origini del Codice MP (importante)",
      },
      {
        type: "ol",
        items: [
          "Ingresso produttore: compili il foglio, poi «Genera codice lotto». Origine = ingresso produttore. Fornitore e tipo materiale sono obbligatori.",
          "Inventario / settaggio magazzino: in Inserisci quantità premi «Genera codice MP inventario», componi il lotto L- e «Registra carico». Il gestionale crea un foglio chiuso in archivio, così quel codice non resta «a mezz’aria».",
        ],
      },
      {
        type: "note",
        text: "Il pulsante «Genera codice MP inventario» da solo non scrive il foglio. Il foglio nasce quando clicchi Registra carico. Così ogni riferimento è collegato al movimento vero.",
      },
      {
        type: "h",
        text: "Cosa non è ancora un lotto automatico",
      },
      {
        type: "ul",
        items: [
          "Preleva quantità Agrinsicilia: pagina ancora in costruzione.",
          "Scarti / non conformità di magazzino: menu presente, pagina in costruzione.",
          "DDT fiscale (Area Fiscale): menu presente, pagina in costruzione. Il DDT del produttore sul foglio ingresso invece c’è già (è un testo + foto, non un numero di lotto).",
          "Sulle righe ordine/campionatura il campo lotto è un testo: di solito ci incolli il L-…, non si genera da solo.",
          "Lotti inclusivi automatici dagli ordini (un lotto per ordine o per confezione): la regola è già pronta, la generazione da ordine arriva dopo. Oggi si prova da Strumenti → Generatore di Lotti.",
          "In Magazzino → Inserisci quantità puoi associare un lotto in uscita: lo stampi subito, ma si salva solo con Registra carico.",
        ],
      },
      {
        type: "h",
        text: "Come leggere un lotto in 10 secondi",
      },
      {
        type: "p",
        text: "Se vedi 10 caratteri tipo 1426000001 è il lotto in uscita (esterno: settimana ISO + anno + progressivo hex) — è quello di vendita, fatture e DDT. Se vedi 11 caratteri tipo 14092600001 è il Codice MP (data arrivo + contatore del giorno). Se vedi L-14.09.26/… è il lotto interno di lavorazione. Se vedi FIMP-… è il foglio ingresso. Se vedi FL-2026-… è il foglio di lavorazione. Se vedi Or- o Ft- è vendita/fattura, non stock.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-catena",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "La catena: dall’ingresso al prodotto in magazzino",
    summary:
      "Come i tre numeri (MP, FIMP, L-) si collegano, passo passo, senza gergo.",
    path: "/app/produzione/foglio-ingresso-mp/nuovo",
    tags: ["tracciabilità", "catena", "ISO", "ingresso", "carico"],
    blocks: [
      {
        type: "p",
        text: "Pensa a tre etichette sulla stessa merce, non a tre merci diverse.",
      },
      {
        type: "ol",
        items: [
          "Arriva il camion. Compili il Foglio Ingresso MP. Nasce il documento FIMP-… (ancora senza lotto se è solo bozza).",
          "Quando la merce è accettata, generi il Codice MP (es. 14092600001). Il foglio passa a Registrato. Quello è il lotto interno della materia prima.",
          "Chiudi il foglio. Finisce in Storico e in Archivio. Non si cancella.",
          "In produzione lavori quella MP su un Foglio di lavorazione FL-anno-numero.",
          "Quando il prodotto finito entra in magazzino, componi il lotto L-data/targaProdotto/targaFornitore/CodiceMP-progressivo.",
          "Registra carico. Il movimento tiene il L-… e, se serve, crea o collega il foglio FIMP del Codice MP.",
        ],
      },
      {
        type: "code",
        caption: "Esempio dello stesso arrivo",
        text: "Foglio documento     FIMP-140926-7B2C1\nCodice MP lavorata   14092600001\nFoglio lavorazione   FL-2026-003\nLotto prodotto       L-14.09.26/NDRi/031/14092600001-001",
      },
      {
        type: "warn",
        text: "Nel programma, dentro il lotto L-, un pezzo si chiama «ddt» per motivi storici. Non è il DDT cartaceo del fornitore. È il Codice MP. Il DDT vero sta nel campo «DDT produttore» del foglio ingresso.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-codice-mp",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Codice MP lavorata (11 caratteri)",
    summary:
      "Formato GGMMAA + 5 esadecimali. Si genera sul foglio ingresso o, per inventario, da magazzino.",
    path: "/app/produzione/foglio-ingresso-mp/nuovo",
    tags: [
      "codice MP",
      "GGMMAA",
      "hex",
      "lotto ingresso",
      "14092600001",
    ],
    blocks: [
      {
        type: "p",
        text: "È il lotto interno della materia prima. Sempre 11 caratteri, senza trattini e senza spazi.",
      },
      {
        type: "code",
        caption: "Come si legge 14092600001",
        text: "14  09  26  00001\n│   │   │   └── contatore del giorno (esadecimale, 00001 = primo)\n│   │   └────── anno 2026\n│   └────────── settembre\n└────────────── giorno 14",
      },
      {
        type: "h",
        text: "Regole",
      },
      {
        type: "ul",
        items: [
          "La data è quella di arrivo (campo «arrivato il»), non la data di oggi se stai registrando in ritardo.",
          "Il contatore riparte ogni giorno. È in esadecimale: dopo 00009 viene 0000A, non 00010.",
          "Due fogli non possono avere lo stesso Codice MP.",
          "Finché il foglio è bozza, il codice può ancora non esserci. Appare quando generi il lotto: lo stato diventa Registrato.",
        ],
      },
      {
        type: "h",
        text: "Dove lo usi",
      },
      {
        type: "ul",
        items: [
          "Produzione → Foglio Ingresso MP → pulsante genera lotto / etichetta / stampa A4 orizzontale.",
          "Magazzino → Inserisci quantità → composizione lotto: è il pezzo dopo la targa fornitore.",
          "Puoi sceglierlo da un elenco dei fogli già registrati o chiusi, oppure generarne uno di inventario.",
        ],
      },
      {
        type: "note",
        text: "I codici generati da inventario usano di proposito una zona alta del contatore (da A0000 in su), così non si pestano i piedi con i primi arrivi del giorno (00001, 00002…).",
      },
    ],
  }),
  makeArticle({
    id: "lotti-fimp",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Foglio documento FIMP-",
    summary:
      "Il «foglio carta» digitale. Non è il Codice MP: è il contenitore con audit, stato e allegati.",
    path: "/app/produzione/foglio-ingresso-mp/aperti",
    tags: ["FIMP", "foglio ingresso", "documento", "versione"],
    blocks: [
      {
        type: "p",
        text: "Ogni ingresso (o ogni inventario) ha un foglio. Il codice del foglio è tipo FIMP-140926-1A2B3. Serve a dire «questo è il documento n. …», come un protocollo.",
      },
      {
        type: "ul",
        items: [
          "Si crea al primo salvataggio del foglio (o al Registra carico se è inventario).",
          "La coda dopo la data è casuale: non è lo stesso numero del Codice MP.",
          "Ha una versione (v1, v2…) ogni volta che lo rivedi.",
          "Stati: Bozza → Registrato (c’è il Codice MP) → Chiuso (va in Storico/Archivio).",
        ],
      },
      {
        type: "h",
        text: "Cosa contiene",
      },
      {
        type: "ul",
        items: [
          "Fornitore, tipo materiale, bio, quantità, confezionamento.",
          "Alla generazione del lotto: una lettera di gruppo (A–Z, poi riparte) sul timbro e un foglio PDF per ogni contenitore, con id esadecimale unico a vita in basso a sinistra (1, 2, … 9, A, B, … F, 10, A1). Il QR è del contenitore, non del solo lotto: lo stesso pezzo non si registra due volte in carico/scarico.",
          "DDT produttore (testo + data + file) e foto lato destro/sinistro del carico.",
          "Mezzo, autista, operatore muletto.",
          "Note, lotto L- se è nato da magazzino, prodotto caricato.",
        ],
      },
      {
        type: "p",
        text: "Un foglio chiuso non si modifica. Si apre in lettura da Storico o da Archivio → Produzione → Foglio Ingresso MP.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-inventario",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Codice MP di inventario / settaggio merce",
    summary:
      "Quando non c’è un arrivo produttore, il carico magazzino crea comunque un foglio in archivio.",
    path: "/app/magazzino/prodotti-agrinsicilia/inserisci-quantita",
    tags: [
      "inventario",
      "settaggio",
      "INV",
      "genera codice MP",
      "registra carico",
    ],
    blocks: [
      {
        type: "p",
        text: "Serve quando la merce è già in azienda (conteggio, correzione, settaggio) e non hai un foglio di ingresso «vero». Senza questa regola resterebbe un Codice MP orfano: in futuro non sapresti da dove arriva.",
      },
      {
        type: "h",
        text: "Cosa fare",
      },
      {
        type: "ol",
        items: [
          "Apri Magazzino → Prodotti Agrinsicilia → Inserisci quantità.",
          "Scegli prodotto e quantità.",
          "Apri la composizione lotto.",
          "Se non c’è un Codice MP di un arrivo, premi Genera codice MP inventario (targa fornitore di default INV se vuota).",
          "Conferma il lotto L-… e clicca Registra carico.",
        ],
      },
      {
        type: "h",
        text: "Cosa succede al Registra carico",
      },
      {
        type: "ul",
        items: [
          "Se quel Codice MP non esiste già come foglio: nasce un foglio chiuso, origine «Inventario / settaggio magazzino», DDT scritto INVENTARIO / SETTAGGIO MAGAZZINO, note con prodotto, quantità, lotto L- e motivo.",
          "Se il Codice MP è di un ingresso vero: non si duplica. Si collega solo il movimento al foglio già esistente.",
          "Il movimento mostra la colonna Foglio MP (codice FIMP-… + Codice MP).",
        ],
      },
      {
        type: "note",
        text: "Motivazione senza foglio di lavorazione (Inventario o Rivisita di ordine) è un’altra cosa: spiega perché non colleghi il FL-…. Il foglio Codice MP si crea lo stesso.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-agrinsicilia",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Lotto prodotto Agrinsicilia (L-)",
    summary:
      "Lotto del prodotto finito in magazzino: data, targa prodotto, targa fornitore, Codice MP, progressivo.",
    path: "/app/magazzino/prodotti-agrinsicilia/inserisci-quantita",
    tags: [
      "L-",
      "agrinsicilia",
      "progressivo",
      "targa",
      "lotto lavorazione",
    ],
    blocks: [
      {
        type: "code",
        caption: "Maschera",
        text: "L-GG.MM.AA / targaProdotto / targaFornitore / CodiceMP - progressivo\nL-14.09.26 / NDRi / 031 / 14092600001 - 001",
      },
      {
        type: "table",
        headers: ["Pezzo", "Significato", "Da dove esce"],
        rows: [
          [
            "14.09.26",
            "Giorno in cui inizia la lavorazione",
            "Lo scegli tu nella composizione lotto",
          ],
          [
            "NDRi",
            "Targa del prodotto Agrinsicilia",
            "Scheda prodotto (Amministrazione → Schede → Prodotti Agrinsicilia). Deve coincidere col prodotto che stai caricando.",
          ],
          [
            "031",
            "Targa fornitore senza la F",
            "F031 in anagrafica → 031. Per inventario spesso INV.",
          ],
          [
            "14092600001",
            "Codice MP lavorata",
            "Dal foglio ingresso o generato per inventario",
          ],
          [
            "001",
            "Progressivo dell’anno per quella targa prodotto",
            "Il gestionale propone il prossimo (002, 003…). Non è un progressivo globale di tutta l’azienda.",
          ],
        ],
      },
      {
        type: "h",
        text: "Cose da non sbagliare",
      },
      {
        type: "ul",
        items: [
          "La targa fornitore in elenco è solo tra i fornitori di Materia prima.",
          "Il Codice MP deve avere il formato da 11 caratteri. Il programma lo controlla.",
          "Il lotto L- non ha un «lucchetto» unico sul database: la regola è in app. Non inventare a mano formati diversi.",
          "Sulle righe ordine puoi scrivere lo stesso L-… nel campo lotto, a mano.",
        ],
      },
    ],
  }),
  makeArticle({
    id: "lotti-foglio-lavorazione",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Foglio di lavorazione FL-",
    summary:
      "Documento di produzione del giorno. Non sostituisce il lotto L- né il Codice MP.",
    path: "/app/produzione/fogli-lavorazione/nuovo",
    tags: ["FL-", "foglio lavorazione", "aperto", "chiuso"],
    blocks: [
      {
        type: "p",
        text: "È il foglio su cui gira la giornata di produzione: processi, attività, tempi. Codice tipo FL-2026-001 (anno + numero progressivo di quell’anno).",
      },
      {
        type: "ul",
        items: [
          "Stati del foglio: aperto / chiuso.",
          "Si crea da Produzione → Fogli di lavorazione → Nuovo.",
          "Si lavora in «Foglio in esecuzione».",
          "Quando carichi in magazzino puoi collegarlo (se è aperto) oppure fare bypass con motivazione Inventario / Rivisita di ordine.",
        ],
      },
      {
        type: "note",
        text: "Sul foglio c’è anche un campo lotto_label: può contenere il L-… per ricordare quale lotto prodotto stai facendo. Non è automatico come il Codice MP sul foglio ingresso.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-ddt",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "DDT del produttore (non è un lotto)",
    summary:
      "Numero del documento di trasporto del fornitore. Testo libero, con data e file.",
    path: "/app/produzione/foglio-ingresso-mp/nuovo",
    tags: ["DDT", "produttore", "documento trasporto"],
    blocks: [
      {
        type: "p",
        text: "Sul Foglio Ingresso MP c’è il campo DDT produttore. È quello stampato sul documento del camion: 4521/2026, 12345, o come lo scrive il fornitore. Non entra nel lotto L-.",
      },
      {
        type: "ul",
        items: [
          "Puoi mettere anche la data del documento.",
          "Puoi allegare il PDF o la foto.",
          "Per i fogli di inventario il campo viene riempito in automatico con INVENTARIO / SETTAGGIO MAGAZZINO.",
        ],
      },
      {
        type: "warn",
        text: "In Area Fiscale esiste il menu DDT (emessi/ricevuti): quelle pagine sono ancora in costruzione. Non confonderle con il DDT sul foglio ingresso.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-targhe",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Targhe: clienti, fornitori, sconti, prodotti",
    summary:
      "Le «targhe» sono i codici corti delle anagrafiche e dei cataloghi. Non sono lotti.",
    path: "/app/amministrazione/clienti/elenco",
    tags: ["targa", "C003", "F031", "Sc", "NDRi"],
    blocks: [
      {
        type: "table",
        headers: ["Targa", "Chi è", "Esempio"],
        rows: [
          ["Cliente", "C + 3 esadecimali", "C003"],
          ["Fornitore", "F + 3 esadecimali", "F031"],
          ["Sconto listino B2B", "Sc + 5 cifre", "Sc00001"],
          ["Prodotto Agrinsicilia", "Codice libero della scheda", "NDRi"],
          ["Materia prima", "Mp…", "MpCladodi"],
          ["Prodotto acquisto", "Pr…", "PrCartone"],
          ["Servizio", "Sz…", "SzTrasporto"],
        ],
      },
      {
        type: "p",
        text: "Le targhe C e F le assegna il gestionale da solo, in sequenza. Se cancelli (soft delete) una scheda, quella targa può tornare libera. I fornitori bio con certificato possono avere regole più strette.",
      },
      {
        type: "p",
        text: "Nel lotto L- si usa la targa fornitore senza F: F031 → 031. La targa prodotto resta com’è (NDRi).",
      },
    ],
  }),
  makeArticle({
    id: "lotti-documenti-commerciali",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Numeri ordine, fattura, preventivo, campionatura",
    summary:
      "Numerazione per anno e targa anagrafica. Non sostituiscono i lotti di magazzino.",
    path: "/app/amministrazione/ordini/nuovo",
    tags: ["Or-", "Ft-", "Nc-", "Pv-", "Cp-", "numero interno"],
    blocks: [
      {
        type: "table",
        headers: ["Prefisso", "Cosa", "Esempio"],
        rows: [
          ["Or-", "Ordine (anche se è una campionatura-ordine)", "Or-26-C003/391"],
          ["Pv-", "Preventivo", "Pv-26-C003/12"],
          ["Ft-", "Fattura interna (a video spesso 26-C005/1)", "Ft-26-C005/1"],
          ["Nc-", "Nota di credito", "Nc-26-C005/2"],
          ["Cp-", "Campionatura", "Cp-26-C003/1"],
        ],
      },
      {
        type: "p",
        text: "Si legge: tipo + anno a due cifre + targa del cliente (o fornitore se è un documento di acquisto) + progressivo di quella coppia anno/targa. Il 391 di C003 non è lo stesso 391 di C005.",
      },
      {
        type: "p",
        text: "Sulle righe puoi scrivere un lotto (di solito il L-…). È un riferimento, non un nuovo formato.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-catalogo-barcode",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Codici catalogo, SKU e barcode",
    summary:
      "Codici delle schede e barre da stampare. Il barcode può contenere un lotto, ma non lo inventa.",
    tags: ["Mp", "Pr", "Sz", "SKU", "barcode", "At-", "AP-", "PX-"],
    blocks: [
      {
        type: "p",
        text: "Ogni articolo ha un codice di scheda (Mp…, Pr…, Sz…, Ct…, oppure il codice libero dei prodotti propri). È l’identità del tipo di merce, non del singolo sacco arrivato il 14 settembre.",
      },
      {
        type: "ul",
        items: [
          "SKU da fattura (AI): tipo PrMIS-SOL-PH4-5DL. Serve a catalogare, non a tracciare il lotto.",
          "Barcode: stringa fino a 128 caratteri, unica per articolo. Può essere il lotto L- o il Codice MP se lo scrivi tu nel generatore.",
          "Attività amministrazione: At-… Formazione: Fo-…",
          "Attività di processo: spesso AP-… Processi: spesso PX-… Macchinari: Mac-XXX-XXX-XXX.",
        ],
      },
      {
        type: "note",
        text: "Il generatore barcode sta in Strumenti (primo livello, tra Area Fiscale e Gestionale Fornitori). Stampa quello che gli dai. Non crea un nuovo sistema di lotti.",
      },
    ],
  }),
  makeArticle({
    id: "lotti-esterni-uscita",
    sectionId: "lotti",
    sectionTitle: "Lotti e numerazioni",
    title: "Lotti esterni: lotto prodotto in uscita",
    summary:
      "Lotto da 10 caratteri (SSAA + 6 hex) per clienti, fatture e DDT. Nasce col foglio di lavorazione.",
    path: "/app/strumenti/generatore-lotti",
    tags: [
      "lotto esterno",
      "lotto in uscita",
      "SSAA",
      "QR",
      "decifratore",
      "composito",
    ],
    blocks: [
      {
        type: "p",
        text: "I lotti interni (MP, FIMP, L-, FL-, targhe) restano per lavorare in azienda. Il lotto esterno è quello che esce: corto, uguale in tutti i gestionali, max 10 caratteri.",
      },
      {
        type: "code",
        caption: "Esempio 1426000001",
        text: "14  26  000001\n│   │   └── progressivo hex della settimana\n│   └────── anno 2026\n└────────── settimana ISO 14",
      },
      {
        type: "h",
        text: "Quando nasce",
      },
      {
        type: "p",
        text: "Alla creazione del foglio di lavorazione. Lo vedi in Foglio in esecuzione, con le spunte di cosa mostrare sul QR pubblico e la stampa PDF. Elenco, lotti inclusivi e decifratore stanno in Strumenti (menu di primo livello).",
      },
      {
        type: "h",
        text: "Un lotto o più lotti in vendita",
      },
      {
        type: "ul",
        items: [
          "Se tutta la quantità viene da un solo lotto in uscita: si comunica quello.",
          "Se viene da due o più: si genera un nuovo lotto inclusivo che li contiene. Oggi lo puoi provare in Strumenti → Generatore di Lotti; dagli ordini arriverà in automatico.",
        ],
      },
      {
        type: "h",
        text: "Decifratore e QR",
      },
      {
        type: "p",
        text: "Il decifratore interno smonta la storia in ordine di tempo: raccolto (quando ci sarà il gestionale fornitori), arrivo, attesa, foglio, personale, essiccazione, magazzino, imballaggio, spedizione. Sul QR pubblico restano solo le caselle spuntate.",
      },
    ],
  }),
];
