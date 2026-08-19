# Rapporti Banca ↔ Fatture in Cloud: fattibilità API (studio ufficiale)

Studio basato sulla documentazione **API V2 ufficiale** TeamSystem / Fatture in Cloud e sul prodotto TS Pay.

Fonti principali:

- [Common Terms – Cashbook Entry](https://developers.fattureincloud.it/docs/basics/common-terms/)
- [Scopes](https://developers.fattureincloud.it/docs/basics/scopes/) (`cashbook`, `settings`, documenti)
- [CashbookApi](https://github.com/fattureincloud/fattureincloud-js-sdk/blob/master/docs/CashbookApi.md) (`GET/POST/PUT/DELETE /c/{company_id}/cashbook`)
- [Customize Response – fieldset](https://developers.fattureincloud.it/docs/basics/customize-response/) (CashbookEntry, IssuedDocument.payments_list, PaymentAccount)
- [Riconciliazione bancaria FiC (prodotto)](https://www.fattureincloud.it/software-fatturazione/riconciliazione/)
- [TS Pay – integrazione gestionali esterni](https://www.teamsystem.com/fintech/ts-pay/offerta/integrazione-gestionali-esterni/)

---

## 1. Cosa volete voi

Un report di **movimenti del conto BCC Don Rizzo / TS Pay**: elenco completo (entrate/uscite), confronto con fatture, stampa ISO.

In pratica: **estratto conto / feed bancario**, non solo “prima nota già registrata”.

---

## 2. Cosa espone davvero l’API Fatture in Cloud V2

Nell’elenco ufficiale degli **scope** e delle risorse API **non esiste** un endpoint tipo:

- `/bank_transactions`
- `/ts_pay/movements`
- `/statements`
- `/open_banking/...`

Esistono invece queste risorse rilevanti:

| Risorsa API | Endpoint tipico | Cosa è | Cosa NON è |
|-------------|-----------------|--------|------------|
| **Cashbook Entry** (Prima nota) | `GET /c/{id}/cashbook?date_from&date_to` | Movimenti **già registrati** in Prima nota (salvati) | Estratto conto live della banca |
| **Payment Account** | `GET /c/{id}/info/payment_accounts` | Anagrafica conti (nome, IBAN, tipo) | Nessun movimento |
| **Issued / Received Document** + `payments_list` | documenti con `fieldset=detailed` | Rate/scadenze/pagamenti **del documento** (`paid` / `not_paid`, importo, conto) | Righe di estratto conto bancario |
| **Receipts** (Corrispettivi) | `/receipts` | Registro corrispettivi | Banca |
| **Archive** | `/archive` | Allegati/documenti archivio | Banca |

Definizione ufficiale Cashbook Entry:

> *“An entry in the cashbook, describing a single inbound or outbound transaction.”*

Quindi: **solo ciò che FiC ha salvato come riga di Prima nota**.

---

## 3. Cosa fa la UI di Fatture in Cloud (TS Pay) vs API

Dal prodotto FiC “Riconciliazione bancaria”:

1. Colleghi il conto via **TS Pay** (Open Banking / PSD2).
2. In UI vedi i movimenti (spesso aggiornati “al momento” dalla banca).
3. L’AI / utente **conferma** la riconciliazione.
4. Solo allora il movimento viene **registrato in Prima nota**.

Questo spiega il comportamento che osservi:

- In schermata FiC vedi molti movimenti (feed TS Pay / banca).
- Via API `GET /cashbook` ne vedi **pochi o uno**: sono solo quelli **già scritti** in Prima nota.
- I movimenti “solo visualizzati” per riconciliare **non sono una risorsa API pubblica** di Fatture in Cloud.

TS Pay, come prodotto separato, dichiara API proprie per “monitoraggio saldi e movimenti in tempo reale” per gestionali esterni — ma sono le **API TS Pay / TeamSystem Payments**, non l’API V2 documentata in `developers.fattureincloud.it`.

---

## 4. Verdetto di fattibilità

| Obiettivo | Con sola API FiC V2 | Come |
|-----------|---------------------|------|
| Elenco Prima nota (movimenti **registrati**) | **Sì** | `GET /cashbook` + scope `cashbook:r` |
| Conti (BCC, cassa, …) | **Sì** | `GET /info/payment_accounts` + `settings:r` |
| Pagamenti indicati sulle fatture | **Sì** | Documenti `fieldset=detailed` → `payments_list` |
| Estratto conto completo BCC/TS Pay come in UI FiC | **No** (non documentato in FiC API V2) | Serve altro canale (sotto) |
| Riconciliazione automatica fattura ↔ movimento | **Parziale** | Solo su cashbook + payments_list già presenti |

**Conclusione:** con il solo token Fatture in Cloud **non si può** replicare l’estratto conto live che vedi in FiC. Si può lavorare solo su dati **persistiti** (Prima nota + pagamenti documenti).

---

## 5. Opzioni realistiche per OpuntiaIndustry

### Opzione A — Restare su FiC API (limite chiaro)
- Sync **cashbook** + **payments_list** documenti (già implementato).
- Processo operativo: in FiC, dopo riconciliazione TS Pay, **confermare** così i movimenti finiscono in Prima nota; poi sync Opuntia.
- Pro: nessun contratto nuovo. Contro: dipende da quanta Prima nota compilate.

### Opzione B — Import estratto conto (CSV/XLS/XLSX)
- Come fa FiC in alternativa al collegamento live: carichi il file banca in Opuntia.
- Pro: tutti i movimenti, controllo ISO (versione file, chi ha caricato, audit). Contro: passo manuale o schedulato.

### Opzione C — API TS Pay / Open Banking (TeamSystem Payments)
- Integrazione diretta al feed conti (documentazione sul portale sviluppatori TS Pay, non su developers.fattureincloud.it).
- Pro: movimenti “come in banca”. Contro: onboarding/contratto TeamSystem, OAuth PSD2, complessità.

### Opzione D — Ibrido consigliato per ISO 9001
- **Fonte primaria:** import file banca o (se disponibile) TS Pay API.
- **Fonte secondaria:** cashbook + payments_list FiC per abbinamento fatture.
- Audit su ogni sync/import; soft delete; match manuale tracciato.

---

## 6. Cosa fare subito (operativo FiC)

Per massimizzare i dati via API **senza** TS Pay API:

1. In FiC apri **Prima nota** e confronta quante righe ci sono nel periodo (non la schermata riconciliazione live).
2. Completa le riconciliazioni TS Pay → conferma: devono nascere righe in Prima nota.
3. Oppure registra i saldi documenti (fattura → pagata) così `payments_list` si valorizza.
4. Solo dopo, in Opuntia: **Sincronizza** sul periodo.

Se Prima nota ha 1 riga e Opuntia mostra 1 riga, l’API sta funzionando correttamente: **non c’è altro da scaricare da FiC**.

---

## 7. Domanda di conferma

Quale strada vuoi per Opuntia?

- **A** — solo FiC (cashbook + pagamenti documenti) + procedura operativa di conferma in Prima nota  
- **B** — upload estratto conto CSV/XLS in Area Fiscale  
- **C** — avvio integrazione TS Pay API (serve disponibilità commerciale TeamSystem)  
- **D** — ibrido B + A (consigliato)
