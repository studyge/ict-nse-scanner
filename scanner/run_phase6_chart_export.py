from __future__ import annotations

import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_structure
from engine.fvg import detect_fvgs
from engine.cisd import detect_cisd_levels
from engine.liquidity import detect_liquidity, detect_inducements
from engine.refined_order_blocks import detect_refined_order_blocks
from engine.chart_export import export_chart_data
import os


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SYMBOL = os.getenv("ICT_SYMBOL", "RELIANCE")
EXCHANGE = "NSE"
INTERVAL = "daily"
BARS = 300

print("=" * 68)
print("ICT NSE SCANNER — PHASE 6: CHART DATA EXPORT")
print("=" * 68)

print(f"\n1/5 Downloading {BARS} {INTERVAL} candles for {EXCHANGE}:{SYMBOL}")
candles = fetch_candles(CandleRequest(
    symbol=SYMBOL,
    exchange=EXCHANGE,
    interval=INTERVAL,
    n_bars=BARS,
))
candles.to_csv(RAW_DIR / f"{SYMBOL}_{INTERVAL}_{BARS}.csv", index=False)
print(f"✓ Candles: {len(candles)}")

print("\n2/5 Detecting ICT overlays")
structure = detect_structure(candles, swing_length=7, min_gap=10)
fvgs = detect_fvgs(candles, strong_body_ratio=0.50)
cisd = detect_cisd_levels(candles)
liquidity = detect_liquidity(candles, pivot_left=5, pivot_right=5)
inducements = detect_inducements(candles, structure)

print(f"✓ Structure: {len(structure)}")
print(f"✓ FVGs: {len(fvgs)}")
print(f"✓ CISD: {len(cisd)}")
print(f"✓ Liquidity: {len(liquidity)}")
print(f"✓ Inducements: {len(inducements)}")

print("\n3/5 Detecting refined Order Blocks")
order_blocks = detect_refined_order_blocks(
    candles=candles,
    structure_events=structure,
    lookback=10,
    min_displacement_body_ratio=0.50,
    zone_mode="refined",
    recent_candles=100,
)

fresh = [item for item in order_blocks if item.status == "fresh"]
mitigated = [item for item in order_blocks if item.status == "mitigated"]
invalidated = [item for item in order_blocks if item.status == "invalidated"]
eligible = [item for item in order_blocks if item.scanner_eligible]

print(
    f"✓ OBs: {len(order_blocks)} | fresh: {len(fresh)} | "
    f"mitigated: {len(mitigated)} | invalidated: {len(invalidated)}"
)
print(f"✓ Scanner eligible OBs: {len(eligible)}")

print("\n4/5 Building chart-ready JSON")
chart = export_chart_data(
    symbol=SYMBOL,
    exchange=EXCHANGE,
    interval=INTERVAL,
    candles=candles,
    structure_events=structure,
    fvgs=fvgs,
    cisd_levels=cisd,
    liquidity_events=liquidity,
    inducements=inducements,
    order_blocks=order_blocks,
)

output_file = OUT_DIR / f"{SYMBOL}_{INTERVAL}_chart.json"
output_file.write_text(json.dumps(chart, indent=2))

print("\n5/5 Summary")
summary = {
    "candles": len(candles),
    "structure_events": len(structure),
    "fvgs": len(fvgs),
    "cisd_levels": len(cisd),
    "liquidity_events": len(liquidity),
    "inducements": len(inducements),
    "order_blocks": len(order_blocks),
    "fresh_order_blocks": len(fresh),
    "mitigated_order_blocks": len(mitigated),
    "invalidated_order_blocks": len(invalidated),
    "scanner_eligible_order_blocks": len(eligible),
}

print(json.dumps(summary, indent=2))
print(f"\n✓ Saved chart file: {output_file}")
print("✓ This file is ready for the future TradingView-like web chart.")
