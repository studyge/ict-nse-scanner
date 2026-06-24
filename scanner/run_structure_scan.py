from __future__ import annotations

import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_structure, events_to_dict

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

print("=" * 60)
print("ICT NSE SCANNER — PHASE 2: MARKET STRUCTURE")
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

print(f"\n2/2 Detecting structure: swing={SWING_LENGTH}, min_gap={MIN_GAP}")

events = detect_structure(
    candles,
    swing_length=SWING_LENGTH,
    min_gap=MIN_GAP,
)

result = {
    "symbol": SYMBOL,
    "exchange": "NSE",
    "interval": INTERVAL,
    "candles": len(candles),
    "settings": {
        "swing_length": SWING_LENGTH,
        "min_gap": MIN_GAP,
    },
    "structure_events": events_to_dict(events),
}

output_file = PROCESSED_DIR / f"{SYMBOL}_{INTERVAL}_structure.json"
output_file.write_text(json.dumps(result, indent=2))

print(f"✓ Structure events found: {len(events)}")

for event in events:
    print(
        f"{event.timestamp} | {event.event_type} | "
        f"{event.direction} | level={event.level}"
    )

print(f"\n✓ Saved: {output_file}")
