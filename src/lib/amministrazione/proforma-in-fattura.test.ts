import assert from "node:assert/strict";
import { decisioneConversioneProforma } from "./proforma-in-fattura";

const possibile = {
  cliente_id: null,
  cliente_possibile_id: "11111111-1111-1111-1111-111111111111",
};

const riusa = decisioneConversioneProforma({
  proforma: possibile,
  fatturaEsistente: {
    id: "22222222-2222-2222-2222-222222222222",
    cliente_id: null,
    cliente_possibile_id: possibile.cliente_possibile_id,
  },
});
assert.equal(riusa.azione, "riusa");
if (riusa.azione === "riusa") {
  assert.equal(riusa.fatturaId, "22222222-2222-2222-2222-222222222222");
  assert.equal(riusa.completaIntestatario, null);
}

const crea = decisioneConversioneProforma({
  proforma: possibile,
  fatturaEsistente: null,
});
assert.equal(crea.azione, "crea");
if (crea.azione === "crea") {
  assert.equal(crea.intestatario.clienteId, null);
  assert.equal(
    crea.intestatario.possibileClienteId,
    possibile.cliente_possibile_id
  );
}

const rifiuta = decisioneConversioneProforma({
  proforma: { cliente_id: null, cliente_possibile_id: null },
  ordine: { cliente_id: "", cliente_possibile_id: null },
  fatturaEsistente: null,
});
assert.equal(rifiuta.azione, "rifiuta");

const completa = decisioneConversioneProforma({
  proforma: possibile,
  fatturaEsistente: {
    id: "33333333-3333-3333-3333-333333333333",
    cliente_id: null,
    cliente_possibile_id: null,
  },
});
assert.equal(completa.azione, "riusa");
if (completa.azione === "riusa") {
  assert.equal(
    completa.completaIntestatario?.possibileClienteId,
    possibile.cliente_possibile_id
  );
}

console.log("proforma-in-fattura: ok");
