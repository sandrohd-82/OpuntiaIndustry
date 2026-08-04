# Industry — Gestionale aziendale

Piattaforma gestionale modulare per area, con accesso riservato agli utenti autenticati e **doppio controllo** (attualmente conferma via **email**; in futuro anche app authenticator).

## Funzionalità attuali (struttura)

- Login con Supabase Auth (email/password)
- Secondo fattore: OTP via email SMTP Aruba (default) oppure Google Authenticator (solo superadmin)
- Ruolo **superadmin** (unico) con area Impostazioni e setup Authenticator
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

EMAIL_FROM=support@opuntiaindustry.com
SMTP_HOST=smtps.aruba.it
SMTP_PORT=465
SMTP_USER=support@opuntiaindustry.com
SMTP_PASS=...
```

### 3. Database Supabase

**Opzione A — Dashboard:** SQL Editor → incolla ed esegui  
`supabase/migrations/20250601000000_initial_schema.sql`

**Opzione B — CLI:**

```bash
npx supabase link --project-ref <tuo-project-ref>
npx supabase db push
```

### 4. Superadmin (obbligatorio per Impostazioni / Authenticator)

Assicurati di aver applicato anche la migration  
`supabase/migrations/20260804160000_superadmin_totp.sql`.

In `.env.local` aggiungi:

```env
SUPERADMIN_EMAIL=tuo@email.it
SUPERADMIN_PASSWORD=password-sicura
SUPERADMIN_FULL_NAME=Il Tuo Nome
```

Poi:

```bash
npm run create-superadmin
```

Lo script crea l’utente Auth (se manca) e lo promuove a **unico** `superadmin`.  
Dopo il login: **Impostazioni → Configura Google Authenticator**.

Utenti normali (Dashboard Supabase → Add user) restano `operator` con OTP email.

### 5. Sviluppo

```bash
npm run dev
```

Apri [http://localhost:3000](http://localhost:3000) → **Accedi** → password → codice OTP (vedi terminale `npm run dev` in development).

## Struttura progetto

Vedi [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) per flussi auth, modello dati e roadmap.

## Prossimi passi suggeriti

1. Pannello admin per assegnare ruoli agli utenti
2. Implementare il primo modulo reale (es. Commerciale — anagrafica clienti)
