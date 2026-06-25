"""
Phase 18 reusable chunked scanner exporter.

Usage:
python scanner/export_chunked_scanner.py \
  --input public/data/scanner_daily.json \
  --timeframe 1D \
  --page-size 50
"""

from pathlib import Path
import argparse
import json
import math
from datetime import datetime, timezone


FUTURE_TIMEFRAMES = ["1D", "4H", "1H", "15m", "5m", "3m", "1m"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input scanner summary JSON")
    parser.add_argument("--timeframe", required=True, help="Example: 1D, 1H, 5m")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--output-root", default="public/data/scanner")
    args = parser.parse_args()

    source_file = Path(args.input)
    output_dir = Path(args.output_root) / args.timeframe

    if args.page_size < 1:
        raise ValueError("--page-size must be at least 1")

    source = json.loads(source_file.read_text())
    results = source.get("results", [])

    if not isinstance(results, list):
        raise ValueError("Input JSON must contain a results list")

    output_dir.mkdir(parents=True, exist_ok=True)

    # Remove old generated pages for this timeframe.
    for old_page in output_dir.glob("scanner_page_*.json"):
        old_page.unlink()

    total_pages = max(1, math.ceil(len(results) / args.page_size))

    for page_no in range(1, total_pages + 1):
        start = (page_no - 1) * args.page_size
        end = start + args.page_size
        rows = results[start:end]

        payload = {
            "schema_version": 1,
            "timeframe": args.timeframe,
            "page": page_no,
            "page_size": args.page_size,
            "count": len(rows),
            "results": rows,
        }

        (output_dir / f"scanner_page_{page_no:03d}.json").write_text(
            json.dumps(payload, indent=2)
        )

    manifest = {
        "schema_version": 1,
        "generated_at": source.get("generated_at") or datetime.now(timezone.utc).isoformat(),
        "timeframe": args.timeframe,
        "page_size": args.page_size,
        "total_symbols": len(results),
        "total_pages": total_pages,
        "pages": [
            {"page": page_no, "file": f"scanner_page_{page_no:03d}.json"}
            for page_no in range(1, total_pages + 1)
        ],
        "future_timeframes": FUTURE_TIMEFRAMES,
    }

    (output_dir / "scanner_manifest.json").write_text(
        json.dumps(manifest, indent=2)
    )

    print(f"✓ Exported {len(results)} symbols")
    print(f"✓ Timeframe: {args.timeframe}")
    print(f"✓ Pages: {total_pages}")
    print(f"✓ Output: {output_dir}")


if __name__ == "__main__":
    main()
