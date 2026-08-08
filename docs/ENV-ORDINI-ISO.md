# Configurazione ambiente — Ordini ISO 9001

## Variabili già richieste (`.env.local` / Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Nessuna nuova variabile obbligatoria: gli allegati usano il client Supabase autenticato e il bucket `ordini-allegati` creato dalla migrazione.

## Migrazione da applicare

```bash
npx supabase db push
```

oppure applicare manualmente:

`supabase/migrations/20260808160000_ordini_iso9001.sql`

## Storage

- Bucket privato: `ordini-allegati`
- Dimensione max: 15 MB
- MIME: PDF, JPEG, PNG, WebP
- RLS: solo utenti con area `amministrazione` (o superadmin)

## Sicurezza

- Tabella `ordini`: nessun DELETE fisico via RLS (solo soft delete con `deleted_at`)
- `audit_log`: solo INSERT + SELECT (immutabile)
- Soft delete richiede doppia conferma UI e frase `Elimina [numero_interno]`
