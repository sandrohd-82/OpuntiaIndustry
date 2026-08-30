# Prompt da incollare in WikiOpuntia

Copia il blocco seguente nella chat del progetto WikiOpuntia.

```
Lavori SOLO sul repository WikiOpuntia (sito pubblico wikiopuntia.com).
Non toccare il gestionale OpuntiaIndustry. Il database è il Supabase CENTRALE:
source of truth delle ricerche scientifiche è la tabella wiki_scientific_research,
gestita e pubblicata SOLO dal gestionale (area WikiOpuntia → Biblioteca).

================================================================
DOVE SONO LE RICERCHE DA PUBBLICARE SUL SITO
================================================================

Nel gestionale OpuntiaIndustry le schede si creano, si importano e si approvano qui:
- /app/wikiopuntia/biblioteca/nuova   → nuova ricerca + sync archivio legacy
- /app/wikiopuntia/biblioteca/elenco  → elenco (pubblica / non pubblica)
- /app/wikiopuntia/biblioteca/archivio

Tu NON leggi quelle pagine. Tu leggi solo i record già aperti e pubblicati.

VISTA CANONICA (usala per list, filtri, scheda, sitemap, RSS):
  public.v_wiki_pubblicati

Campi della vista:
  id, slug, title, abstract, authors, keywords, category, ai_summary,
  plant_parts, sectors, is_most_searched, is_evidence, is_public,
  published_year, published_month, published_at,
  external_link, pdf_available, public_url, versione

Filtro già applicato dalla vista:
  deleted_at IS NULL
  AND status = 'published'
  AND is_public = true

Quindi: se una ricerca NON è in v_wiki_pubblicati, NON deve comparire
su wikiopuntia.com (né in lista, né in dettaglio, né nel chatbot).

PDF permanente:
  colonna public_url
  (bucket pubblico wikiopuntia-docs — URL già completo, non ricostruirlo)

NON fare select * da wiki_scientific_research per il portale.
NON mostrare bozze, archiviate, soft-deleted o chiuse (is_public = false).
NON creare tabelle parallele (niente wikiopuntia_papers).

RPC chatbot (solo paper pubblici):
  match_wiki_document_chunks(query_embedding vector(1536), match_count int, filter_source text)
  già filtra status=published AND is_public=true.

================================================================
DUE ASSI DI CATEGORIA (MULTI-VALORE) — FONDAMENTALE
================================================================

Nel vecchio MySQL le categorie erano flag booleani, anche più di uno insieme:
  cladodes, fruits, flowers, nutrace, pharma, food, cosmetic,
  veterina, technical, other

Nel DB centrale sono due array PostgreSQL (GIN già indicizzati).
Una ricerca può avere PIÙ riferimenti E PIÙ applicazioni.

1) CATEGORIA DI RIFERIMENTO = plant_parts text[]
   Parte della pianta studiata.
   Valori ammessi:
     cladodes  → Cladodi (pale / fusti)
     fruits    → Frutti
     flowers   → Fiori
   Esempio: {cladodes,fruits}

2) APPLICAZIONE / SETTORE = sectors text[]
   Uso o ambito della ricerca.
   Valori ammessi:
     nutrace    → Nutraceutico
     pharma     → Farmaceutico
     food       → Alimentare
     cosmetic   → Cosmetico
     veterina   → Veterinario
     technical  → Tecnico / industriale
     other      → Altro
   Esempio: {nutrace,food}

NON sono categorie di filtro:
  most_searched → flag is_most_searched (evidenza in home)
  evidence      → flag is_evidence
  category      → etichetta vetrina opzionale (Agronomia | Nutrizione | Cosmetica | Usi Industriali)
                  NON usarla come unico filtro: è derivata, può essere vuota.

UI richiesta sul sito:
- Filtri checkbox multipli su plant_parts (Cladodi / Frutti / Fiori)
- Filtri checkbox multipli su sectors (le 7 applicazioni, etichette italiane)
- Una scheda deve mostrare TUTTI i tag di entrambi gli assi
- Query: plant_parts && ARRAY['cladodes']  e/o  sectors && ARRAY['cosmetic']
  (overlap, non uguaglianza: una ricerca multi-tag deve uscire in ogni filtro selezionato)

================================================================
APERTA / PUBBLICA  vs  CHIUSA / NON PUBBLICA
================================================================

Nel MySQL legacy il campo si chiamava `close`:
  close = 0  → ricerca APERTA  → is_public = true  → visibile sul sito
  close = 1  → ricerca CHIUSA  → is_public = false → SOLO gestionale

Nel centrale:
  is_public = true  + status = 'published'  → in v_wiki_pubblicati → PUBBLICA
  is_public = false                         → NON in vista        → NON PUBBLICA

Regole:
- Le chiuse non hanno pagina pubblica, non vanno in ricerca, non vanno nel RAG.
- Non inventare un paywall o un elenco “riservato” sul sito: le chiuse non esistono per il portale.
- Se un utente chiede un PDF di una ricerca non in v_wiki_pubblicati: 404, stop.
- wiki_document_requests: solo se research_id è in v_wiki_pubblicati.

================================================================
COSA FARE ORA NEL REPO WIKI
================================================================

1) Catalogo / archivio ricerche: source = v_wiki_pubblicati.
2) Filtri UI: due gruppi (Riferimento botanico + Applicazione), multi-selezione.
3) Scheda: titolo, autori, anno, abstract, ai_summary, tag plant_parts + sectors,
   link “Leggi / Scarica PDF” = public_url.
4) Chatbot: solo match_wiki_document_chunks (già filtrato).
5) Se ti manca una colonna o una RLS: NON alterare il DB da qui.
   Scrivi un prompt dettagliato da copiare in OpuntiaIndustry e fermati.

ISO 9001: tu sei solo lettore del catalogo pubblicato. Chi/quando/approvazione
restano nel gestionale (created_by, approved_by, versione, audit_log).
```
