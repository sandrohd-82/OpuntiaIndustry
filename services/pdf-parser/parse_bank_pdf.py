#!/usr/bin/env python3
"""
Parser deterministico estratto conto bancario PDF → Excel / JSON.
Nessun LLM: solo pdfplumber + regole colonna (Data, Valuta, Uscite, Entrate, Causale).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Optional

import pandas as pd
import pdfplumber

DATE_RE = re.compile(
    r"^(\d{1,2})[./\-](\d{1,2})[./\-](\d{2,4})$"
)
AMOUNT_RE = re.compile(
    r"^-?\d{1,3}(?:\.\d{3})*,\d{2}$|^-?\d+,\d{2}$|^-?\d+(?:\.\d+)?$"
)

SKIP_ROW_RE = re.compile(
    r"^(saldo|totale|totali|pagina|estratto|iban|abi|cab|"
    r"mov\.?\s*dare|mov\.?\s*avere|data\s*valuta|riepilogo|segue)\b",
    re.I,
)


@dataclass
class BankRow:
    data: str  # YYYY-MM-DD (ordinamento)
    data_valuta: str  # YYYY-MM-DD o ""
    uscite: str  # testo originale IT o ""
    entrate: str  # testo originale IT o ""
    causale: str


def parse_it_date(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s:
        return None
    if re.match(r"^\d{4}-\d{2}-\d{2}", s):
        return s[:10]
    m = DATE_RE.match(s)
    if not m:
        return None
    dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if yy < 100:
        yy += 2000
    try:
        return datetime(yy, mm, dd).strftime("%Y-%m-%d")
    except ValueError:
        return None


def is_amount(raw: Any) -> bool:
    if raw is None:
        return False
    s = str(raw).replace("\u00a0", " ").replace("€", "").replace("EUR", "").strip()
    if not s:
        return False
    return bool(AMOUNT_RE.match(s.replace(" ", "")))


def normalize_amount_cell(raw: Any) -> str:
    if raw is None:
        return ""
    s = str(raw).replace("\u00a0", " ").replace("€", "").replace("EUR", "").strip()
    return s if is_amount(s) else ""


def cell_str(raw: Any) -> str:
    if raw is None:
        return ""
    return str(raw).replace("\u00a0", " ").strip()


def score_header_map(headers: list[str]) -> dict[str, int]:
    """Mappa nome logico → indice colonna."""
    norm = [
        re.sub(r"[^a-z0-9]+", " ", (h or "").lower()).strip() for h in headers
    ]
    mapping: dict[str, int] = {}
    for i, n in enumerate(norm):
        if "data" in n and "valuta" in n and "data" not in mapping:
            mapping["valuta"] = i
        elif n in ("data", "data contabile", "data esecuzione", "data operazione") or (
            n.startswith("data") and "valuta" not in n and "data" not in mapping
        ):
            mapping["data"] = i
        elif n in ("valuta", "data valuta") or ("valuta" in n and "valuta" not in mapping):
            mapping["valuta"] = i
        elif any(
            k in n
            for k in ("uscite", "uscita", "dare", "addebito", "withdraw")
        ) and "uscite" not in mapping:
            mapping["uscite"] = i
        elif any(
            k in n
            for k in ("entrate", "entrata", "avere", "accredito", "deposit")
        ) and "entrate" not in mapping:
            mapping["entrate"] = i
        elif any(
            k in n for k in ("causale", "descrizione", "dettaglio", "narrative")
        ) and "causale" not in mapping:
            mapping["causale"] = i
    return mapping


def row_from_mapped(cells: list[Any], mapping: dict[str, int]) -> Optional[BankRow]:
    def get(key: str) -> str:
        idx = mapping.get(key)
        if idx is None or idx >= len(cells):
            return ""
        return cell_str(cells[idx])

    data_raw = get("data")
    if not data_raw:
        # fallback: prima cella data-like
        for c in cells:
            if parse_it_date(c):
                data_raw = cell_str(c)
                break
    iso = parse_it_date(data_raw)
    if not iso:
        return None

    valuta_raw = get("valuta")
    valuta_iso = parse_it_date(valuta_raw) or ""

    uscite = normalize_amount_cell(get("uscite"))
    entrate = normalize_amount_cell(get("entrate"))

    causale = get("causale")
    if not causale:
        # unisci celle non-data/non-importo
        parts = []
        for c in cells:
            cs = cell_str(c)
            if not cs or parse_it_date(cs) or is_amount(cs):
                continue
            parts.append(cs)
        causale = " ".join(parts)

    if SKIP_ROW_RE.search(causale) and not uscite and not entrate:
        return None

    return BankRow(
        data=iso,
        data_valuta=valuta_iso,
        uscite=uscite,
        entrate=entrate,
        causale=causale,
    )


def row_from_positional(cells: list[Any]) -> Optional[BankRow]:
    """Schema fisso 5 colonne: Data | Valuta | Uscite | Entrate | Causale."""
    padded = list(cells) + [""] * 5
    data_raw = cell_str(padded[0])
    iso = parse_it_date(data_raw)
    if not iso:
        return None
    valuta_iso = parse_it_date(padded[1]) or ""
    uscite = normalize_amount_cell(padded[2])
    entrate = normalize_amount_cell(padded[3])
    causale = cell_str(padded[4])
    return BankRow(
        data=iso,
        data_valuta=valuta_iso,
        uscite=uscite,
        entrate=entrate,
        causale=causale,
    )


def infer_from_loose_row(cells: list[Any]) -> Optional[BankRow]:
    """Riga senza header: date + importi + resto causale."""
    texts = [cell_str(c) for c in cells if cell_str(c)]
    if not texts:
        return None
    dates = [parse_it_date(t) for t in texts if parse_it_date(t)]
    if not dates:
        return None
    amounts = [t for t in texts if is_amount(t)]
    causale_parts = [
        t for t in texts if not parse_it_date(t) and not is_amount(t)
    ]
    causale = " ".join(causale_parts)
    if SKIP_ROW_RE.search(causale) and not amounts:
        return None

    # Se un solo importo: senza colonna chiara → uscite se testo tipico, else vuoto entrambi? 
    # Deterministico: 1° amount → uscite se presente "dare" nel row, altrimenti se 2 amount: 1 uscite 2 entrate
    uscite, entrate = "", ""
    if len(amounts) >= 2:
        uscite, entrate = amounts[0], amounts[1]
    elif len(amounts) == 1:
        # Heuristica leggera ma deterministica: se c'è solo un importo e parole di entrata → entrate
        blob = causale.lower()
        if re.search(r"\b(storno|accred|avere|incasso|bonifico\s+da)\b", blob):
            entrate = amounts[0]
        else:
            uscite = amounts[0]

    return BankRow(
        data=dates[0] or "",
        data_valuta=dates[1] if len(dates) > 1 else (dates[0] or ""),
        uscite=uscite,
        entrate=entrate,
        causale=causale,
    )


def extract_tables(pdf_path: Path) -> list[list[list[Any]]]:
    tables: list[list[list[Any]]] = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            # Strategie multiple: default + linee
            found = page.extract_tables() or []
            if not found:
                found = (
                    page.extract_tables(
                        table_settings={
                            "vertical_strategy": "text",
                            "horizontal_strategy": "text",
                            "snap_tolerance": 4,
                            "intersection_tolerance": 4,
                        }
                    )
                    or []
                )
            for t in found:
                if t and len(t) >= 2:
                    tables.append(t)
    return tables


def tables_to_rows(tables: Iterable[list[list[Any]]]) -> list[BankRow]:
    rows: list[BankRow] = []
    seen: set[str] = set()

    for table in tables:
        if not table:
            continue
        header = [cell_str(c) for c in table[0]]
        mapping = score_header_map(header)
        start = 1 if len(mapping) >= 2 else 0

        for raw_row in table[start:]:
            cells = list(raw_row or [])
            bank: Optional[BankRow] = None
            if len(mapping) >= 2:
                bank = row_from_mapped(cells, mapping)
            if bank is None and len(cells) >= 5 and parse_it_date(cells[0]):
                bank = row_from_positional(cells)
            if bank is None:
                bank = infer_from_loose_row(cells)
            if bank is None:
                continue
            key = f"{bank.data}|{bank.uscite}|{bank.entrate}|{bank.causale[:80]}"
            if key in seen:
                continue
            seen.add(key)
            rows.append(bank)

    rows.sort(key=lambda r: (r.data, r.data_valuta, r.causale))
    return rows


def rows_to_dataframe(rows: list[BankRow]) -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "Data": r.data,
                "Data Valuta": r.data_valuta,
                "Uscite": r.uscite,
                "Entrate": r.entrate,
                "Causale": r.causale,
            }
            for r in rows
        ]
    )


def write_excel(df: pd.DataFrame, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out_path, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Movimenti")
        ws = writer.sheets["Movimenti"]
        for col in ws.columns:
            max_len = 12
            for cell in col:
                max_len = max(max_len, len(str(cell.value or "")))
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 60)


def write_json(rows: list[BankRow], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "parser": "pdfplumber-deterministic-v1",
        "openai": False,
        "count": len(rows),
        "rows": [asdict(r) for r in rows],
    }
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def parse_bank_pdf(
    pdf_path: Path,
    *,
    excel_out: Optional[Path] = None,
    json_out: Optional[Path] = None,
) -> dict[str, Any]:
    if not pdf_path.is_file():
        raise FileNotFoundError(f"PDF non trovato: {pdf_path}")

    tables = extract_tables(pdf_path)
    rows = tables_to_rows(tables)
    df = rows_to_dataframe(rows)

    result: dict[str, Any] = {
        "ok": True,
        "parser": "pdfplumber-deterministic-v1",
        "openai": False,
        "pdf": str(pdf_path),
        "tables_found": len(tables),
        "count": len(rows),
        "rows": [asdict(r) for r in rows],
        "excel": None,
        "json": None,
    }

    if excel_out:
        write_excel(df, excel_out)
        result["excel"] = str(excel_out)
    if json_out:
        write_json(rows, json_out)
        result["json"] = str(json_out)

    # Se nessuno output file: stampa JSON su stdout (per API)
    if not excel_out and not json_out:
        print(json.dumps(result, ensure_ascii=False))

    return result


def main(argv: Optional[list[str]] = None) -> int:
    p = argparse.ArgumentParser(
        description="Converte estratto conto PDF → Excel/JSON (deterministico)"
    )
    p.add_argument("pdf", type=Path, help="Percorso PDF estratto conto")
    p.add_argument(
        "--excel",
        type=Path,
        default=None,
        help="Output .xlsx (5 colonne: Data, Data Valuta, Uscite, Entrate, Causale)",
    )
    p.add_argument("--json", type=Path, default=None, help="Output .json")
    p.add_argument(
        "--stdout-json",
        action="store_true",
        help="Stampa sempre il JSON risultato su stdout",
    )
    args = p.parse_args(argv)

    try:
        result = parse_bank_pdf(args.pdf, excel_out=args.excel, json_out=args.json)
        if args.stdout_json and (args.excel or args.json):
            print(json.dumps(result, ensure_ascii=False))
        if result["count"] == 0:
            print(
                "ATTENZIONE: 0 movimenti estratti. Verifica layout PDF.",
                file=sys.stderr,
            )
            return 2
        return 0
    except Exception as e:
        err = {"ok": False, "error": str(e), "openai": False}
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
