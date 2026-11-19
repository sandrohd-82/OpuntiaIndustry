import assert from "node:assert/strict";
import { creaLimitatore } from "./letture-secondarie";
import { classificaControlloNav } from "./controlli-nav";

function differita<T>() {
  let resolve: (valore: T) => void = () => undefined;
  const promise = new Promise<T>((fatto) => {
    resolve = fatto;
  });
  return { promise, resolve };
}

async function stessaChiaveNonSiSovrappone() {
  const lettura = creaLimitatore(2);
  const prima = differita<string>();
  const seconda = differita<string>();
  let corse = 0;
  const uno = lettura("badge", () => {
    corse += 1;
    return prima.promise;
  });
  await Promise.resolve();
  const due = lettura("badge", () => {
    corse += 1;
    return seconda.promise;
  });
  assert.equal(corse, 1);
  prima.resolve("vecchia");
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(corse, 2);
  seconda.resolve("nuova");
  assert.equal(await uno, "nuova");
  assert.equal(await due, "nuova");
}

async function laTerzaAttendeUnPosto() {
  const lettura = creaLimitatore(2);
  const blocchi = [differita<number>(), differita<number>(), differita<number>()];
  let partite = 0;
  const lavori = blocchi.map((blocco, indice) =>
    lettura(`chiave-${indice}`, () => {
      partite += 1;
      return blocco.promise;
    })
  );
  await Promise.resolve();
  assert.equal(partite, 2);
  blocchi[0]?.resolve(1);
  await lavori[0];
  await Promise.resolve();
  assert.equal(partite, 3);
  blocchi[1]?.resolve(2);
  blocchi[2]?.resolve(3);
  assert.deepEqual(await Promise.all(lavori), [1, 2, 3]);
}

async function controlli() {
  await stessaChiaveNonSiSovrappone();
  await laTerzaAttendeUnPosto();
  assert.equal(classificaControlloNav("notifiche-non-lette"), "get");
  assert.equal(classificaControlloNav("ticket-badge"), "get");
  assert.equal(classificaControlloNav("trello"), "post");
  assert.equal(classificaControlloNav("preventivi-spedizione"), "post");
  assert.equal(classificaControlloNav("bootstrap"), "post");
  assert.equal(classificaControlloNav("listClientiAction"), null);
  console.log("letture-secondarie: ok");
}

void controlli();
