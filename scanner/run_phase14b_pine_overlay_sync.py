
from pathlib import Path
import json
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scanner"))

from engine.pine_smc_final_pro import detect_pine_smc

PUBLIC = ROOT / "public" / "data"
SYMBOLS = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN", "LT"]


def date_at(candles, index):
    if index is None or index < 0 or index >= len(candles):
        return None
    return candles[index].get("time")


def enrich(items, candles):
    output = []
    for item in items:
        row = dict(item)
        row["created_at"] = date_at(candles, row.get("bar_index"))
        row["start_at"] = date_at(candles, row.get("start_bar_index"))
        output.append(row)
    return output


def latest(items, count=10):
    return items[-count:] if items else []


def main():
    validation = {
        "meta": {
            "name": "SMC FINAL PRO Pine parity validation",
            "source": "User Pine Script v5",
            "settings": {
                "swing_length": 7,
                "min_gap_between_signals": 10,
                "extend_fvg": 20,
                "fvg_strong_body_ratio": 0.5,
                "ob_strong_body_ratio": 0.6
            },
            "last_updated": datetime.now(timezone.utc).isoformat()
        },
        "symbols": {}
    }

    print("=" * 70)
    print("PHASE 14B — WRITE PINE-PARITY OVERLAYS INTO CHART JSON")
    print("=" * 70)

    completed = []
    failed = []

    for symbol in SYMBOLS:
        path = PUBLIC / f"NSE_{symbol}_1D.json"

        if not path.exists():
            print(f"✗ {symbol}: chart JSON missing")
            failed.append({"symbol": symbol, "error": "chart JSON missing"})
            continue

        try:
            payload = json.loads(path.read_text())
            candles = payload.get("candles", [])

            if len(candles) < 20:
                raise ValueError("not enough candles")

            result = detect_pine_smc(
                candles,
                swing_len=7,
                min_gap=10,
                extend_fvg=20
            )

            # Replace only overlays with Pine-parity output.
            # Keep fields expected by the existing website.
            payload["overlays"] = {
                "structure": result["structure"],
                "fvgs": result["fvgs"],
                "order_blocks": result["order_blocks"],
                "cisd_levels": result["cisd_levels"],
                "liquidity": [],
                "inducements": []
            }

            payload.setdefault("meta", {})
            payload["meta"]["overlay_source"] = "SMC FINAL PRO Pine Script parity"
            payload["meta"]["pine_settings"] = {
                "swing_length": 7,
                "min_gap": 10,
                "extend_fvg": 20
            }
            payload["meta"]["last_updated"] = datetime.now(timezone.utc).isoformat()

            path.write_text(json.dumps(payload, indent=2))

            validation["symbols"][symbol] = {
                "latest_close": candles[-1]["close"],
                "trend_state": (
                    "bullish" if result["trend"] == 1
                    else "bearish" if result["trend"] == -1
                    else "neutral"
                ),
                "latest_structure_events": enrich(latest(result["structure"], 10), candles),
                "active_order_blocks": enrich(result["order_blocks"], candles),
                "active_fvgs": enrich(result["fvgs"], candles),
                "active_cisd_levels": enrich(result["cisd_levels"], candles),
                "counts": {
                    "structure": len(result["structure"]),
                    "active_order_blocks": len(result["order_blocks"]),
                    "active_fvgs": len(result["fvgs"]),
                    "active_cisd_levels": len(result["cisd_levels"])
                }
            }

            completed.append(symbol)

            print(
                f"✓ {symbol:<10} | "
                f"Structure {len(result['structure']):2} | "
                f"Active OB {len(result['order_blocks']):2} | "
                f"Active FVG {len(result['fvgs']):2} | "
                f"Active CISD {len(result['cisd_levels']):2}"
            )

        except Exception as error:
            failed.append({"symbol": symbol, "error": str(error)})
            print(f"✗ {symbol}: {error}")

    validation["summary"] = {
        "completed": completed,
        "failed": failed
    }

    debug_file = PUBLIC / "pine_validation_daily.json"
    debug_file.write_text(json.dumps(validation, indent=2))

    print("\nSaved validation file:", debug_file)
    print("Completed:", len(completed))
    print("Failed:", len(failed))

    if not completed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
