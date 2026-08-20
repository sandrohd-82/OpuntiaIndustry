#!/usr/bin/env python3
"""Test end-to-end del parser su fixtures/estratto_conto_sample.pdf."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SAMPLE = ROOT / "fixtures" / "estratto_conto_sample.pdf"
OUT_XLSX = ROOT / "fixtures" / "estratto_conto_sample.xlsx"
OUT_JSON = ROOT / "fixtures" / "estratto_conto_sample.json"


def main() -> int:
    if not SAMPLE.is_file():
        subprocess.check_call([sys.executable, str(ROOT / "make_sample_pdf.py")])

    cmd = [
        sys.executable,
        str(ROOT / "parse_bank_pdf.py"),
        str(SAMPLE),
        "--excel",
        str(OUT_XLSX),
        "--json",
        str(OUT_JSON),
        "--stdout-json",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    if proc.returncode not in (0, 2):
        print(proc.stderr or proc.stdout, file=sys.stderr)
        return proc.returncode

    # Ultima riga stdout = JSON
    lines = [l for l in (proc.stdout or "").splitlines() if l.strip()]
    payload = json.loads(lines[-1])
    assert payload.get("ok") is True, payload
    assert payload.get("openai") is False
    assert payload.get("count", 0) >= 5, payload
    rows = payload["rows"]
    assert rows[0]["data"] == "2025-07-16"
    assert rows[0]["uscite"] == "25,28"
    assert rows[1]["entrate"] == "1.234,56"
    assert OUT_XLSX.is_file(), "xlsx mancante"
    assert OUT_JSON.is_file(), "json mancante"
    print(f"OK: {payload['count']} movimenti, excel={OUT_XLSX.name}, json={OUT_JSON.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
