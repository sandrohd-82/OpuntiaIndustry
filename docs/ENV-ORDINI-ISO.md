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

### Fase 2 — schede

Soft delete + `updated_by` su `clienti`, `fornitori`, `materie_prime`, `prodotti_propri`.  
Eliminazione UI con doppia conferma e frase `Elimina [codice/targa]`.  
Create/update/soft-delete scrivono su `audit_log`.

## Storage

- Bucket privato: `ordini-allegati`
- Dimensione max: 15 MB
- MIME: PDF, JPEG, PNG, WebP
- RLS: solo utenti con area `amministrazione` (o superadmin)

## Sicurezza

- Tabella `ordini`: nessun DELETE fisico via RLS (solo soft delete con `deleted_at`)
- `audit_log`: solo INSERT + SELECT (immutabile)
- Soft delete richiede doppia conferma UI e frase `Elimina [numero_interno]`
