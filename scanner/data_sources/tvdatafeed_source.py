from dataclasses import dataclass
import pandas as pd
from tvDatafeed import TvDatafeed, Interval


@dataclass
class CandleRequest:
    symbol: str
    exchange: str = "NSE"
    interval: str = "daily"
    n_bars: int = 50


INTERVAL_MAP = {
    "1m": Interval.in_1_minute,
    "5m": Interval.in_5_minute,
    "15m": Interval.in_15_minute,
    "1h": Interval.in_1_hour,
    "daily": Interval.in_daily,
}


def fetch_candles(request: CandleRequest) -> pd.DataFrame:
    if request.interval not in INTERVAL_MAP:
        raise ValueError(f"Unsupported interval: {request.interval}")

    tv = TvDatafeed()

    candles = tv.get_hist(
        symbol=request.symbol,
        exchange=request.exchange,
        interval=INTERVAL_MAP[request.interval],
        n_bars=request.n_bars,
    )

    if candles is None or candles.empty:
        raise RuntimeError(
            f"No candles returned for {request.exchange}:{request.symbol}"
        )

    candles = candles.reset_index()

    if "datetime" not in candles.columns and "time" in candles.columns:
        candles = candles.rename(columns={"time": "datetime"})

    required = ["datetime", "open", "high", "low", "close", "volume"]
    missing = [column for column in required if column not in candles.columns]

    if missing:
        raise RuntimeError(
            f"Missing columns: {missing}; got {candles.columns.tolist()}"
        )

    return candles[required].copy()
