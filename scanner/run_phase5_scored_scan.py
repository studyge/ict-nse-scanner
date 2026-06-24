from __future__ import annotations

import json
from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles
from engine.structure import detect_structure, events_to_dict
from engine.fvg import detect_fvgs, fvgs_to_dict
from engine.cisd import detect_cisd_levels, cisd_to_dict
from engine.liquidity import detect_liquidity, detect_inducements, liquidity_to_dict
from engine.improved_order_blocks import (
    detect_improved_order_blocks,
    improved_order_blocks_to_dict,
)
from engine.scoring import build_trade_setups, setups_to_dict


ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "data" / "processed"

RAW_DIR.mkdir(parents=True, exist_ok=True)
OUT_DIR.mkdir(parents=True, exist_ok=True)

SYMBOL = "RELIANCE"
INTERVAL = "daily"
BARS = 300

print("=" * 68)
print("ICT NSE SCANNER — PHASE 5: IMPROVED OB + SIGNAL SCORING")
print("=" * 68)

print(f"\n1/6 Downloading {BARS} {INTERVAL} candles for NSE:{SYMBOL}")
candles = fetch_candles(CandleRequest(
    symbol=SYMBOL,
    exchange="NSE",
    interval=INTERVAL,
    n_bars=BARS,
))
candles.to_csv(RAW_DIR / f"{SYMBOL}_{INTERVAL}_{BARS}.csv", index=False)
print(f"✓ Candles: {len(candles)}")

print("\n2/6 Market Structure")
structure = detect_structure(candles, swing_length=7, min_gap=10)
print(f"✓ Structure events: {len(structure)}")

print("\n3/6 FVG + CISD")
fvgs = detect_fvgs(candles, strong_body_ratio=0.50)
cisd = detect_cisd_levels(candles)
print(f"✓ FVGs: {len(fvgs)} | active: {len([x for x in fvgs if x.status == 'active'])}")
print(f"✓ CISD: {len(cisd)} | active: {len([x for x in cisd if x.status == 'active'])}")

print("\n4/6 Liquidity + Inducement")
liquidity = detect_liquidity(candles, pivot_left=5, pivot_right=5)
inducements = detect_inducements(candles, structure)
print(f"✓ Liquidity events: {len(liquidity)}")
print(f"✓ Inducements: {len(inducements)}")

print("\n5/6 Improved Order Blocks")
order_blocks = detect_improved_order_blocks(
    candles,
    structure,
    lookback=10,
    min_displacement_body_ratio=0.50,
)
fresh_obs = [x for x in order_blocks if x.status == "fresh"]
mitigated_obs = [x for x in order_blocks if x.status == "mitigated"]
invalidated_obs = [x for x in order_blocks if x.status == "invalidated"]
print(
    f"✓ OBs: {len(order_blocks)} | fresh: {len(fresh_obs)} | "
    f"mitigated: {len(mitigated_obs)} | invalidated: {len(invalidated_obs)}"
)

print("\n6/6 Confluence Scoring")
setups = build_trade_setups(
    order_blocks=order_blocks,
    fvgs=fvgs,
    structure_events=structure,
    liquidity_events=liquidity,
    cisd_levels=cisd,
)
print(f"✓ Ranked setups: {len(setups)}")

summary = {
    "structure_events": len(structure),
    "total_fvgs": len(fvgs),
    "active_fvgs": len([x for x in fvgs if x.status == "active"]),
    "total_cisd_levels": len(cisd),
    "active_cisd_levels": len([x for x in cisd if x.status == "active"]),
    "liquidity_events": len(liquidity),
    "inducements": len(inducements),
    "total_order_blocks": len(order_blocks),
    "fresh_order_blocks": len(fresh_obs),
    "mitigated_order_blocks": len(mitigated_obs),
    "invalidated_order_blocks": len(invalidated_obs),
    "ranked_setups": len(setups),
    "a_plus_setups": len([x for x in setups if x.grade == "A+"]),
    "a_setups": len([x for x in setups if x.grade == "A"]),
}

result = {
    "symbol": SYMBOL,
    "exchange": "NSE",
    "interval": INTERVAL,
    "candles": len(candles),
    "summary": summary,
    "structure_events": events_to_dict(structure),
    "fvgs": fvgs_to_dict(fvgs),
    "cisd_levels": cisd_to_dict(cisd),
    "liquidity_events": liquidity_to_dict(liquidity),
    "inducements": liquidity_to_dict(inducements),
    "improved_order_blocks": improved_order_blocks_to_dict(order_blocks),
    "ranked_setups": setups_to_dict(setups),
}

output_file = OUT_DIR / f"{SYMBOL}_{INTERVAL}_phase5_scored_scan.json"
output_file.write_text(json.dumps(result, indent=2))

print("\n" + "=" * 68)
print("PHASE 5 SCAN SUMMARY")
print("=" * 68)
print(json.dumps(summary, indent=2))

print("\nTOP SETUPS")
if setups:
    for index, setup in enumerate(setups[:10], start=1):
        target = (
            f"{setup.liquidity_target:.2f}"
            if setup.liquidity_target is not None
            else "none"
        )
        print(
            f"{index}. {setup.direction.upper()} | "
            f"{setup.grade} | score={setup.score} | "
            f"OB={setup.order_block_bottom:.2f}-{setup.order_block_top:.2f} | "
            f"target={target}"
        )
        print("   " + " • ".join(setup.reasons))
else:
    print("No valid setups found.")

print(f"\n✓ Saved: {output_file}")
