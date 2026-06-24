from __future__ import annotations
import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_structure, events_to_dict
from engine.fvg import detect_fvgs, fvgs_to_dict
from engine.order_blocks import detect_order_blocks, order_blocks_to_dict
from engine.cisd import detect_cisd_levels, cisd_to_dict
from engine.liquidity import detect_liquidity, detect_inducements, liquidity_to_dict

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "processed"
RAW.mkdir(parents=True, exist_ok=True)
OUT.mkdir(parents=True, exist_ok=True)

SYMBOL, INTERVAL, BARS = "RELIANCE", "daily", 300

print("=" * 65)
print("ICT NSE SCANNER — PHASE 4 FULL ICT SCAN")
print("=" * 65)

candles = fetch_candles(CandleRequest(SYMBOL, "NSE", INTERVAL, BARS))
candles.to_csv(RAW / f"{SYMBOL}_{INTERVAL}_{BARS}.csv", index=False)
print(f"✓ Candles: {len(candles)}")

structure = detect_structure(candles, swing_length=7, min_gap=10)
fvgs = detect_fvgs(candles, strong_body_ratio=0.50)
obs = detect_order_blocks(candles, structure, strong_body_ratio=0.60)
cisd = detect_cisd_levels(candles)
liquidity = detect_liquidity(candles, pivot_left=5, pivot_right=5)
inducements = detect_inducements(candles, structure)

active = lambda items: [x for x in items if x.status == "active"]

summary = {
    "structure_events": len(structure),
    "total_fvgs": len(fvgs),
    "active_fvgs": len(active(fvgs)),
    "total_order_blocks": len(obs),
    "active_order_blocks": len(active(obs)),
    "total_cisd_levels": len(cisd),
    "active_cisd_levels": len(active(cisd)),
    "liquidity_events": len(liquidity),
    "active_liquidity_pools": len([x for x in liquidity if x.kind == "liquidity_pool" and x.status == "active"]),
    "equal_highs": len([x for x in liquidity if x.kind == "equal_high"]),
    "equal_lows": len([x for x in liquidity if x.kind == "equal_low"]),
    "liquidity_grabs": len([x for x in liquidity if x.kind == "grab"]),
    "liquidity_sweeps": len([x for x in liquidity if x.kind == "sweep"]),
    "inducements": len(inducements),
}

result = {
    "symbol": SYMBOL,
    "exchange": "NSE",
    "interval": INTERVAL,
    "candles": len(candles),
    "summary": summary,
    "structure_events": events_to_dict(structure),
    "fvgs": fvgs_to_dict(fvgs),
    "order_blocks": order_blocks_to_dict(obs),
    "cisd_levels": cisd_to_dict(cisd),
    "liquidity_events": liquidity_to_dict(liquidity),
    "inducements": liquidity_to_dict(inducements),
}

file = OUT / f"{SYMBOL}_{INTERVAL}_full_ict_scan.json"
file.write_text(json.dumps(result, indent=2))

print("\nFULL ICT SCAN SUMMARY")
print(json.dumps(summary, indent=2))
print(f"\n✓ Saved: {file}")
