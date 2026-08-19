# Procedura ufficiale: abilitare Prima nota (cashbook) per Rapporti Banca

Fonte documentazione Fatture in Cloud (API V2):

- [Manual Authentication](https://developers.fattureincloud.it/docs/authentication/manual-authentication/)
- [Scopes](https://developers.fattureincloud.it/docs/basics/scopes/)
- [Company-scoped methods](https://developers.fattureincloud.it/docs/basics/company-scoped-methods/)
- [Debug / 403 Forbidden](https://developers.fattureincloud.it/docs/debug-your-integration/)
- [Errors – 403](https://developers.fattureincloud.it/docs/basics/errors/)

OpuntiaIndustry usa il token in `FIC_API_TOKEN` (Manual Authentication) e l’azienda in `FIC_COMPANY_ID`.

L’errore `403` con `NO_PERMISSION` su **Rapporti Banca** significa: il token **non include** lo scope **`cashbook:r`** (Prima nota), oppure l’utente FiC non ha il permesso Prima nota in **Utenti e permessi**.

---

## Parte 0 — Cosa serve prima di iniziare

1. Accesso come **amministratore** (o proprietario) all’account **Fatture in Cloud** della cooperativa.
2. Accesso a **Vercel** → progetto **OpuntiaIndustry** (per aggiornare le Environment Variables, se serve un token nuovo).
3. Sapere quale **Applicazione collegata** usate già per Opuntia (quella del token attuale).

Scope richiesti da Opuntia per Rapporti Banca (da [Scopes Toolbox](https://developers.fattureincloud.it/docs/basics/scopes/)):

| Scope ufficiale | Livello | Cosa abilita in italiano tipico nella UI |
|-----------------|---------|------------------------------------------|
| `cashbook` | **`r`** (sola lettura) | **Prima nota** / Cashbook |
| `settings` | **`r`** (consigliato) | **Impostazioni** (conti di pagamento) |

Livelli ufficiali: `:r` = Read-Only, `:a` = Full Write. Per noi basta **`r`**.

---

## Parte 1 — CASO A (consigliato): app già collegata → modifica i permessi

Documentazione ufficiale: sezione **«Change token permissions»** in  
[Manual Authentication](https://developers.fattureincloud.it/docs/authentication/manual-authentication/).

> Se cambi solo gli scope su un’app già collegata, **il token non viene rigenerato**: non serve ricopiare il token in Vercel. Dopo pochi istanti i nuovi permessi valgono sullo stesso token.

### Passi esatti

1. Apri il browser e vai su **Fatture in Cloud** (web app).
2. Accedi con l’utente che ha creato / gestisce l’integrazione.
3. Nel menu vai su:  
   **Impostazioni → Applicazioni collegate**  
   (in inglese nella doc: *Settings → Connected Applications*).
4. Nella lista trova l’applicazione usata da OpuntiaIndustry.
5. Clicca il pulsante **Gestisci** (*Manage*) accanto a quell’app.
6. Nella sezione dei **permessi / scope**, clicca **Modifica** (*Edit*).
7. Nella lista dei permessi, **spunta / abilita** almeno:
   - **Prima nota** / **Cashbook** → livello **Lettura** (`cashbook:r`)  
   - **Impostazioni** / **Settings** → livello **Lettura** (`settings:r`) — consigliato per i conti bancari
8. **Non togliere** gli scope che già usate per le fatture (es. documenti emessi/ricevuti, clienti, fornitori), altrimenti altre sync del gestionale possono smettere di funzionare.
9. Salva / conferma la modifica.
10. Aspetta **qualche minuto** (la doc dice: *“in a short time”* gli scope del token vengono aggiornati).
11. Nel gestionale Opuntia: **Area Fiscale → Rapporti Banca → Sincronizza**.

Se dopo 5–10 minuti la sync funziona: **hai finito**. Non serve toccare Vercel.

---

## Parte 2 — CASO B: l’app non c’è o vuoi creare un collegamento nuovo

Documentazione ufficiale: sezione **«Token generation»** in  
[Manual Authentication](https://developers.fattureincloud.it/docs/authentication/manual-authentication/).

### 2.1 Trova il Client ID dell’app (lato sviluppatore)

1. Apri [https://developers.fattureincloud.it](https://developers.fattureincloud.it) (area Sviluppatore).
2. Entra nella **pagina della tua Application**.
3. Nella sezione **Sviluppatore** copia il **Client ID**  
   (la doc: *“you can find it on your Application page, in the Sviluppatore section”*).

Se Opuntia usa già un’app privata, usa **quel** Client ID (non inventarne uno nuovo a caso).

### 2.2 Collega l’applicazione e genera il token

Passi ufficiali:

1. Accedi alla **web app Fatture in Cloud**.
2. Vai su **Impostazioni → Applicazioni collegate**.
3. Clicca **Collega una nuova applicazione** (*Connect a new application*).
4. Inserisci il **Client ID** copiato al punto 2.1.
5. Seleziona le **aziende** a cui l’app potrà accedere (scegli la cooperativa corretta).
6. Seleziona i **permessi (scope)** necessari, incluso obbligatoriamente:
   - `cashbook:r` (Prima nota – lettura)
   - `settings:r` (Impostazioni – lettura) consigliato  
   più tutti gli scope già usati dal gestionale per fatture/anagrafiche.
7. Copia l’**Access Token** mostrato.
8. Incolla il token in Opuntia come sotto (Parte 4).

---

## Parte 3 — Se sei un utente secondario (sub-user) e hai già gli scope ma resta 403

Documentazione ufficiale FAQ in [Scopes](https://developers.fattureincloud.it/docs/basics/scopes/):

> Se sei l’admin dell’azienda, gli scope sul token bastano.  
> Se sei un **sub-user**, l’admin deve anche assegnarti i permessi sulle risorse in  
> **Impostazioni → Utenti e permessi**.

Passi:

1. Accedi come **amministratore** FiC.
2. Vai su **Impostazioni → Utenti e permessi**.
3. Apri l’utente che ha generato / usa il token.
4. Abilita l’accesso alle risorse necessarie, in particolare quanto riguarda **Prima nota** (e documenti se già usati).
5. Salva.
6. Riprova **Sincronizza** in Rapporti Banca.

---

## Parte 4 — Dove mettere il token e il Company ID (solo se hai creato un token nuovo)

### 4.1 Company ID (obbligatorio)

Documentazione: [Company-scoped methods](https://developers.fattureincloud.it/docs/basics/company-scoped-methods/).

Modo più semplice (ufficiale):

1. Apri la web app Fatture in Cloud.
2. In **alto a sinistra**, accanto al **nome azienda**, trovi il **Company ID** (numero).
3. Confrontalo con `FIC_COMPANY_ID` su Vercel / `.env.local`: devono coincidere (solo cifre).

Alternativa API: metodo **List User Companies** (`GET /user/companies`) con Bearer token.

### 4.2 Aggiornare Vercel (solo CASO B / token nuovo)

1. Vai su https://vercel.com → progetto **OpuntiaIndustry**.
2. **Settings → Environment Variables**.
3. Variabile **`FIC_API_TOKEN`**:
   - Environment: **Production** (e Preview se usata)
   - Valore = Access Token copiato da FiC (**intero**, senza aggiungere a mano la parola `Bearer`: il gestionale la mette già)
4. Controlla **`FIC_COMPANY_ID`** = Company ID numerico.
5. Salva.
6. **Deployments** → sull’ultimo deploy: **⋯ → Redeploy**  
   (meglio senza “Use existing Build Cache”).
7. Aspetta la spunta verde.
8. Gestionali → **Area Fiscale → Rapporti Banca → Sincronizza**.

### 4.3 Aggiornare anche `.env.local` (solo se testi in locale)

Apri `.env.local` e imposta le stesse chiavi (non condividere il token in chat):

```env
FIC_API_TOKEN=il_tuo_access_token
FIC_COMPANY_ID=123456
```

Poi riavvia `npm run dev`.

---

## Parte 5 — Verifica ufficiale che lo scope funzioni

Documentazione: richiesta API con header  
`Authorization: Bearer ACCESS_TOKEN`  
([Manual Authentication – Perform an API request](https://developers.fattureincloud.it/docs/authentication/manual-authentication/)).

Endpoint usato da Opuntia per i rapporti banca:

`GET https://api-v2.fattureincloud.it/c/{company_id}/cashbook?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`

Esempio (sostituisci token, company_id e date; **non** mandare l’output in chat se contiene dati sensibili):

```bash
curl --request GET ^
  --url "https://api-v2.fattureincloud.it/c/TUO_COMPANY_ID/cashbook?date_from=2026-08-01&date_to=2026-08-19" ^
  --header "Accept: application/json" ^
  --header "Authorization: Bearer TUO_ACCESS_TOKEN"
```

- **200** → permessi ok; riprova sync nel gestionale.
- **403** + `NO_PERMISSION` → scope `cashbook` ancora assente, oppure utente senza Prima nota (Parte 1 o 3).
- **401** → token assente/errato o Company ID non coerente col token ([Debug](https://developers.fattureincloud.it/docs/debug-your-integration/)).

---

## Parte 6 — Checklist finale

- [ ] In **Applicazioni collegate** → **Gestisci** → **Modifica** → attivo **cashbook** lettura
- [ ] Attivo anche **settings** lettura (consigliato)
- [ ] Non ho rimosso gli scope fatture già usati
- [ ] Se sono sub-user: **Utenti e permessi** include Prima nota
- [ ] `FIC_COMPANY_ID` = ID in alto a sinistra in FiC
- [ ] Se ho creato un token **nuovo**: aggiornato `FIC_API_TOKEN` su Vercel + Redeploy
- [ ] Se ho solo **modificato** gli scope: **non** ho dovuto cambiare il token
- [ ] Sync Rapporti Banca ok (o curl cashbook = 200)

---

## Riferimenti ufficiali (link diretti)

1. Generazione / modifica token: https://developers.fattureincloud.it/docs/authentication/manual-authentication/  
2. Elenco scope (`cashbook`, `settings`, …): https://developers.fattureincloud.it/docs/basics/scopes/  
3. Company ID: https://developers.fattureincloud.it/docs/basics/company-scoped-methods/  
4. Significato 403: https://developers.fattureincloud.it/docs/basics/errors/  
5. Debug 401/403: https://developers.fattureincloud.it/docs/debug-your-integration/  
