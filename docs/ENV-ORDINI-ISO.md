# Configurazione ambiente — Ordini ISO 9001

## Variabili già richieste (`.env.local` / Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Nessuna nuova variabile obbligatoria: gli allegati usano il client Supabase autenticato e il bucket `ordini-allegati` creato dalla migrazione.

## Migrazioni da applicare

```bash
npx supabase db push
```

oppure applicare manualmente in Supabase Dashboard → SQL Editor (nell’ordine):

1. `supabase/migrations/20260808160000_ordini_iso9001.sql` (fase 1 — ordini)
2. `supabase/migrations/20260810120000_schede_iso9001_soft_delete.sql` (fase 2 — schede anagrafiche)
3. `supabase/migrations/20260810140000_ordini_pagamento_audit_backfill.sql` (pagamento + backfill operatore `sandrohd@gmail.com`)
4. `supabase/migrations/20260810150000_profiles_nome_cognome_ruolo.sql` (nome/cognome/ruolo aziendale operatori)

### Fase 2 — schede

Soft delete + `updated_by` su `clienti`, `fornitori`, `materie_prime`, `prodotti_propri`.  
Eliminazione UI con doppia conferma e frase `Elimina [codice/targa]`.  
Create/update/soft-delete scrivono su `audit_log`.

## Storage

- Bucket privato: `ordini-allegati`
- Dimensione max: 15 MB
- MIME: PDF, JPEG, PNG, WebP
- RLS: solo utenti con area `amministrazione` (o superadmin)

## Anti-duplicato fatture emesse (sync FiC)

```
# Tolleranza importo match (default 0.02 €)
FATTURE_SYNC_TOTALE_TOLLERANZA=0.02
# Giorni di tolleranza data per match debole (default 3)
FATTURE_SYNC_DATA_TOLLERANZA_GIORNI=3
```

Match forte (auto-link `fic_id`): numero documento + P.IVA + anno, oppure numero + data + totale.
Match debole: stesso cliente + totale + data ±N giorni → conferma operatore in coda.

## Formazione attività (develop)

```
# false in test; true quando la formazione diventa obbligatoria
ATTIVITA_FORMAZIONE_OBBLIGATORIA=false
NEXT_PUBLIC_ATTIVITA_FORMAZIONE_OBBLIGATORIA=false
```

Targa formazione con prefisso `Fo` (es. `Fo-HACCP`).

- `audit_log`: solo INSERT + SELECT (immutabile)
- Soft delete richiede doppia conferma UI e frase `Elimina [numero_interno]`
