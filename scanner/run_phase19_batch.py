"""
Phase 19 — NSE batch scanner runner.

Safe test:
python scanner/run_phase19_batch.py --timeframe 1D --limit 50

Important:
- This runner does NOT touch app/page.js or app/style.css.
- It calls your existing Phase 14 scanner runner once per symbol.
- It writes a success/failure report.
- It rebuilds chunked scanner pages after valid results are collected.
"""

from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone


ROOT = Path(__file__).resolve().parent.parent
UNIVERSE_FILE = ROOT / "scanner" / "universe" / "nse_symbols.json"
REPORT_DIR = ROOT / "public" / "data" / "reports"
EXPORTER = ROOT / "scanner" / "export_chunked_scanner.py"
FINAL_DAILY = ROOT / "public" / "data" / "scanner_daily.json"

# Existing Phase 14 runner candidates.
RUNNER_CANDIDATES = [
    ROOT / "scanner" / "run_phase14_pine_scanner.py",
    ROOT / "scanner" / "run_phase14_scanner.py",
    ROOT / "scanner" / "run_phase14a_scanner.py",
    ROOT / "scanner" / "run_phase14.py",
]


def find_existing_runner():
    for path in RUNNER_CANDIDATES:
        if path.exists():
            return path
    return None


def read_json(path, default=None):
    try:
        return json.loads(path.read_text())
    except Exception:
        return default


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeframe", default="1D")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--pause", type=float, default=1.0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.limit < 1:
        raise ValueError("--limit must be at least 1")

    universe = read_json(UNIVERSE_FILE, {})
    symbols = universe.get("symbols", [])

    if not isinstance(symbols, list) or not symbols:
        raise RuntimeError("Universe file has no symbols.")

    symbols = [str(x).strip().upper() for x in symbols if str(x).strip()]
    symbols = symbols[:args.limit]

    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    existing_runner = find_existing_runner()

    print("=" * 70)
    print("PHASE 19 — NSE BATCH SCANNER")
    print("=" * 70)
    print(f"Timeframe: {args.timeframe}")
    print(f"Symbols selected: {len(symbols)}")
    print(f"Retries: {args.retries}")
    print(f"Existing Phase 14 runner: {existing_runner or 'NOT FOUND'}")
    print()

    if args.dry_run:
        print("DRY RUN — no scanner execution.")
        for index, symbol in enumerate(symbols, 1):
            print(f"[{index}/{len(symbols)}] {symbol}")
        return

    if existing_runner is None:
        raise RuntimeError(
            "Could not find your Phase 14 scanner runner. "
            "Expected one of: run_phase14_scanner.py, run_phase14a_scanner.py, run_phase14.py"
        )

    successes = []
    failures = []
    merged_rows = []

    # Keep prior valid rows if present; this avoids losing working data.
    old_data = read_json(FINAL_DAILY, {"results": []})
    old_rows = old_data.get("results", []) if isinstance(old_data, dict) else []
    old_by_symbol = {
        str(row.get("symbol", "")).upper(): row
        for row in old_rows
        if isinstance(row, dict) and row.get("symbol")
    }

    for index, symbol in enumerate(symbols, 1):
        print(f"\n[{index}/{len(symbols)}] Scanning NSE:{symbol} {args.timeframe}")

        success = False
        last_error = ""

        for attempt in range(1, args.retries + 2):
            env = os.environ.copy()
            env["ICT_SYMBOL"] = symbol
            env["ICT_EXCHANGE"] = "NSE"
            env["ICT_TIMEFRAME"] = args.timeframe

            run = subprocess.run(
                [sys.executable, str(existing_runner)],
                cwd=str(ROOT),
                env=env,
                text=True,
                capture_output=True
            )

            if run.returncode == 0:
                success = True
                print(f"  ✓ Success on attempt {attempt}")
                break

            last_error = (run.stderr or run.stdout or "Unknown scanner error")[-1000:]
            print(f"  ✗ Attempt {attempt} failed")

            if attempt <= args.retries:
                time.sleep(max(0.5, args.pause * attempt))

        if success:
            successes.append(symbol)

            # Phase 14 normally rewrites scanner_daily.json.
            # Read its latest row and store only the current symbol's result.
            latest = read_json(FINAL_DAILY, {"results": []})
            latest_rows = latest.get("results", []) if isinstance(latest, dict) else []

            found = None
            for row in latest_rows:
                if str(row.get("symbol", "")).upper() == symbol:
                    found = row
                    break

            if found:
                old_by_symbol[symbol] = found
            else:
                # Keep old valid row if Phase 14 output format differs.
                print("  ! Scanner finished but no matching summary row was found.")
        else:
            failures.append({
                "symbol": symbol,
                "timeframe": args.timeframe,
                "error": last_error
            })
            print(f"  ✗ Failed after {args.retries + 1} attempt(s)")

        time.sleep(max(0, args.pause))

    # Preserve universe order in final output.
    for symbol in symbols:
        if symbol in old_by_symbol:
            merged_rows.append(old_by_symbol[symbol])

    final_payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timeframe": args.timeframe,
        "results": merged_rows
    }
    FINAL_DAILY.write_text(json.dumps(final_payload, indent=2))

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timeframe": args.timeframe,
        "requested": len(symbols),
        "success_count": len(successes),
        "failure_count": len(failures),
        "successes": successes,
        "failures": failures
    }

    report_file = REPORT_DIR / f"phase19_{args.timeframe}_{stamp}.json"
    latest_report = REPORT_DIR / f"phase19_{args.timeframe}_latest.json"
    report_file.write_text(json.dumps(report, indent=2))
    latest_report.write_text(json.dumps(report, indent=2))

    print("\n" + "=" * 70)
    print("PHASE 19 SUMMARY")
    print("=" * 70)
    print(f"Success: {len(successes)}")
    print(f"Failed:  {len(failures)}")
    print(f"Valid summary rows: {len(merged_rows)}")
    print(f"Report: {latest_report}")

    # Build chunked pages only if valid rows exist.
    if merged_rows:
        export = subprocess.run(
            [
                sys.executable,
                str(EXPORTER),
                "--input", str(FINAL_DAILY),
                "--timeframe", args.timeframe,
                "--page-size", "50"
            ],
            cwd=str(ROOT),
            text=True
        )
        if export.returncode != 0:
            raise RuntimeError("Chunked scanner export failed.")
        print("✓ Chunked scanner pages rebuilt")
    else:
        print("! No valid rows available, scanner pages were not overwritten.")


if __name__ == "__main__":
    main()
