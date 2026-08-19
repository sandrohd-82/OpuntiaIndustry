# Collegamento caselle Webmail — Gmail e Aruba

Procedura operativa ISO 9001 per collegare caselle in **Commerciale → Webmail**.  
Le password sono cifrate a riposo (`WEBMAIL_ENCRYPTION_KEY`). L’AI crea **solo bozze**; l’invio richiede conferma operatore (`approved_by`, `sent_at`, `ai_generated`).

---

## 0. Prerequisiti comuni (OpuntiaIndustry)

1. Applica la migrazione `supabase/migrations/20260819160000_webmail_ai_iso9001.sql`.
2. In `.env.local` / Vercel:
   ```env
   WEBMAIL_ENCRYPTION_KEY=una-stringa-lunga-casuale
   WEBMAIL_AI_ENABLED=true
   WEBMAIL_SYNC_ENABLED=true
   OPENAI_API_KEY=sk-...          # opzionale: senza di essa usa classificatore euristico
   OPENAI_MODEL=gpt-4o-mini
   CRON_SECRET=stringa-segreta-cron
   ```
3. (Consigliato) Bucket Storage Supabase `prodotti-schede` per PDF schede tecniche; valorizzare `prodotti_propri.scheda_tecnica_path` e `prezzo_listino`.
4. Utente con area **Amministrazione** (o superadmin) per **Collega casella**; area **Commerciale** per lettura/revisione/invio.
5. Sync automatica: chiama ogni 5–15 minuti  
   `GET /api/cron/webmail-sync` con header `Authorization: Bearer $CRON_SECRET`  
   (Vercel Cron, GitHub Action, o scheduler Aruba).

Categorie di smistamento create dal sistema:

| Codice | Uso |
|--------|-----|
| `scheda_tecnica` | Richiesta scheda tecnica → allega PDF se in anagrafica |
| `preventivo_listino` | Preventivo/listino → testo con prezzi listino cooperativa |
| `ordine_lotto` | Info ordine/lotto |
| `generico` | Altro |
| `da_revisionare` | Confidence bassa |
| `scartate` | Spam / non pertinenti (nessuna bozza utile) |

---

## 1. Procedure esatte — Gmail / Google Workspace

### 1.1 Abilita verifica in 2 passaggi
1. Apri [https://myaccount.google.com/security](https://myaccount.google.com/security) con l’account della casella commerciale.
2. Sezione **Come accedere a Google** → **Verifica in due passaggi** → attivala (SMS o app Authenticator).

### 1.2 Crea una App Password (obbligatoria per IMAP/SMTP)
1. Vai a [https://myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)  
   (se non compare: verifica 2FA attiva e account non bloccato da policy Workspace).
2. **App**: seleziona **Mail**.  
   **Dispositivo**: seleziona **Altro** → scrivi `OpuntiaIndustry`.
3. Genera e **copia le 16 lettere** (es. `abcd efgh ijkl mnop`).  
   Questa è la password da inserire in Opuntia: **non** usare la password Google normale.

### 1.3 Parametri tecnici Gmail
| Campo | Valore |
|-------|--------|
| Provider in UI | `Gmail` |
| Email / Username | `tua@azienda.it` o `@gmail.com` |
| Password | App Password a 16 caratteri |
| IMAP | `imap.gmail.com` · porta `993` · SSL/TLS |
| SMTP | `smtp.gmail.com` · porta `465` · SSL (o `587` STARTTLS se custom) |

### 1.4 In OpuntiaIndustry
1. Menu **Commerciale → Webmail → Collega casella**.
2. Provider **Gmail** (host precompilati).
3. Incolla email + App Password → **Salva casella**.
4. **Sincronizza ora** e verifica che arrivino messaggi INBOX (ultimi 14 giorni).
5. Controlla badge **Bozza AI** e lo split ricevuta | bozza.

### 1.5 Google Workspace (azienda)
- L’admin Workspace deve consentire **Accesso IMAP** e **App password** (o OAuth dedicato in fase successiva).
- Se la policy blocca le App Password: chiedere all’admin di abilitarle per l’OU commerciale, oppure usare account dedicato con 2FA.

### 1.6 Troubleshooting Gmail
| Sintomo | Azione |
|---------|--------|
| `Invalid credentials` | Rigenera App Password; username = email completa |
| Sync vuota | Controlla che ci siano mail in INBOX recenti; cartelle “Promozioni” Gmail non sono INBOX |
| Blocco “Less secure” | Ignora: con App Password non serve “accesso app meno sicure” |

---

## 2. Procedure esatte — Aruba Email / PEC

> **Nota PEC:** l’invio commerciale verso clienti non-PEC usa di solito casella **Email ordinaria** Aruba. La PEC ha limiti di formato e destinatari; per AI commerciale preferire `@tuodominio.it` non-PEC.

### 2.1 Credenziali casella
1. Accedi a [https://admin.aruba.it](https://admin.aruba.it) (o pannello email del dominio).
2. Sezione **Email** → seleziona la casella (es. `commerciale@opuntiaindustry.com`).
3. Verifica/reimposta la **password della casella** (non la password account Aruba se diversa).
4. Abilita **accesso IMAP/POP/SMTP** se presente un toggle (di default attivo sui piani standard).

### 2.2 Parametri tecnici Aruba (email ordinaria)
| Campo | Valore |
|-------|--------|
| Provider in UI | `Aruba` |
| Email / Username | indirizzo completo della casella |
| Password | password casella |
| IMAP | `imaps.aruba.it` · porta `993` · SSL |
| SMTP | `smtps.aruba.it` · porta `465` · SSL |

Varianti documentate Aruba (se il preset non risponde):
- IMAP alternativo: `imap.aruba.it` / `993`
- SMTP alternativo: `smtp.aruba.it` / `465` o `587`

### 2.3 PEC Aruba (solo se necessario)
| Campo | Valore tipico |
|-------|----------------|
| IMAP | `imaps.pec.aruba.it` · `993` |
| SMTP | `smtps.pec.aruba.it` · `465` |
| Username | indirizzo PEC completo |

In UI scegli provider **Generico** e inserisci host PEC. Attenzione: allegati e risposte automatiche su PEC hanno vincoli normativi — usare con cautela.

### 2.4 In OpuntiaIndustry
1. **Commerciale → Webmail → Collega casella** → provider **Aruba**.
2. Email = username = casella completa; password casella.
3. Salva → **Sincronizza ora**.
4. Verifica categorie e bozze AI.

### 2.5 Troubleshooting Aruba
| Sintomo | Azione |
|---------|--------|
| Timeout TLS | Verifica firewall in uscita porte 993/465; prova host alternativi |
| Auth fail | Reimposta password casella dal pannello; evita caratteri speciali non escaped |
| Invio rifiutato | Controlla SPF/DKIM del dominio; mittente deve coincidere con la casella |

---

## 3. Sync automatica e flusso AI

1. **Cron** chiama `/api/cron/webmail-sync` → IMAP INBOX → mirror DB.
2. LLM (o euristica) assegna **intent** → categoria.
3. RAG su `prodotti_propri` (scheda PDF / prezzo listino).
4. Crea riga `webmail_bozze_ai` stato `bozza` + eventuale allegato.
5. Operatore rivede (split UI), modifica, **Invia email** → SMTP casella + `webmail_ai_elaborazioni` (`action=sent`, `ai_generated=true`, `approved_by`, `sent_at`).

---

## 4. Checklist go-live

- [ ] Migrazione applicata  
- [ ] Env: encryption, cron secret, OpenAI (opz.)  
- [ ] Almeno una casella Gmail **e/o** Aruba collegate e sync OK  
- [ ] Bucket `prodotti-schede` + almeno una scheda di test  
- [ ] Cron schedulato ogni 10 minuti  
- [ ] Test: mail finta “richiesta scheda tecnica X” → categoria + bozza + badge  
- [ ] Test invio con conferma → riga audit/elaborazione presente  
