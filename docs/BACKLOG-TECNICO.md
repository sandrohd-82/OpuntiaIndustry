# Backlog tecnico

Voci aperte. Non sono in corso.

## Prestazioni — Commerciale, Clienti, Scheda completa

Lavoro sospeso sul commit `9ff2ca5093ba`. La scheda usa una sola Server Action iniziale. Le voci sotto restano da affrontare in un intervento successivo.

1. **Coda globale delle Server Actions.** Next.js 15.5.18 esegue una sola azione alla volta. Un’azione già in coda resta davanti a `caricaSchedaCompletaInizialeAction` fino al completamento.
2. **Attesa prima dell’HTTP.** In produzione l’ultima apertura ha atteso 5.516 ms prima della richiesta del coordinatore e l’elenco clienti 2.212 ms prima della propria. Il responsabile di quelle attese non è ancora identificato. La diagnostica proposta per leggerlo non è stata implementata.
3. **Scansioni automatiche.** `listMiePromozioniAperteAction` alla prima entrata in commerciale o amministrazione, e `listFattureMailDaValutareAction` per il Super Admin reale, possono occupare la coda. Non vanno spostate su `/api/nav/controlli` senza un intervento dedicato: la scansione promozioni scrive, e l’elenco fatture mail aggiorna righe escluse.
4. **Polling Webmail.** I non letti restano una Server Action, ripetuta ogni 30 secondi quando il menu è aperto. L’elenco caselle usa già `GET /api/nav/letture?controllo=webmail-menu`.
5. **Ulteriori ottimizzazioni delle letture.** Prodotti, cancellazioni e contesto anagrafica partono ancora all’apertura di Clienti. Un rinvio senza ritardo fisso non è affidabile: la chiamata, una volta accodata, non si può togliere prima del clic sulla Scheda.
