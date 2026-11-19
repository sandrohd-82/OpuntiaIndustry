type Attesa<T> = {
  resolve: (valore: T) => void;
  reject: (errore: unknown) => void;
};

type Slot<T> = {
  lavoro: () => Promise<T>;
  attese: Attesa<T>[];
  diNuovo: boolean;
};

/**
 * Letture di menu e badge: una sola esecuzione per chiave e al massimo
 * `maxConcurrenti` chiavi insieme. Una richiesta arrivata durante l'esecuzione
 * non parte in parallelo: aggiorna il lavoro e viene eseguita una volta dopo.
 */
export function creaLimitatore(maxConcurrenti: number) {
  let attivi = 0;
  const coda: Array<() => void> = [];
  const slot = new Map<string, Slot<unknown>>();

  function posto(): Promise<void> {
    if (attivi < maxConcurrenti) {
      attivi += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      coda.push(() => {
        attivi += 1;
        resolve();
      });
    });
  }

  function rilascia() {
    attivi -= 1;
    const prossimo = coda.shift();
    if (prossimo) prossimo();
  }

  async function ciclo(chiave: string): Promise<void> {
    const corrente = slot.get(chiave);
    if (!corrente) return;
    await posto();
    let valore: unknown;
    let errore: unknown = null;
    try {
      valore = await corrente.lavoro();
    } catch (err) {
      errore = err;
    } finally {
      rilascia();
    }
    if (!slot.has(chiave)) return;
    if (corrente.diNuovo) {
      corrente.diNuovo = false;
      await ciclo(chiave);
      return;
    }
    const attese = corrente.attese.splice(0);
    slot.delete(chiave);
    for (const attesa of attese) {
      if (errore) attesa.reject(errore);
      else attesa.resolve(valore);
    }
  }

  return function lettura<T>(chiave: string, lavoro: () => Promise<T>): Promise<T> {
    const esistente = slot.get(chiave) as Slot<T> | undefined;
    if (esistente) {
      esistente.lavoro = lavoro;
      esistente.diNuovo = true;
      return new Promise<T>((resolve, reject) => {
        esistente.attese.push({ resolve, reject });
      });
    }
    const creato: Slot<T> = { lavoro, attese: [], diNuovo: false };
    slot.set(chiave, creato as Slot<unknown>);
    const prima = new Promise<T>((resolve, reject) => {
      creato.attese.push({ resolve, reject });
    });
    void ciclo(chiave);
    return prima;
  };
}

export const MASSIME_LETTURE_SECONDARIE = 2;
export const letturaSecondaria = creaLimitatore(MASSIME_LETTURE_SECONDARIE);
