from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

Direction = Literal["bullish", "bearish"]


@dataclass
class CISDLevel:
    direction: Direction
    created_at: str
    created_bar_index: int
    level: float
    source_bar_index: int
    status: str
    invalidated_at: str | None = None
    invalidated_bar_index: int | None = None


def detect_cisd_levels(candles: pd.DataFrame) -> list[CISDLevel]:
    """
    Exact logic from your Pine script:

    bullCISD = close[1] < open[1] and close > open[1]
    bearCISD = close[1] > open[1] and close < open[1]

    Bullish line = high[1]
    Bearish line = low[1]

    Bullish line deleted if low <= level
    Bearish line deleted if high >= level
    """
    required = {"datetime", "open", "high", "low", "close"}
    missing = required - set(candles.columns)

    if missing:
        raise ValueError(f"Missing candle columns: {sorted(missing)}")

    candles = candles.reset_index(drop=True).copy()
    levels: list[CISDLevel] = []

    for bar_index in range(1, len(candles)):
        previous_open = float(candles.at[bar_index - 1, "open"])
        previous_close = float(candles.at[bar_index - 1, "close"])
        previous_high = float(candles.at[bar_index - 1, "high"])
        previous_low = float(candles.at[bar_index - 1, "low"])

        close = float(candles.at[bar_index, "close"])

        bullish_cisd = previous_close < previous_open and close > previous_open
        bearish_cisd = previous_close > previous_open and close < previous_open

        if bullish_cisd:
            levels.append(
                CISDLevel(
                    direction="bullish",
                    created_at=str(candles.at[bar_index, "datetime"]),
                    created_bar_index=bar_index,
                    level=previous_high,
                    source_bar_index=bar_index - 1,
                    status="active",
                )
            )

        if bearish_cisd:
            levels.append(
                CISDLevel(
                    direction="bearish",
                    created_at=str(candles.at[bar_index, "datetime"]),
                    created_bar_index=bar_index,
                    level=previous_low,
                    source_bar_index=bar_index - 1,
                    status="active",
                )
            )

    for level in levels:
        for bar_index in range(level.created_bar_index + 1, len(candles)):
            high = float(candles.at[bar_index, "high"])
            low = float(candles.at[bar_index, "low"])

            invalidated = (
                level.direction == "bullish" and low <= level.level
            ) or (
                level.direction == "bearish" and high >= level.level
            )

            if invalidated:
                level.status = "invalidated"
                level.invalidated_at = str(candles.at[bar_index, "datetime"])
                level.invalidated_bar_index = bar_index
                break

    return levels


def cisd_to_dict(levels: list[CISDLevel]) -> list[dict]:
    return [asdict(level) for level in levels]
