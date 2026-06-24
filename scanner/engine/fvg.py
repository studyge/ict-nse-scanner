from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

Direction = Literal["bullish", "bearish"]

@dataclass
class FairValueGap:
    created_index: int
    created_time: str
    direction: Direction
    top: float
    bottom: float
    strong_displacement: bool
    filled: bool = False
    filled_index: int | None = None
    filled_time: str | None = None

def detect_fvgs(candles: pd.DataFrame, displacement_ratio: float = 0.5) -> list[FairValueGap]:
    required = {"datetime", "open", "high", "low", "close"}
    missing = required - set(candles.columns)
    if missing:
        raise ValueError(f"Missing candle columns: {sorted(missing)}")

    df = candles.reset_index(drop=True).copy()
    active_bullish = []
    active_bearish = []
    all_fvgs = []

    for index in range(len(df)):
        high = float(df.at[index, "high"])
        low = float(df.at[index, "low"])
        open_price = float(df.at[index, "open"])
        close = float(df.at[index, "close"])

        # Match Script 1: remove FVG when it gets filled.
        for fvg in active_bullish[:]:
            if low <= fvg.top:
                fvg.filled = True
                fvg.filled_index = index
                fvg.filled_time = str(df.at[index, "datetime"])
                active_bullish.remove(fvg)

        for fvg in active_bearish[:]:
            if high >= fvg.bottom:
                fvg.filled = True
                fvg.filled_index = index
                fvg.filled_time = str(df.at[index, "datetime"])
                active_bearish.remove(fvg)

        if index < 2:
            continue

        candle_range = high - low
        body = abs(close - open_price)
        strong_move = candle_range > 0 and body > candle_range * displacement_ratio

        if not strong_move:
            continue

        high_two_bars_ago = float(df.at[index - 2, "high"])
        low_two_bars_ago = float(df.at[index - 2, "low"])

        if low > high_two_bars_ago:
            fvg = FairValueGap(
                created_index=index,
                created_time=str(df.at[index, "datetime"]),
                direction="bullish",
                top=low,
                bottom=high_two_bars_ago,
                strong_displacement=True,
            )
            active_bullish.append(fvg)
            all_fvgs.append(fvg)

        if high < low_two_bars_ago:
            fvg = FairValueGap(
                created_index=index,
                created_time=str(df.at[index, "datetime"]),
                direction="bearish",
                top=low_two_bars_ago,
                bottom=high,
                strong_displacement=True,
            )
            active_bearish.append(fvg)
            all_fvgs.append(fvg)

    return all_fvgs

def fvgs_to_records(fvgs: list[FairValueGap]) -> list[dict]:
    return [asdict(fvg) for fvg in fvgs]
