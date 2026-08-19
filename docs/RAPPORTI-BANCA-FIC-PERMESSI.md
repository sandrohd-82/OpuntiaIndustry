# Rapporti Banca — permesso Fatture in Cloud (403 NO_PERMISSION)

L’errore `No permission` / `NO_PERMISSION` su **Sincronizza** significa: il token `FIC_API_TOKEN` **non ha lo scope** della Prima nota.

## Scope obbligatori

| Scope | Perché |
|-------|--------|
| `cashbook:r` | Lettura movimenti / Prima nota (TS Pay → BCC) |
| `settings:r` | Lettura conti di pagamento (`/info/payment_accounts`) |

Gli scope fatture (`issued_documents.*`, `received_documents:r`) **non bastano** per i rapporti banca.

## Procedura (passo passo)

1. Apri [https://developers.fattureincloud.it](https://developers.fattureincloud.it) (o App connesse nel pannello FiC).
2. Seleziona l’app / integrazione usata da OpuntiaIndustry.
3. Nella sezione **Scopes / Permessi** attiva almeno:
   - **cashbook** → lettura (`cashbook:r`)
   - **settings** → lettura (`settings:r`) se presente
4. **Salva** e **rigenera** (o crea) un nuovo Access Token.
5. Copia il nuovo token.
6. Su **Vercel** → OpuntiaIndustry → **Settings** → **Environment Variables**:
   - aggiorna `FIC_API_TOKEN` con il nuovo valore (Production)
7. **Deployments** → ultimo → **Redeploy** (senza cache se possibile).
8. Nel gestionale: **Area Fiscale → Rapporti Banca → Sincronizza**.

## Se dopo lo scope compare ancora 403

- L’utente FiC del token è un **collaboratore**: in FiC → **Impostazioni → Utenti e permessi** abilita **Prima nota / Cashbook** per quell’utente.
- Controlla che `FIC_COMPANY_ID` sia l’azienda corretta (solo numeri).

Non serve modificare il codice: è solo configurazione del token.
