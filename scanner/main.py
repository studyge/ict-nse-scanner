from pathlib import Path

from data_sources.tvdatafeed_source import CandleRequest, fetch_candles

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
RAW_DIR.mkdir(parents=True, exist_ok=True)

request = CandleRequest(
    symbol="RELIANCE",
    exchange="NSE",
    interval="daily",
    n_bars=50,
)

print("=" * 55)
print("ICT NSE SCANNER — PHASE 1 TEST")
print("=" * 55)
print(
    f"Downloading {request.n_bars} {request.interval} candles "
    f"for {request.exchange}:{request.symbol}"
)

candles = fetch_candles(request)

output_file = RAW_DIR / "RELIANCE_daily_50.csv"
candles.to_csv(output_file, index=False)

print(f"✓ Candles downloaded: {len(candles)}")
print()
print(candles.tail(5).to_string(index=False))
print()
print(f"✓ Saved: {output_file}")
