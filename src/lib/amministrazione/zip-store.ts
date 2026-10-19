function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c ^= data[i] ?? 0;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function header(
  signature: number,
  fields: number[],
  name: Uint8Array,
  extra?: Uint8Array
): Uint8Array {
  const bytes = new Uint8Array(4 + fields.length + name.length + (extra?.length ?? 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  fields.forEach((value, index) => {
    bytes[4 + index] = value & 0xff;
  });
  bytes.set(name, 4 + fields.length);
  if (extra) bytes.set(extra, 4 + fields.length + name.length);
  return bytes;
}

function le16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}

function le32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Zip senza compressione: un solo download con PDF e allegati. */
export function zipNonCompresso(
  files: Array<{ name: string; bytes: Uint8Array }>
): Blob {
  const locals: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name.replace(/[\\/]/g, "_"));
    const crc = crc32(file.bytes);
    const size = file.bytes.length;
    const local = header(
      0x04034b50,
      [
        ...le16(20),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le32(crc),
        ...le32(size),
        ...le32(size),
        ...le16(name.length),
        ...le16(0),
      ],
      name,
      file.bytes
    );
    locals.push(local);
    central.push(
      header(0x02014b50, [
        ...le16(20),
        ...le16(20),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le32(crc),
        ...le32(size),
        ...le32(size),
        ...le16(name.length),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le16(0),
        ...le32(0),
        ...le32(offset),
      ], name)
    );
    offset += local.length;
  }
  const centralBytes = concat(central);
  const end = header(0x06054b50, [
    ...le16(0),
    ...le16(0),
    ...le16(files.length),
    ...le16(files.length),
    ...le32(centralBytes.length),
    ...le32(offset),
    ...le16(0),
  ], new Uint8Array());
  const zip = concat([...locals, centralBytes, end]);
  return new Blob([zip as BlobPart], { type: "application/zip" });
}

export function scaricaBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
