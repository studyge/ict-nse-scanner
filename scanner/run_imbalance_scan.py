from __future__ import annotations

import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_structure, events_to_dict
from engine.fvg import detect_fvgs, fvgs_to_dict
from engine.order_blocks import detect_order_blocks, order_blocks_to_dict
from engine.cisd import detect_cisd_levels, cisd_to_dict


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

SYMBOL = "RELIANCE"
INTERVAL = "daily"
BARS = 300

SWING_LENGTH = 7
MIN_GAP = 10
FVG_STRONG_BODY_RATIO = 0.50
OB_STRONG_BODY_RATIO = 0.60

print("=" * 65)
print("ICT NSE SCANNER — PHASE 3B: IMBALANCE ENGINE")
print("=" * 65)

print(f"\n1/5 Downloading {BARS} {INTERVAL} candles for NSE:{SYMBOL}")

candles = fetch_candles(CandleRequest(
    symbol=SYMBOL,
    exchange="NSE",
    interval=INTERVAL,
    n_bars=BARS,
))

raw_file = RAW_DIR / f"{SYMBOL}_{INTERVAL}_{BARS}.csv"
candles.to_csv(raw_file, index=False)
print(f"✓ Downloaded candles: {len(candles)}")

print("\n2/5 Detecting Market Structure")
structure_events = detect_structure(
    candles,
    swing_length=SWING_LENGTH,
    min_gap=MIN_GAP,
)
print(f"✓ Structure events: {len(structure_events)}")

print("\n3/5 Detecting Fair Value Gaps")
fvgs = detect_fvgs(
    candles,
    strong_body_ratio=FVG_STRONG_BODY_RATIO,
)
active_fvgs = [item for item in fvgs if item.status == "active"]
print(f"✓ FVGs: {len(fvgs)} | active: {len(active_fvgs)}")

print("\n4/5 Detecting Order Blocks")
order_blocks = detect_order_blocks(
    candles,
    structure_events,
    strong_body_ratio=OB_STRONG_BODY_RATIO,
)
active_obs = [item for item in order_blocks if item.status == "active"]
print(f"✓ Order Blocks: {len(order_blocks)} | active: {len(active_obs)}")

print("\n5/5 Detecting CISD Levels")
cisd_levels = detect_cisd_levels(candles)
active_cisd = [item for item in cisd_levels if item.status == "active"]
print(f"✓ CISD Levels: {len(cisd_levels)} | active: {len(active_cisd)}")

result = {
    "symbol": SYMBOL,
    "exchange": "NSE",
    "interval": INTERVAL,
    "candles": len(candles),
    "settings": {
        "swing_length": SWING_LENGTH,
        "min_gap": MIN_GAP,
        "fvg_strong_body_ratio": FVG_STRONG_BODY_RATIO,
        "ob_strong_body_ratio": OB_STRONG_BODY_RATIO,
    },
    "summary": {
        "structure_events": len(structure_events),
        "total_fvgs": len(fvgs),
        "active_fvgs": len(active_fvgs),
        "total_order_blocks": len(order_blocks),
        "active_order_blocks": len(active_obs),
        "total_cisd_levels": len(cisd_levels),
        "active_cisd_levels": len(active_cisd),
    },
    "structure_events": events_to_dict(structure_events),
    "fvgs": fvgs_to_dict(fvgs),
    "order_blocks": order_blocks_to_dict(order_blocks),
    "cisd_levels": cisd_to_dict(cisd_levels),
}

output_file = PROCESSED_DIR / f"{SYMBOL}_{INTERVAL}_imbalance_scan.json"
output_file.write_text(json.dumps(result, indent=2))

print("\n" + "=" * 65)
print("IMBALANCE SCAN SUMMARY")
print("=" * 65)
print(json.dumps(result["summary"], indent=2))
print(f"\n✓ Saved: {output_file}")
