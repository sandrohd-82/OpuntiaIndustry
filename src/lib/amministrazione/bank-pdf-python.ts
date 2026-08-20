import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
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

/** Trova la root del monorepo (dove sta services/pdf-parser). */
function findProjectRoot(): string {
  const markers = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
  ];
  // Anche da questo file compilato (.next/server/chunks → risali)
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    markers.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  for (const root of markers) {
    if (
      existsSync(
        path.join(root, "services", "pdf-parser", "parse_bank_pdf.py")
      )
    ) {
      return root;
    }
  }
  return process.cwd();
}

type PythonLaunch = { exe: string; prefixArgs?: string[] };

function collectPythonLaunches(projectRoot: string): PythonLaunch[] {
  const launches: PythonLaunch[] = [];
  const seen = new Set<string>();

  const push = (exe: string, prefixArgs?: string[]) => {
    const key = `${exe}|${(prefixArgs ?? []).join(" ")}`;
    if (seen.has(key)) return;
    seen.add(key);
    launches.push({ exe, prefixArgs });
  };

  const env = process.env.BANK_PDF_PYTHON?.trim();
  if (env) {
    push(env);
  }

  const venvWin = path.join(
    projectRoot,
    "services",
    "pdf-parser",
    ".venv",
    "Scripts",
    "python.exe"
  );
  const venvUnix = path.join(
    projectRoot,
    "services",
    "pdf-parser",
    ".venv",
    "bin",
    "python"
  );
  if (existsSync(venvWin)) push(venvWin);
  if (existsSync(venvUnix)) push(venvUnix);

  if (process.platform === "win32") {
    // Launcher ufficiale Windows
    const pyLauncher = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "Python",
      "Launcher",
      "py.exe"
    );
    if (existsSync(pyLauncher)) push(pyLauncher, ["-3"]);

    // Installazioni tipiche
    const localPrograms = path.join(
      process.env.LOCALAPPDATA || "",
      "Programs",
      "Python"
    );
    if (existsSync(localPrograms)) {
      try {
        for (const name of readdirSync(localPrograms)) {
          if (!/^Python\d+/i.test(name)) continue;
          const exe = path.join(localPrograms, name, "python.exe");
          if (existsSync(exe)) push(exe);
        }
      } catch {
        /* ignore */
      }
    }

    push("py", ["-3"]);
  } else {
    push("python3");
    push("python");
  }

  return launches;
}

async function runPython(
  exe: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(exe, args, {
      cwd,
      env: process.env,
      windowsHide: true,
      shell: false,
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
      resolve({
        code: 127,
        stdout,
        stderr: `${err.message} (exe=${exe})`,
      });
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
  const projectRoot = findProjectRoot();
  const script = path.join(
    projectRoot,
    "services",
    "pdf-parser",
    "parse_bank_pdf.py"
  );
  if (!existsSync(script)) {
    throw new Error(
      `Script parser non trovato: ${script}. Controlla che esista services/pdf-parser.`
    );
  }

  const dir = await mkdtemp(path.join(tmpdir(), "opuntia-bank-pdf-"));
  const pdfPath = path.join(dir, "input.pdf");
  const excelPath = path.join(dir, "out.xlsx");
  const jsonPath = path.join(dir, "out.json");

  try {
    await writeFile(pdfPath, pdfBuffer);

    const scriptArgs = [script, pdfPath, "--stdout-json"];
    if (opts?.excel !== false) {
      scriptArgs.push("--excel", excelPath);
    }
    if (opts?.jsonFile !== false) {
      scriptArgs.push("--json", jsonPath);
    }

    const launches = collectPythonLaunches(projectRoot);
    const tried: string[] = [];
    let lastErr = "";

    for (const launch of launches) {
      const args = [...(launch.prefixArgs ?? []), ...scriptArgs];
      tried.push(`${launch.exe} ${args.slice(0, 2).join(" ")}…`);
      const { code, stdout, stderr } = await runPython(
        launch.exe,
        args,
        projectRoot
      );
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

    const venvHint = path.join(
      projectRoot,
      "services",
      "pdf-parser",
      ".venv",
      "Scripts",
      "python.exe"
    );
    throw new Error(
      `Python non disponibile per il parser PDF. ` +
        `Esegui in locale:\n` +
        `  cd services/pdf-parser\n` +
        `  py -3 -m venv .venv\n` +
        `  .\\.venv\\Scripts\\pip install -r requirements.txt\n` +
        `Oppure imposta BANK_PDF_PYTHON con il percorso di python.exe.\n` +
        `Root: ${projectRoot}\n` +
        `Venv atteso: ${venvHint} (esiste: ${existsSync(venvHint)})\n` +
        `Tentativi: ${tried.join(" | ")}\n` +
        `Dettaglio: ${lastErr.slice(0, 300)}`
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
