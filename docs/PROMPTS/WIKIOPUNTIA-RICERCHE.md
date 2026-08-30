# Prompt da incollare in WikiOpuntia

Copia il blocco seguente nella chat del progetto WikiOpuntia.

```
Lavori SOLO sul repository WikiOpuntia (sito pubblico wikiopuntia.com).
Non toccare il gestionale OpuntiaIndustry. Il database è il Supabase CENTRALE:
source of truth = wiki_scientific_research, scritta SOLO dal gestionale.

================================================================
DOVE SONO LE RICERCHE DA MOSTRARE SUL SITO
================================================================

Nel gestionale (area WikiOpuntia → Biblioteca) l’operatore:
1) registra la scheda (categorie + accesso PDF)
2) clicca «Invia a WikiOpuntia»  →  status = published

Tu mostri SOLO le ricerche già INVIATE.

VISTA CANONICA (list, filtri, scheda, sitemap):
  public.v_wiki_pubblicati
  filtro già applicato: deleted_at IS NULL AND status = 'published'

Campi:
  id, slug, title, abstract, authors, keywords, category, ai_summary,
  plant_parts, sectors, is_most_searched, is_evidence, is_public,
  published_year, published_month, published_at,
  external_link, pdf_available, public_url, versione

NOTA: public_url nella vista è valorizzato SOLO se is_public = true.
Se is_public = false, public_url è NULL (non dare il PDF agli anonimi).

Se una ricerca NON è in v_wiki_pubblicati → 404. Non è sul portale.
NON creare tabelle parallele. NON pubblicare tu: lo fa il gestionale.

================================================================
PUBBLICA / NON PUBBLICA = ACCESSO AL PDF (come il vecchio sito)
================================================================

NON è “visibile / nascosta”. Entrambe possono essere sul portale
se il gestionale ha fatto «Invia a WikiOpuntia».

is_public = true   PUBBLICA
  Chiunque vede la scheda E può scaricare il PDF senza registrazione.
  Usa public_url della vista. Bottone «Scarica PDF» libero.

is_public = false  NON PUBBLICA
  Chiunque vede titolo, abstract, tag, sintesi.
  Per SCARICARE il PDF serve login (account portale / portale_utenti).
  Anonimo: niente URL. Mostra «Accedi o registrati per scaricare».
  Dopo login: chiama RPC
    wiki_research_download_url(p_research_id uuid) → text
  Se torna null: utente non loggato o scheda non inviata.
  Poi apri/scarica quell’URL.

Mapping legacy MySQL:
  close = 0 → is_public true  (download libero)
  close = 1 → is_public false (download con login)

NON nascondere le non pubbliche dal catalogo.
NON inventare un secondo elenco riservato.
wiki_document_requests: solo per research_id presente in v_wiki_pubblicati.

Chatbot RAG:
  match_wiki_document_chunks(...)
  già include i paper non pubblici SOLO se auth.uid() non è null.
  Visitatori anonimi: solo paper con PDF pubblico.

================================================================
CATEGORIE MULTI (invariato)
================================================================

plant_parts text[] = riferimento: cladodes, fruits, flowers
sectors text[]     = applicazione: nutrace, pharma, food, cosmetic,
                     veterina, technical, other
Filtri checkbox multipli, query con overlap &&.

================================================================
COSA FARE ORA NEL REPO WIKI
================================================================

1) Catalogo = v_wiki_pubblicati (tutte le inviate, pubbliche e non).
2) Scheda: se is_public mostra Scarica; se no, CTA login poi RPC download.
3) Registrazione/login portale già prevista (portale_utenti): usala per il PDF chiuso.
4) Chat: match_wiki_document_chunks con la sessione utente se loggato.
5) Se manca qualcosa sul DB: prompt per OpuntiaIndustry, non alterare da qui.
```
