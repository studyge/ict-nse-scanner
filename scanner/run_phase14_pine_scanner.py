
from pathlib import Path
import json
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scanner"))

from engine.pine_smc_final_pro import detect_pine_smc

DATA_DIR = ROOT / "public" / "data"
SYMBOLS = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "LT"]

def latest_structure(items):
    return items[-1] if items else None

def score_setup(result, close):
    score = 0
    trend = result["trend"]
    structure = latest_structure(result["structure"])

    if trend != 0:
        score += 25

    if structure:
        score += 25
        if structure["type"].startswith("CHoCH"):
            score += 10

    active_fvgs = result["fvgs"]
    active_obs = result["order_blocks"]
    active_cisd = result["cisd_levels"]

    if active_fvgs:
        score += 15
    if active_obs:
        score += 25
    if active_cisd:
        score += 10

    score = min(score, 100)

    if score >= 75:
        label = "A"
    elif score >= 55:
        label = "B"
    elif score >= 30:
        label = "Watch"
    else:
        label = "No Setup"

    if trend == 1:
        bias = "Bullish"
    elif trend == -1:
        bias = "Bearish"
    else:
        bias = "Neutral"

    return score, label, bias

def main():
    rows = []

    print("=" * 68)
    print("PHASE 14 — PINE SCRIPT PARITY SCANNER")
    print("=" * 68)

    for symbol in SYMBOLS:
        source = DATA_DIR / f"NSE_{symbol}_1D.json"

        if not source.exists():
            print(f"✗ Missing data: {symbol}")
            continue

        payload = json.loads(source.read_text())
        candles = payload.get("candles", [])

        if len(candles) < 20:
            print(f"✗ Not enough candles: {symbol}")
            continue

        result = detect_pine_smc(candles, swing_len=7, min_gap=10, extend_fvg=20)
        close = float(candles[-1]["close"])
        score, label, bias = score_setup(result, close)
        latest = latest_structure(result["structure"])

        row = {
            "symbol": symbol,
            "exchange": "NSE",
            "interval": "1D",
            "close": close,
            "bias": bias,
            "score": score,
            "label": label,
            "latest_structure": latest,
            "active_fvg_count": len(result["fvgs"]),
            "active_ob_count": len(result["order_blocks"]),
            "active_cisd_count": len(result["cisd_levels"]),
            "pine_settings": {
                "swing_length": 7,
                "min_gap": 10,
                "fvg_extend": 20
            }
        }

        rows.append(row)

        print(
            f"✓ {symbol:<10} | {bias:<8} | {label:<8} | "
            f"Score {score:>3} | FVG {len(result['fvgs'])} | "
            f"OB {len(result['order_blocks'])} | CISD {len(result['cisd_levels'])}"
        )

    rows.sort(key=lambda x: x["score"], reverse=True)

    output = {
        "meta": {
            "name": "SMC FINAL PRO (ULTIMATE CLEAN) scanner",
            "source": "User Pine Script v5 parity implementation",
            "exchange": "NSE",
            "interval": "1D",
            "last_updated": datetime.now(timezone.utc).isoformat()
        },
        "results": rows
    }

    target = DATA_DIR / "scanner_daily.json"
    target.write_text(json.dumps(output, indent=2))

    print("\nSaved:", target)
    print("Symbols scanned:", len(rows))

if __name__ == "__main__":
    main()
