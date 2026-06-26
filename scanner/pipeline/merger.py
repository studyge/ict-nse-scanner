
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent.parent

SCANNER=ROOT/"public/data/scanner_daily.json"

def get_row(symbol):

    if not SCANNER.exists():
        return None

    data=json.loads(SCANNER.read_text())

    for row in data.get("results",[]):
        if row.get("symbol","").upper()==symbol.upper():
            return row

    return None
