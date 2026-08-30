# Prompt da incollare in WikiOpuntia

Copia il blocco seguente nella chat del progetto WikiOpuntia.

```
Lavori SOLO sul repository WikiOpuntia (sito pubblico wikiopuntia.com).
Non toccare il gestionale OpuntiaIndustry. Il database è il Supabase CENTRALE.
Source of truth ricerche = wiki_scientific_research (la scrive solo il gestionale).

================================================================
DOVE SONO LE RICERCHE DA MOSTRARE
================================================================

Nel gestionale (area WikiOpuntia → Biblioteca) l’operatore:
1) registra la scheda (categorie + accesso PDF)
2) clicca «Invia a WikiOpuntia» → status = published

Tu mostri SOLO le ricerche già INVIATE.

VISTA CANONICA (list, filtri, scheda, sitemap):
  public.v_wiki_pubblicati
  già filtrata: deleted_at IS NULL AND status = 'published'

Campi:
  id, slug, title, abstract, authors, keywords, category, ai_summary,
  plant_parts, sectors, is_most_searched, is_evidence, is_public,
  published_year, published_month, published_at,
  external_link, pdf_available, public_url, versione

public_url nella vista è valorizzato SOLO se is_public = true.
Se is_public = false, public_url è sempre NULL.

Se una ricerca NON è in v_wiki_pubblicati → 404.
NON creare tabelle parallele. NON pubblicare tu: lo fa il gestionale
con «Invia a WikiOpuntia».

================================================================
CAMPO close (legacy) = ACCESSO AL PDF — FONDAMENTALE
================================================================

Nel vecchio MySQL il campo si chiamava `close`.
NON indica se la scheda è sul sito. Indica COME si ottiene il file.

close = 0  →  is_public = true   →  PUBBLICA
  Download LIBERO. Chiunque, senza registrazione, scarica il PDF.
  Bottone «Scarica PDF» = public_url della vista.

close = 1  →  is_public = false  →  NON PUBBLICA
  Il file NON si scarica dal sito, nemmeno dopo il login.
  Procedura obbligatoria (come il vecchio sito):
  1) L’utente deve essere registrato e loggato (portale_utenti / auth).
  2) Compila una RICHIESTA del documento.
  3) La richiesta arriva al gestionale (WikiOpuntia → Richieste PDF).
  4) L’OPERATORE invia la ricerca via EMAIL (non c’è download diretto).

UI scheda non pubblica:
  - Mostra titolo, abstract, tag, sintesi (la scheda è visibile).
  - Niente link PDF, niente RPC wiki_research_download_url, niente signed URL.
  - Se NON loggato: «Accedi o registrati per richiedere il documento».
  - Se loggato: form «Richiedi il documento».
    INSERT in wiki_document_requests:
      research_id  = id della scheda (deve essere in v_wiki_pubblicati)
      email        = email dell’utente loggato (o confermata nel form)
      document_name = titolo o nome file
      locale       = it|en|de|fr|es
  - Dopo l’invio: messaggio «Richiesta inviata. Ti invieremo la ricerca via email.»
  - NON promettere download immediato.

wiki_document_requests:
  - INSERT solo da utente autenticato, solo se is_public = false
    e la ricerca è in v_wiki_pubblicati.
  - Lo staff gestionale vede le richieste in /app/wikiopuntia/richieste-documenti
    e spedisce il PDF per email; poi segna «notificata».
  - Tu NON invii l’email e NON alleghi il PDF nella risposta API.

MAI:
  - dare public_url / storage path delle non pubbliche
  - usare wiki_research_download_url per le non pubbliche (per quelle è null)
  - nascondere le non pubbliche dal catalogo (si vedono, manca solo il file)

Chatbot RAG match_wiki_document_chunks:
  usa solo i paper con is_public = true (niente testo integrale delle chiuse,
  altrimenti bypassi la richiesta + email).

================================================================
CATEGORIE MULTI
================================================================

plant_parts text[] = riferimento: cladodes (Cladodi), fruits (Frutti), flowers (Fiori)
sectors text[]     = applicazione: nutrace, pharma, food, cosmetic,
                     veterina, technical, other
Una ricerca può avere PIÙ valori su entrambi gli assi.
Filtri checkbox multipli. Query: colonna && ARRAY['valore']

NON usare come filtro unico:
  most_searched → is_most_searched
  evidence      → is_evidence
  category      → etichetta vetrina opzionale

================================================================
COSA FARE ORA NEL REPO WIKI
================================================================

1) Catalogo = v_wiki_pubblicati (inviate: pubbliche e non).
2) is_public true  → Scarica PDF (public_url).
3) is_public false → login + form richiesta → wiki_document_requests.
   Testo: la ricerca arriva via email dall’operatore.
4) Chat: solo match_wiki_document_chunks (già limitato ai PDF liberi).
5) Se manca una colonna/RLS: prompt per OpuntiaIndustry, non alterare il DB.
```
