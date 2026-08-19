# Procedura semplificata: Webmail + Vercel + Aruba + Gestionale

Fai un passo alla volta. Se non capisci una parola, fermati e chiedi.

---

## Parte A — Cosa ho già fatto io (nel codice)

1. Creato il modulo **Webmail** in Commerciale  
2. Creato le tabelle sul database Supabase  
3. Creato il cron automatico ogni 10 minuti (`vercel.json`)  
4. Scritto la guida tecnica Gmail/Aruba  
5. Caricato tutto su GitHub (`main`)

**Tu non devi scrivere codice.**

---

## Parte B — Cosa manca sul TUO computer (file `.env.local`)

Apri il file `.env.local` nella cartella del progetto e aggiungi queste righe  
(sostituisci i puntini con i valori veri — **non mandarmeli in chat**):

```env
# Cifratura password caselle (inventa una frase lunga a caso)
WEBMAIL_ENCRYPTION_KEY=inventa-una-frase-lunghissima-casuale-2026

# Chiave per il robot che sincronizza le mail ogni 10 minuti
CRON_SECRET=inventa-un-altra-frase-segreta-cron

# AI (opzionale: se manca, usa regole semplici senza OpenAI)
WEBMAIL_AI_ENABLED=true
WEBMAIL_SYNC_ENABLED=true
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

Nota: oggi nel tuo `.env.local` ci sono già Supabase e SMTP Aruba.  
`SMTP_PASS` risulta vuoto: se l’OTP email non funziona, metti lì la password della casella SMTP.

---

## Parte C — Vercel (sito online) — passo passo

### C1. Apri Vercel
1. Vai su https://vercel.com  
2. Entra nel progetto **OpuntiaIndustry**

### C2. Metti le variabili (come un armadietto di chiavi)
1. Clicca **Settings**  
2. Clicca **Environment Variables**  
3. Aggiungi una per una (Environment = **Production** + Preview se vuoi):

| Nome | Cosa metterci |
|------|----------------|
| `WEBMAIL_ENCRYPTION_KEY` | La stessa frase lunga del `.env.local` |
| `CRON_SECRET` | La stessa frase cron del `.env.local` |
| `WEBMAIL_AI_ENABLED` | `true` |
| `WEBMAIL_SYNC_ENABLED` | `true` |
| `OPENAI_API_KEY` | (opzionale) chiave OpenAI |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `FIC_API_TOKEN` | (se non c’è già) token Fatture in Cloud |
| `FIC_COMPANY_ID` | (se non c’è già) solo numeri, es. `941053` |

4. **Salva** ogni variabile

### C3. Riavvia il sito (obbligatorio dopo le variabili)
1. Vai su **Deployments**  
2. Sull’ultimo deploy: menu `⋯` → **Redeploy**  
3. Se compare “Use existing Build Cache” → **toglilo** (Redeploy senza cache)  
4. Aspetta la spunta verde ✓

### C4. Controlla il cron
1. Settings → **Cron Jobs** (o nel progetto vedi `vercel.json`)  
2. Deve esserci: `/api/cron/webmail-sync` ogni 10 minuti  
3. Vercel manda da solo l’header con `CRON_SECRET` se la variabile esiste

Test manuale (opzionale):  
Apri un terminale e (sostituisci URL e secret):

```bash
curl -H "Authorization: Bearer IL_TUO_CRON_SECRET" https://TUO-SITO.vercel.app/api/cron/webmail-sync
```

---

## Parte D — Aruba (posta) — passo passo

### D1. Trova la casella
1. Vai su https://admin.aruba.it  
2. Entra con le tue credenziali Aruba  
3. Apri la sezione **Email**  
4. Scegli la casella commerciale (es. `commerciale@tuodominio.it`)

### D2. Password della casella
1. Se non la ricordi: **Reimposta password**  
2. Scrivila su un foglio (ti serve dopo nel gestionale)  
3. Non è la password del pannello Aruba se sono diverse

### D3. Tieni a mente questi numeri magici
- IMAP: `imaps.aruba.it` porta `993`  
- SMTP: `smtps.aruba.it` porta `465`  
- Username = indirizzo email completo  
- Password = quella della casella

---

## Parte E — Gmail (se usi anche Gmail) — passo passo

1. Apri https://myaccount.google.com/security  
2. Attiva **Verifica in due passaggi**  
3. Apri https://myaccount.google.com/apppasswords  
4. Crea App Password per “Mail” / “OpuntiaIndustry”  
5. Google ti dà **16 lettere**: quelle vanno nel gestionale (non la password Gmail normale)  
6. Host: IMAP `imap.gmail.com:993` · SMTP `smtp.gmail.com:465`

---

## Parte F — Nel gestionale Opuntia — passo passo

1. Apri il sito del gestionale e fai login  
2. Menu sinistra → **Commerciale** → **Webmail**  
3. Clicca **Collega casella**  
4. Scegli **Aruba** oppure **Gmail**  
5. Compila:
   - Etichetta (es. “Commerciale”)  
   - Email  
   - Username (= email)  
   - Password (Aruba casella **oppure** App Password Gmail)  
6. Clicca **Salva casella**  
   - Serve permesso **Amministrazione** o Superadmin  
7. Clicca **Sincronizza ora**  
8. Aspetta: devono comparire le mail  
9. Se vedi badge viola **Bozza AI** → apri la mail  
10. A sinistra mail ricevuta, a destra bozza → modifica se serve → **Invia email**

---

## Parte G — Checklist “ho finito?”

- [ ] Variabili su Vercel salvate  
- [ ] Redeploy fatto (spunta verde)  
- [ ] Password casella Aruba (o App Password Gmail) pronta  
- [ ] Casella collegata in Webmail  
- [ ] Sync ok (niente errore rosso sotto le caselle)  
- [ ] Almeno una mail in elenco  

Se qualcosa fallisce, copia **solo** il messaggio di errore (senza password) e mandamelo.

Guida tecnica lunga: `docs/WEBMAIL-COLLEGAMENTO-GMAIL-ARUBA.md`
