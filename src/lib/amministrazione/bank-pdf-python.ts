import { spawn } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export type BankPdfParsedRow = {
  data: string;
  data_valuta: string;
  uscite: string;
  entrate: string;
  causale: string;
};

export type BankPdfParseResult = {
  ok: boolean;
  parser: string;
  openai: false;
  count: number;
  rows: BankPdfParsedRow[];
  tables_found?: number;
  error?: string;
};

function pythonCandidates(): string[] {
  const env = process.env.BANK_PDF_PYTHON?.trim();
  if (env) return [env];
  if (process.platform === "win32") {
    return [
      path.join(
        process.cwd(),
        "services",
        "pdf-parser",
        ".venv",
        "Scripts",
        "python.exe"
      ),
      "py",
      "python",
      "python3",
    ];
  }
  return [
    path.join(process.cwd(), "services", "pdf-parser", ".venv", "bin", "python"),
    "python3",
    "python",
  ];
}

async function runPython(
  exe: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      resolve({ code: 127, stdout, stderr: err.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

/**
 * Invoca services/pdf-parser/parse_bank_pdf.py in modo deterministico (niente LLM).
 */
export async function parseBankPdfDeterministic(
  pdfBuffer: Buffer,
  opts?: { excel?: boolean; jsonFile?: boolean }
): Promise<{
  result: BankPdfParseResult;
  excelBuffer?: Buffer;
  jsonBuffer?: Buffer;
}> {
  const script = path.join(
    process.cwd(),
    "services",
    "pdf-parser",
    "parse_bank_pdf.py"
  );
  const dir = await mkdtemp(path.join(tmpdir(), "opuntia-bank-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");
  const excelPath = path.join(dir, "out.xlsx");
  const jsonPath = path.join(dir, "out.json");

  try {
    await writeFile(pdfPath, pdfBuffer);

    const args = [script, pdfPath, "--stdout-json"];
    if (opts?.excel !== false) {
      args.push("--excel", excelPath);
    }
    if (opts?.jsonFile !== false) {
      args.push("--json", jsonPath);
    }

    let lastErr = "";
    for (const exe of pythonCandidates()) {
      const runArgs =
        exe === "py" ? ["-3", ...args] : args;
      const { code, stdout, stderr } = await runPython(exe, runArgs);
      lastErr = stderr || stdout;
      if (code === 127) continue;
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const jsonLine = [...lines].reverse().find((l) => l.startsWith("{"));
      if (!jsonLine) {
        if (code !== 0) continue;
        throw new Error(stderr || "Parser PDF senza output JSON.");
      }
      const parsed = JSON.parse(jsonLine) as BankPdfParseResult & {
        ok?: boolean;
        error?: string;
      };
      if (parsed.ok === false) {
        throw new Error(parsed.error || "Parsing PDF fallito.");
      }
      const result: BankPdfParseResult = {
        ok: true,
        parser: parsed.parser || "pdfplumber-deterministic-v1",
        openai: false,
        count: Number(parsed.count) || (parsed.rows?.length ?? 0),
        rows: parsed.rows ?? [],
        tables_found: parsed.tables_found,
      };

      let excelBuffer: Buffer | undefined;
      let jsonBuffer: Buffer | undefined;
      try {
        excelBuffer = await readFile(excelPath);
      } catch {
        /* optional */
      }
      try {
        jsonBuffer = await readFile(jsonPath);
      } catch {
        /* optional */
      }

      return { result, excelBuffer, jsonBuffer };
    }

    throw new Error(
      `Python non disponibile o parser fallito. Installa deps in services/pdf-parser. Dettaglio: ${lastErr.slice(0, 400)}`
    );
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** Converte righe parser → CSV 5 colonne per import banca esistente. */
export function bankPdfRowsToCsv(rows: BankPdfParsedRow[]): string {
  const esc = (s: string) => {
    const v = String(s ?? "");
    if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = ["Data;Data Valuta;Uscite;Entrate;Causale"];
  for (const r of rows) {
    // Output date in IT per coerenza CSV locale
    const dataIt = isoToIt(r.data);
    const valutaIt = r.data_valuta ? isoToIt(r.data_valuta) : "";
    lines.push(
      [dataIt, valutaIt, r.uscite, r.entrate, r.causale].map(esc).join(";")
    );
  }
  return lines.join("\n") + "\n";
}

function isoToIt(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}
