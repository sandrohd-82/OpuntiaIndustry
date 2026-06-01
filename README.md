# Industry — Gestionale aziendale

Piattaforma gestionale modulare per area, con accesso riservato agli utenti autenticati e **doppio controllo** (attualmente conferma via **email**; in futuro anche app authenticator).

## Funzionalità attuali (struttura)

- Login con Supabase Auth (email/password)
- Secondo fattore: codice OTP via email (in dev stampato in console server)
- Ruoli utente e visibilità aree in base al ruolo
- Aree placeholder: Dashboard, Commerciale, Produzione, Magazzino, Acquisti, HR, Amministrazione, Impostazioni
- Schema PostgreSQL con RLS e seed ruoli/permessi

## Requisiti

- Node.js 20+
- Account [Supabase](https://supabase.com)
- (Opzionale) [Supabase CLI](https://supabase.com/docs/guides/cli) per migrazioni locali

## Avvio rapido

### 1. Dipendenze

```bash
npm install
```

### 2. Variabili d'ambiente

Copia `.env.example` in `.env.local` e compila:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Database Supabase

**Opzione A — Dashboard:** SQL Editor → incolla ed esegui  
`supabase/migrations/20250601000000_initial_schema.sql`

**Opzione B — CLI:**

```bash
npx supabase link --project-ref <tuo-project-ref>
npx supabase db push
```

### 4. Utente di test

In Supabase: **Authentication → Users → Add user** (email confermata).

Alla prima registrazione il trigger crea automaticamente `profiles` (ruolo `operator`) e `user_second_factor`.

Per testare come admin, aggiorna il profilo:

```sql
update public.profiles
set role_id = (select id from public.app_roles where code = 'admin')
where email = 'tuo@email.it';
```

### 5. Sviluppo

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) → **Accedi** → password → codice OTP (vedi terminale `npm run dev` in development).

## Struttura progetto

Vedi [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) per flussi auth, modello dati e roadmap.

## Prossimi passi suggeriti

1. Configurare invio email OTP (Resend / SMTP Supabase)
2. Pannello admin per assegnare ruoli agli utenti
3. Implementare il primo modulo reale (es. Commerciale — anagrafica clienti)
4. Aggiungere 2FA tramite app (TOTP) quando richiesto
