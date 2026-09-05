# Migrazioni Supabase — coda unica ecosistema Opuntia

Questa cartella è la **source of truth** per lo schema del database centrale.
WikiOpuntia e OpuntiaItalia **non** hanno uno schema proprio: accodano file qui.

## Sequenza attuale (coda)

| Timestamp | File | Origine |
|-----------|------|---------|
| … | migrazioni ERP gestionale | OpuntiaIndustry |
| `20260829110000` | `opuntiaitalia_portale_foundation.sql` | OpuntiaItalia |
| `20260829120000` | `wikiopuntia_foundation.sql` | WikiOpuntia |
| `20260829130000` | `wikiopuntia_pgvector_rag.sql` | WikiOpuntia |
| `20260829140000` | `ecosystem_master_layer_iso9001.sql` | OpuntiaIndustry (layer A) |
| `20260829150000` | `wikiopuntia_docs_public_ai.sql` | Bucket pubblico + campi AI |
| `20260829151000` | `wikiopuntia_docs_view_bucket_fix.sql` | Fix vista + bucket |
| `20260829160000` | `wiki_is_public_categorie_multi.sql` | `is_public` + vista/RLS solo aperte |
| `20260829170000` | `wiki_download_access_vs_invio_portale.sql` | PDF libero vs login; invio = published |
| `20260829180000` | `wiki_close_richiesta_email.sql` | close=1 = richiesta + email, niente URL |
| `20260829190000` | `wiki_backfill_is_public_from_close.sql` | Allinea is_public al dump (66 liberi, 28 richiesta) |
| `20260901120000` | `campionature_iso9001.sql` | Tabelle `campionature` + `campionature_righe` (distinte da ordini) |
| `20260901130000` | `campionature_mezzo_nota.sql` | Mezzo richiesta + link nota/mail |
| `20260901140000` | `campionature_data_richiesta_spedizione.sql` | Data richiesta + spedizione altro posto |
| `20260901150000` | `preventivi_iso9001.sql` | Tabelle `preventivi` + `preventivi_righe`; link ordine |
| `20260901160000` | `imballaggi_voci_prodotti_doppio_ruolo.sql` | Isolamento/confezione ↔ prodotti + doppio ruolo + max kg |
| `20260901170000` | `imballaggi_voci_prodotti_unita_misura.sql` | UM (kg/g/lt/ml/pz) sul collegamento prodotto |
| `20260904190000` | `iot_devices_telemetry_commands.sql` | IoT REST + Realtime (devices, telemetry, commands) |
| `20260905100000` | `macchinario_attivita_storico_filtri.sql` | Storico attività: tipi extra + foglio_id |

**Prossimo timestamp libero: `20260905110000` o successivo (sempre maggiore dell’ultimo).**

## Regole (obbligatorie)

1. Nome file: `YYYYMMDDHHMMSS_slug_minuscolo.sql` (14 cifre, come gli altri).
2. Il timestamp deve essere **strettamente maggiore** dell’ultimo file già presente.
3. Mai modificare o rinominare una migrazione già committata.
4. Mai ricreare tabelle esistenti (`prodotti_propri`, `ordini`, `clienti`, `wiki_scientific_research`, `portale_*`, `listini`, …). Solo `ALTER` additivo o tabelle **nuove**.
5. Ogni tabella operativa nuova: `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`, `deleted_by`. Soft delete, niente `DELETE` fisico.
6. Documenti pubblici: `versione` + stato + `approved_by` / `published_by`.
7. I satelliti leggono **viste** (`v_catalogo_b2b`, `v_listino_b2b_vigente`, `v_wiki_pubblicati`), non le tabelle ERP.

## Collegamento dai progetti satelliti (Windows)

Da PowerShell, nella root del progetto satellite:

```powershell
# WikiOpuntia
New-Item -ItemType Junction -Path "E:\Progetti Cursor\WikiOpuntia\supabase\migrations" -Target "E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations"

# OpuntiaItalia
New-Item -ItemType Junction -Path "E:\Progetti Cursor\OpuntiaItalia\supabase\migrations" -Target "E:\Progetti Cursor\OpuntiaIndustry\supabase\migrations"
```

Se la cartella `migrations` sul satellite esiste già, rinominala e poi crea il junction.

Prossimo stamp in automatico:

```bash
node scripts/next-migration-stamp.mjs
```

Protocollo esteso e prompt da copiare: `docs/ECOSYSTEM-MIGRATIONS.md`.
