from __future__ import annotations

from pathlib import Path
from datetime import datetime, timezone
import json
import pandas as pd

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_market_structure, events_to_records
from engine.fvg import detect_fvgs, fvgs_to_records

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

SYMBOL = "RELIANCE"
EXCHANGE = "NSE"
INTERVAL = "daily"
BARS = 300

print("=" * 60)
print("ICT NSE SCANNER — FULL TEST PIPELINE")
print("=" * 60)

print(f"\n1/3 Downloading {BARS} {INTERVAL} candles for {EXCHANGE}:{SYMBOL}")
candles = fetch_candles(
    CandleRequest(
        symbol=SYMBOL,
        exchange=EXCHANGE,
        interval=INTERVAL,
        n_bars=BARS,
    )
)

raw_file = RAW_DIR / f"{SYMBOL}_{INTERVAL}_{BARS}.csv"
candles.to_csv(raw_file, index=False)
print(f"✓ Downloaded {len(candles)} candles")

print("\n2/3 Running Market Structure engine")
structure_events = detect_market_structure(
    candles=candles,
    swing_length=7,
    min_gap=10,
)
print(f"✓ BOS / CHoCH events: {len(structure_events)}")

print("\n3/3 Running Fair Value Gap engine")
fvgs = detect_fvgs(
    candles=candles,
    displacement_ratio=0.5,
)

active_fvgs = [fvg for fvg in fvgs if not fvg.filled]
filled_fvgs = [fvg for fvg in fvgs if fvg.filled]

print(f"✓ Total FVGs: {len(fvgs)}")
print(f"✓ Active FVGs: {len(active_fvgs)}")
print(f"✓ Filled FVGs: {len(filled_fvgs)}")

result = {
    "scan_info": {
        "symbol": SYMBOL,
        "exchange": EXCHANGE,
        "interval": INTERVAL,
        "candles_requested": BARS,
        "candles_received": len(candles),
        "scanned_at_utc": datetime.now(timezone.utc).isoformat(),
    },
    "market_structure": events_to_records(structure_events),
    "fair_value_gaps": fvgs_to_records(fvgs),
    "summary": {
        "structure_events": len(structure_events),
        "total_fvgs": len(fvgs),
        "active_fvgs": len(active_fvgs),
        "filled_fvgs": len(filled_fvgs),
    },
}

output_file = PROCESSED_DIR / f"{SYMBOL}_{INTERVAL}_full_scan.json"
output_file.write_text(json.dumps(result, indent=2))

print("\n" + "=" * 60)
print("SCAN SUMMARY")
print("=" * 60)
print(json.dumps(result["summary"], indent=2))
print(f"\nSaved combined result: {output_file}")
