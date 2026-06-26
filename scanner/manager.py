
from pathlib import Path
import argparse
import json

from pipeline.exporter import export
from pipeline.validator import exported_file
from pipeline.scanner import scan
from pipeline.merger import get_row

ROOT=Path(__file__).resolve().parent.parent
UNIVERSE=ROOT/"scanner/universe/nse_symbols.json"

def load(limit):

    data=json.loads(UNIVERSE.read_text())

    s=[x.strip().upper() for x in data["symbols"]]

    return s[:limit]

def main():

    p=argparse.ArgumentParser()

    p.add_argument("--limit",type=int,default=10)

    p.add_argument("--timeframe",default="1D")

    args=p.parse_args()

    rows=[]

    symbols=load(args.limit)

    OUTPUT=ROOT/"public/data/scanner_daily.json"

    print("="*60)
    print("ICT BACKEND v2")
    print("="*60)

    for symbol in symbols:

        print("\n",symbol)

        if not export(symbol,args.timeframe):
            print("EXPORT FAILED")
            continue

        ok,file=exported_file(symbol,args.timeframe)

        if not ok:
            print("JSON MISSING")
            continue

        print("✓",file.name)

        if not scan(symbol,args.timeframe):
            print("SCAN FAILED")
            continue

        row=get_row(symbol)

        if row is None:
            print("NO ROW")
            continue

        rows.append(row)

        print("✓ SCORE",row.get("score"))

    import json
    from datetime import datetime, timezone

    payload={
        "generated_at":datetime.now(timezone.utc).isoformat(),
        "timeframe":args.timeframe,
        "results":rows
    }

    OUTPUT.write_text(
        json.dumps(payload,indent=2)
    )


    print("\n"+"="*60)
    print("VALID ROWS",len(rows))

    import subprocess
    import sys

    print("\nBuilding chunked scanner pages...")

    chunk_export = subprocess.run(
        [
            sys.executable,
            str(ROOT/"scanner/export_chunked_scanner.py"),
            "--input",
            str(OUTPUT),
            "--timeframe",
            args.timeframe,
            "--page-size",
            "50"
        ],
        cwd=str(ROOT)
    )

    if chunk_export.returncode == 0:
        print("✓ Scanner pages generated")
    else:
        print("✗ Scanner page generation failed")


if __name__=="__main__":
    main()
