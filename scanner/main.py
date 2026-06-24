from pathlib import Path
import json
import pandas as pd

from engine.structure import detect_market_structure, events_to_records

ROOT = Path(__file__).resolve().parent.parent
RAW_FILE = ROOT / "data" / "raw" / "RELIANCE_daily_50.csv"
OUTPUT_DIR = ROOT / "data" / "processed"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

candles = pd.read_csv(RAW_FILE)

events = detect_market_structure(candles, swing_length=7, min_gap=10)

output_file = OUTPUT_DIR / "RELIANCE_daily_structure.json"
output_file.write_text(json.dumps(events_to_records(events), indent=2))

print(f"Candles loaded: {len(candles)}")
print(f"Structure events found: {len(events)}")

for event in events:
    print(
        f"{event.time} | {event.event_type} | {event.direction} | "
        f"level={event.level}"
    )

print(f"Saved: {output_file}")
