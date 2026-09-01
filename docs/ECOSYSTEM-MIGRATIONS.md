# Protocollo ecosistema — coda migrazioni e prompt verso il gestionale

Il database Supabase è **uno solo**. OpuntiaIndustry è il Master.
WikiOpuntia e OpuntiaItalia sono satelliti: leggono viste pubbliche e, se serve schema nuovo, **accodano una migrazione in questa repo**.

## Cartella canonica

```
E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations
```

Ultima migrazione: `20260901120000_campionature_iso9001.sql`  
**Prossimo timestamp libero: `20260901130000` o maggiore.**

Prompt ricerche Wiki (categorie multi + pubblica/chiusa): `docs/PROMPTS/WIKIOPUNTIA-RICERCHE.md`.

## Collegamento (da fare una volta sul PC, nei progetti satelliti)

```powershell
powershell -File "E:\Progetti Cursor\OpuntiaIndustry\scripts\link-ecosystem-migrations.ps1" -SatelliteRoot "E:\Progetti Cursor\WikiOpuntia"
powershell -File "E:\Progetti Cursor\OpuntiaIndustry\scripts\link-ecosystem-migrations.ps1" -SatelliteRoot "E:\Progetti Cursor\OpuntiaItalia"
```

Poi, nel satellite:

```bash
node "E:\Progetti Cursor\OpuntiaIndustry\scripts\next-migration-stamp.mjs"
```

## Cosa i satelliti POSSONO usare (sola lettura, già in produzione dopo il push)

| Vista / RPC | Progetto | Uso |
|-------------|----------|-----|
| `v_catalogo_b2b` | OpuntiaItalia | Prodotti pubblicati B2B (slug, nome, bio, UM) |
| `v_listino_b2b_vigente` | OpuntiaItalia | Prezzi listino B2B pubblicato in validità |
| `v_wiki_pubblicati` | WikiOpuntia | Tutte le ricerche **inviate** (`status=published`). `public_url` solo se PDF pubblico |
| `wiki_research_download_url(uuid)` | WikiOpuntia | URL PDF **solo** se `is_public` (close=0). Se close=1 → null |
| `wiki_document_requests` | WikiOpuntia | INSERT richiesta PDF non pubblico (dopo login); operatore invia via email |
| `match_wiki_document_chunks(vector, int, text)` | WikiOpuntia | RAG chatbot |
| `portale_utenti` | entrambi | Profilo utente portale (`auth.users`) |
| `portale_newsletter_iscritti` | OpuntiaItalia | INSERT iscrizione |
| `portale_richieste_contatto` | OpuntiaItalia | INSERT form contatto |
| `wiki_chat_sessions` / `wiki_chat_messages` | WikiOpuntia | Chat pubblica |

## Cosa i satelliti NON devono toccare

- `prodotti_propri`, `clienti`, `ordini`, `fatture_*`, `listini` (write)
- Soft-delete / update di paper Wiki (solo il gestionale pubblica)
- Service role nei browser
- Ricreare tabelle già esistenti

## Ordini B2B

La tabella `ordini` ha già `canale`, `listino_id`, `external_ref`, `portale_utente_id`.
**Non c’è ancora INSERT anon/B2B.** Se OpuntiaItalia deve inviare un ordine, creare un prompt per OpuntiaIndustry che chieda una RPC `submit_ordine_b2b` (validazione Zod + audit + `canale = b2b`). Non inserire righe a mano.

## ISO 9001 (ogni nuova tabella)

- `created_at`, `updated_at`, `created_by`, `updated_by`
- Soft delete: `deleted_at`, `deleted_by`
- Documenti: `versione` + stato + chi ha approvato/pubblicato
- Operazioni critiche: riga su `audit_log` (`create` / `update` / `status_change` / `soft_delete`)
- RLS attiva; revoke DELETE a `authenticated`

---

## Prompt da incollare in WikiOpuntia

Copia il blocco seguente nella chat del progetto WikiOpuntia.

```
Lavori SOLO sul repository WikiOpuntia (sito pubblico wikiopuntia.com).
Il database è il Supabase CENTRALE di OpuntiaIndustry. Non inventare uno schema parallelo.

SOURCE OF TRUTH MIGRAZIONI:
E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations
Collega quella cartella con junction Windows (script del gestionale:
E:\Progetti Cursor\OpuntiaIndustry\scripts\link-ecosystem-migrations.ps1).
Prima di creare un .sql: node E:\Progetti Cursor\OpuntiaIndustry\scripts\next-migration-stamp.mjs
Il timestamp deve essere > 20260829140000. Nome: YYYYMMDDHHMMSS_wikiopuntia_<slug>.sql
Mai modificare file già committati. Solo ALTER additivo o tabelle nuove.
ISO 9001: created_at/updated_at/created_by/updated_by + deleted_at/deleted_by; niente DELETE fisico.

TABELLE GIÀ ESISTENTI (usale, non ricrearle):
- wiki_scientific_research (status: draft|published|archived; ingest_status; versione)
- wiki_document_requests
- wiki_document_chunks (embedding vector(1536) + HNSW)
- wiki_chat_sessions, wiki_chat_messages
- v_wiki_pubblicati (inviate: status=published; pubbliche e non)
- close 0 = is_public true = download libero
- close 1 = is_public false = login + wiki_document_requests; operatore invia via email
- Invia a WikiOpuntia = status published (non è pubblica/non pubblica)
- RPC match_wiki_document_chunks(query_embedding vector(1536), match_count int, filter_source text)
- Storage bucket privato: wiki-research-pdfs
- portale_utenti (origine può essere wikiopuntia)

REGOLE DATI:
- Catalogo: v_wiki_pubblicati. PDF close=1: login + INSERT wiki_document_requests; niente URL.
- L’ingest PDF → chunk/embedding lo fai tu (Wiki) aggiornando ingest_status. Non pubblicare paper: lo fa il gestionale.
- Non scrivere su prodotti_propri, listini, ordini, clienti, fatture.

SE TI SERVE UNA MODIFICA SUL GESTIONALE (UI, RPC ordini, nuova colonna ERP, area menu):
NON implementarla qui. Scrivi un PROMPT DETTAGLIATISSIMO da copiare in OpuntiaIndustry, con:
1) obiettivo funzionale
2) tabelle/colonne esatte (nomi già esistenti)
3) timestamp migrazione proposto (letto dallo stamp script)
4) RLS / chi può leggere-scrivere
5) testi UI in italiano
6) cosa NON toccare
Poi fermati e consegna solo quel prompt.
```

---

## Prompt da incollare in OpuntiaItalia

Copia il blocco seguente nella chat del progetto OpuntiaItalia.

```
Lavori SOLO sul repository OpuntiaItalia (sito B2B).
Il database è il Supabase CENTRALE di OpuntiaIndustry. Non inventare catalogo/listini/ordini locali.

SOURCE OF TRUTH MIGRAZIONI:
E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations
Collega quella cartella con junction Windows (script:
E:\Progetti Cursor\OpuntiaIndustry\scripts\link-ecosystem-migrations.ps1).
Prima di creare un .sql: node E:\Progetti Cursor\OpuntiaIndustry\scripts\next-migration-stamp.mjs
Timestamp > 20260829140000. Nome: YYYYMMDDHHMMSS_opuntiaitalia_<slug>.sql
Mai modificare file già committati. Solo ALTER additivo o tabelle nuove.
ISO 9001: audit fields + soft delete; niente DELETE fisico su dati operativi.

TABELLE/VISTE GIÀ ESISTENTI (usale, non ricrearle):
- v_catalogo_b2b → prodotti pubblicati (id, codice, slug_pubblico, nome, descrizione_pubblica, unita_misura, is_bio)
- v_listino_b2b_vigente → prezzo, iva, min_qty, sconto_max_pct, slug
- portale_utenti (collegato a auth.users; cliente_id opzionale verso anagrafica B2B)
- portale_newsletter_iscritti (INSERT da anon)
- portale_richieste_contatto (INSERT da anon; stato gestito dal gestionale)
- ordini ha già canale, listino_id, external_ref, portale_utente_id — MA non hai INSERT: non scrivere sugli ordini.

REGOLE:
- Catalogo e prezzi: SOLO le viste. Mai select * da prodotti_propri o listini.
- Un prodotto è in vetrina solo se pubblicato + visibile_b2b + slug (la vista già filtra).
- Form contatto e newsletter: insert sulle tabelle portale_* già definite.
- Nessun e-commerce checkout finché il gestionale non espone una RPC submit_ordine_b2b.

SE TI SERVE UNA MODIFICA SUL GESTIONALE (pubblicare un prodotto, nuovo campo listino, RPC ordine, UI lead):
NON implementarla qui. Scrivi un PROMPT DETTAGLIATISSIMO da copiare in OpuntiaIndustry, con:
1) obiettivo
2) tabelle/viste/colonne esatte
3) timestamp migrazione proposto
4) RLS
5) comportamento UI gestionale
6) cosa NON toccare
Poi fermati e consegna solo quel prompt.
```
