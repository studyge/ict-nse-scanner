from __future__ import annotations

import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.fvg import detect_fvgs, fvgs_to_dict


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

SYMBOL = "RELIANCE"
INTERVAL = "daily"
BARS = 300
STRONG_BODY_RATIO = 0.50

print("=" * 60)
print("ICT NSE SCANNER — PHASE 3: FAIR VALUE GAPS")
print("=" * 60)

print(f"\n1/2 Downloading {BARS} {INTERVAL} candles for NSE:{SYMBOL}")

candles = fetch_candles(CandleRequest(
    symbol=SYMBOL,
    exchange="NSE",
    interval=INTERVAL,
    n_bars=BARS,
))

raw_file = RAW_DIR / f"{SYMBOL}_{INTERVAL}_{BARS}.csv"
candles.to_csv(raw_file, index=False)

print(f"✓ Downloaded candles: {len(candles)}")

print(f"\n2/2 Detecting FVGs: strong body ratio={STRONG_BODY_RATIO}")

gaps = detect_fvgs(
    candles,
    strong_body_ratio=STRONG_BODY_RATIO,
)

active_gaps = [gap for gap in gaps if gap.status == "active"]
filled_gaps = [gap for gap in gaps if gap.status == "filled"]

result = {
    "symbol": SYMBOL,
    "exchange": "NSE",
    "interval": INTERVAL,
    "candles": len(candles),
    "settings": {
        "strong_body_ratio": STRONG_BODY_RATIO,
    },
    "summary": {
        "total_fvgs": len(gaps),
        "active_fvgs": len(active_gaps),
        "filled_fvgs": len(filled_gaps),
    },
    "fvgs": fvgs_to_dict(gaps),
}

output_file = PROCESSED_DIR / f"{SYMBOL}_{INTERVAL}_fvg.json"
output_file.write_text(json.dumps(result, indent=2))

print(f"✓ Total FVGs: {len(gaps)}")
print(f"✓ Active FVGs: {len(active_gaps)}")
print(f"✓ Filled FVGs: {len(filled_gaps)}")

print("\nActive FVGs:")
for gap in active_gaps[-10:]:
    print(
        f"{gap.created_at} | {gap.direction} | "
        f"top={gap.top} | bottom={gap.bottom}"
    )

print(f"\n✓ Saved: {output_file}")
