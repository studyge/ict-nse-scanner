from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DATA = ROOT / "public" / "data"
PUBLIC_DATA.mkdir(parents=True, exist_ok=True)

SYMBOL = "RELIANCE"
EXCHANGE = "NSE"
INTERVAL = "daily"
BARS = 300


def run_script(script_name: str) -> None:
    script_path = ROOT / "scanner" / script_name
    if not script_path.exists():
        raise FileNotFoundError(f"Required scanner file missing: {script_path}")

    print(f"\nRunning: {script_name}")
    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=ROOT,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"{script_name} failed with exit code {result.returncode}")


def find_latest_json(pattern: str) -> Path:
    files = list((ROOT / "data" / "processed").glob(pattern))
    if not files:
        raise FileNotFoundError(f"No processed JSON found for pattern: {pattern}")
    return max(files, key=lambda item: item.stat().st_mtime)


def safe_list(value):
    return value if isinstance(value, list) else []


def normalize_candle(candle):
    return {
        "time": candle.get("datetime") or candle.get("time"),
        "open": float(candle["open"]),
        "high": float(candle["high"]),
        "low": float(candle["low"]),
        "close": float(candle["close"]),
        "volume": float(candle.get("volume", 0)),
    }


def main():
    print("=" * 68)
    print("ICT NSE SCANNER — PHASE 8: LIVE CHART DATA PIPELINE")
    print("=" * 68)

    # Uses the existing Phase 6 exporter because it already generates
    # scanner data and chart-ready output.
    run_script("run_phase6_chart_export.py")

    source_file = find_latest_json("*_daily_chart.json")
    print(f"\nUsing chart export: {source_file.name}")

    source = json.loads(source_file.read_text())

    candles = safe_list(source.get("candles"))
    if not candles:
        raise RuntimeError("Chart export has no candles.")

    normalized_candles = [normalize_candle(candle) for candle in candles]

    # Existing Phase 6 output may use either `overlays` or top-level keys.
    raw_overlays = source.get("overlays", {})
    if not isinstance(raw_overlays, dict):
        raw_overlays = {}

    overlays = {
        "structure": safe_list(raw_overlays.get("structure", source.get("structure_events", []))),
        "fvgs": safe_list(raw_overlays.get("fvgs", source.get("fvgs", []))),
        "order_blocks": safe_list(raw_overlays.get("order_blocks", source.get("order_blocks", []))),
        "cisd_levels": safe_list(raw_overlays.get("cisd_levels", source.get("cisd_levels", []))),
        "liquidity": safe_list(raw_overlays.get("liquidity", source.get("liquidity_events", []))),
        "inducements": safe_list(raw_overlays.get("inducements", source.get("inducements", []))),
    }

    live_chart = {
        "meta": {
            "symbol": SYMBOL,
            "exchange": EXCHANGE,
            "interval": INTERVAL,
            "candles": len(normalized_candles),
            "generated_at_utc": datetime.now(timezone.utc).isoformat(),
            "source": "ICT NSE Scanner Phase 8",
        },
        "candles": normalized_candles,
        "overlays": overlays,
    }

    output = PUBLIC_DATA / f"{SYMBOL}_{INTERVAL}_chart.json"
    output.write_text(json.dumps(live_chart, indent=2, default=str))

    print("\n" + "=" * 68)
    print("PHASE 8 LIVE CHART SUMMARY")
    print("=" * 68)
    print(f"✓ Candles: {len(normalized_candles)}")
    print(f"✓ Structure: {len(overlays['structure'])}")
    print(f"✓ FVGs: {len(overlays['fvgs'])}")
    print(f"✓ Order Blocks: {len(overlays['order_blocks'])}")
    print(f"✓ CISD: {len(overlays['cisd_levels'])}")
    print(f"✓ Liquidity: {len(overlays['liquidity'])}")
    print(f"✓ Inducements: {len(overlays['inducements'])}")
    print(f"\n✓ Live website data saved: {output}")


if __name__ == "__main__":
    main()
