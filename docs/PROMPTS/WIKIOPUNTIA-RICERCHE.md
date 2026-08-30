# Prompt da incollare in WikiOpuntia

Copia **tutto** il blocco seguente nella chat Cursor del progetto WikiOpuntia.

```
Lavori SOLO sul repository WikiOpuntia (sito pubblico wikiopuntia.com).
Non toccare il gestionale OpuntiaIndustry e non inventare uno schema parallelo.
Il database è il Supabase CENTRALE. Le ricerche le scrive solo il gestionale.

SOURCE OF TRUTH MIGRAZIONI:
E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations
Collega quella cartella (junction Windows):
  powershell -File "E:\Progetti Cursor\OpuntiaIndustry\scripts\link-ecosystem-migrations.ps1" -SatelliteRoot "E:\Progetti Cursor\WikiOpuntia"
Prima di un .sql nuovo: node E:\Progetti Cursor\OpuntiaIndustry\scripts\next-migration-stamp.mjs
Timestamp deve essere > 20260829190000. Nome: YYYYMMDDHHMMSS_wikiopuntia_<slug>.sql
Mai modificare file già committati. Solo ALTER additivo o tabelle nuove.
ISO 9001: created_at/updated_at/created_by/updated_by + deleted_at/deleted_by; niente DELETE fisico.

SE TI SERVE UNA MODIFICA SUL GESTIONALE (UI, nuova colonna ERP, invio email richieste):
NON implementarla qui. Scrivi un PROMPT dettagliato da copiare in OpuntiaIndustry e fermati.

================================================================
DOVE SONO LE RICERCHE DA MOSTRARE
================================================================

Nel gestionale (WikiOpuntia → Biblioteca) l’operatore:
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

public_url è valorizzato SOLO se is_public = true (URL già completo del bucket
pubblico wikiopuntia-docs). Se is_public = false, public_url è sempre NULL.

Se una ricerca NON è in v_wiki_pubblicati → 404.
NON creare tabelle parallele (niente wikiopuntia_papers).
NON pubblicare tu: lo fa il gestionale con «Invia a WikiOpuntia».
NON fare select * da wiki_scientific_research per il catalogo anonimo: usa la vista.

================================================================
PUBBLICA / NON PUBBLICA = ACCESSO AL FILE (ex campo MySQL close)
================================================================

NON indica se la scheda è sul sito. Entrambe possono essere in catalogo
se sono state inviate. Indica COME si ottiene il PDF.

Nel dump reale: 66 con close=0 (libere), 28 con close=1 (su richiesta).

is_public = true   (ex close = 0)  PUBBLICA
  Download LIBERO. Chiunque, senza registrazione, scarica il PDF.
  Bottone «Scarica PDF» = public_url della vista.

is_public = false  (ex close = 1)  NON PUBBLICA
  Scheda VISIBILE (titolo, abstract, tag, sintesi).
  Il file NON si scarica dal sito, nemmeno dopo il login.
  Procedura obbligatoria:
  1) L’utente deve essere registrato e loggato (portale_utenti / auth).
  2) Compila una RICHIESTA del documento.
  3) INSERT in wiki_document_requests (solo authenticated).
  4) La richiesta arriva al gestionale: /app/wikiopuntia/richieste-documenti
  5) L’OPERATORE invia la ricerca via EMAIL. Tu NON invii l’email e NON
     alleghi il PDF nella risposta API.

UI non pubblica:
  - Niente link PDF, niente wiki_research_download_url, niente signed URL.
  - Non loggato: «Accedi o registrati per richiedere il documento».
  - Loggato: form «Richiedi il documento» poi
    INSERT wiki_document_requests (
      research_id,          -- id in v_wiki_pubblicati e is_public = false
      email,                -- email utente loggato
      document_name,        -- titolo o nome file
      locale                -- it|en|de|fr|es
    )
  - Messaggio: «Richiesta inviata. Ti invieremo la ricerca via email.»
  - NON promettere download immediato.

MAI:
  - dare public_url / storage path delle non pubbliche
  - nascondere le non pubbliche dal catalogo

Chatbot: match_wiki_document_chunks(query_embedding vector(1536), match_count int, filter_source text)
già limitato a is_public = true (niente testo integrale delle chiuse).

================================================================
CATEGORIE MULTI (anche più di una per scheda)
================================================================

Riferimento botanico  plant_parts text[]
  cladodes = Cladodi    fruits = Frutti    flowers = Fiori

Applicazione          sectors text[]
  nutrace = Nutraceutico    pharma = Farmaceutico    food = Alimentare
  cosmetic = Cosmetico      veterina = Veterinario   technical = Tecnico / industriale
  other = Altro

Filtri: due gruppi di checkbox. Query overlap:
  plant_parts && ARRAY['cladodes']
  sectors && ARRAY['cosmetic']

NON usare come unico filtro: is_most_searched, is_evidence, category
(category è solo etichetta vetrina opzionale: Agronomia|Nutrizione|Cosmetica|Usi Industriali).

================================================================
COSA FARE ORA NEL REPO WIKI
================================================================

1) Catalogo = v_wiki_pubblicati (tutte le inviate: 66 libere + 28 su richiesta).
2) is_public true  → Scarica PDF (public_url).
3) is_public false → login + form → wiki_document_requests; PDF via email operatore.
4) Chat = solo match_wiki_document_chunks.
5) Ingest chunk/embedding: puoi aggiornare ingest_status. Non cambiare status/is_public.
6) Non scrivere su prodotti_propri, listini, ordini, clienti, fatture.
```
