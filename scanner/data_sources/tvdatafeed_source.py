from __future__ import annotations

from dataclasses import dataclass
import time

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


def fetch_candles(
    request: CandleRequest,
    retries: int = 3,
    retry_delay_seconds: int = 3,
) -> pd.DataFrame:
    """
    Download OHLCV candles using tvDatafeed in no-login mode.

    No-login TradingView access can be limited. This function retries
    temporary failures and returns standard candle columns.
    """
    if request.interval not in INTERVAL_MAP:
        raise ValueError(
            f"Unsupported interval: {request.interval}. "
            f"Supported: {list(INTERVAL_MAP.keys())}"
        )

    last_error: Exception | None = None

    for attempt in range(1, retries + 1):
        try:
            tv = TvDatafeed()

            candles = tv.get_hist(
                symbol=request.symbol,
                exchange=request.exchange,
                interval=INTERVAL_MAP[request.interval],
                n_bars=request.n_bars,
            )

            if candles is None or candles.empty:
                raise RuntimeError(
                    f"No candles returned for "
                    f"{request.exchange}:{request.symbol}"
                )

            candles = candles.reset_index()

            if "datetime" not in candles.columns:
                if "time" in candles.columns:
                    candles = candles.rename(columns={"time": "datetime"})
                else:
                    raise RuntimeError(
                        "No datetime column found. "
                        f"Columns: {candles.columns.tolist()}"
                    )

            required = ["datetime", "open", "high", "low", "close", "volume"]
            missing = [
                column for column in required
                if column not in candles.columns
            ]

            if missing:
                raise RuntimeError(
                    f"Missing columns: {missing}. "
                    f"Received: {candles.columns.tolist()}"
                )

            return candles[required].copy()

        except Exception as error:
            last_error = error

            if attempt < retries:
                print(
                    f"Attempt {attempt}/{retries} failed: {error}. "
                    f"Retrying in {retry_delay_seconds}s..."
                )
                time.sleep(retry_delay_seconds)

    raise RuntimeError(
        f"Failed to download {request.exchange}:{request.symbol} "
        f"after {retries} attempts. Last error: {last_error}"
    )
