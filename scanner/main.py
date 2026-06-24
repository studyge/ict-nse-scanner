from pathlib import Path
from data_sources.tvdatafeed_source import CandleRequest, fetch_candles

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "data" / "raw"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

request = CandleRequest(
    symbol="RELIANCE",
    exchange="NSE",
    interval="daily",
    n_bars=50,
)

print(f"Downloading {request.n_bars} daily candles for NSE:{request.symbol}...")

candles = fetch_candles(request)

file_path = OUTPUT_DIR / "RELIANCE_daily_50.csv"
candles.to_csv(file_path, index=False)

print(f"Downloaded: {len(candles)} candles")
print(candles.tail(5).to_string(index=False))
print(f"Saved: {file_path}")
