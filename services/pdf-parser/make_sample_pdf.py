#!/usr/bin/env python3
"""Genera un PDF di test (estratto conto tabellare) per il parser deterministico."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet


def main() -> None:
    out = Path(__file__).resolve().parent / "fixtures" / "estratto_conto_sample.pdf"
    out.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(out), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm)
    data = [
        ["Data", "Data Valuta", "Uscite", "Entrate", "Causale"],
        ["16/07/2025", "16/07/2025", "25,28", "", "PAGAMENTO FORNITORE XYZ"],
        ["17/07/2025", "17/07/2025", "", "1.234,56", "Storno commissioni"],
        ["18/07/2025", "18/07/2025", "100,00", "", "Bonifico a Gatti Davide"],
        ["19/07/2025", "19/07/2025", "", "280,00", "Bonifico a vs favore Cliente SPA"],
        ["20/07/2025", "20/07/2025", "15,50", "", "Interessi e competenze"],
    ]
    table = Table(data, colWidths=[28 * mm, 28 * mm, 25 * mm, 25 * mm, 70 * mm])
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e2e8f0")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    story = [
        Paragraph("Estratto conto di prova — BCC Sample", styles["Title"]),
        Spacer(1, 8 * mm),
        table,
    ]
    doc.build(story)
    print(f"OK: creato {out}")


if __name__ == "__main__":
    main()
