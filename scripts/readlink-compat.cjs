const fs = require("fs");

function comeFile(errore) {
  if (!errore || errore.code !== "EISDIR") return errore;
  const sostituto = new Error("EINVAL: invalid argument, readlink");
  sostituto.code = "EINVAL";
  sostituto.syscall = "readlink";
  return sostituto;
}

const readlinkSync = fs.readlinkSync;
fs.readlinkSync = function readlinkSyncCompatto(percorso, opzioni) {
  try {
    return readlinkSync.call(fs, percorso, opzioni);
  } catch (errore) {
    throw comeFile(errore);
  }
};

const readlink = fs.readlink;
fs.readlink = function readlinkCompatto(percorso, opzioni, callback) {
  const fine = typeof opzioni === "function" ? opzioni : callback;
  const opts = typeof opzioni === "function" ? undefined : opzioni;
  return readlink.call(fs, percorso, opts, (errore, link) => {
    fine(comeFile(errore), link);
  });
};

const readlinkPromise = fs.promises.readlink.bind(fs.promises);
fs.promises.readlink = async function readlinkPromiseCompatto(percorso, opzioni) {
  try {
    return await readlinkPromise(percorso, opzioni);
  } catch (errore) {
    throw comeFile(errore);
  }
};
