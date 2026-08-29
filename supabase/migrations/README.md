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

**Prossimo timestamp libero: `20260829150000` o successivo (sempre maggiore dell’ultimo).**

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
