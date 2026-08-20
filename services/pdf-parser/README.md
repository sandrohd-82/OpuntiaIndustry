# Parser PDF estratto conto (deterministico)

Conversione **PDF → Excel (.xlsx) / JSON** senza LLM, usando `pdfplumber` + regole colonna.

## Setup

```bash
cd services/pdf-parser
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
```

## CLI

```bash
python parse_bank_pdf.py percorso\estratto.pdf --excel out.xlsx --json out.json
```

Colonne output (fisse, allineate all’import CSV banca):

1. Data  
2. Data Valuta  
3. Uscite  
4. Entrate  
5. Causale  

## Test

```bash
python make_sample_pdf.py
python test_parse.py
```

## API Next.js

`POST /api/bank/pdf-parse` con `multipart/form-data` campo `file` (PDF).

Query:
- `format=json` (default) → JSON movimenti  
- `format=xlsx` → download Excel  
- `format=csv` → CSV 5 colonne (pronto per import Rapporti Banca)
