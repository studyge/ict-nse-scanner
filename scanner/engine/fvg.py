from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

import pandas as pd


Direction = Literal["bullish", "bearish"]


@dataclass
class FairValueGap:
    direction: Direction
    created_at: str
    created_bar_index: int
    left_bar_index: int
    top: float
    bottom: float
    strong_move: bool
    status: str
    filled_at: str | None = None
    filled_bar_index: int | None = None


def detect_fvgs(
    candles: pd.DataFrame,
    strong_body_ratio: float = 0.50,
) -> list[FairValueGap]:
    """
    Recreates the FVG logic from the user's Pine script.

    Bullish:
        low[current] > high[current - 2]
        zone: top=low[current], bottom=high[current - 2]

    Bearish:
        high[current] < low[current - 2]
        zone: top=low[current - 2], bottom=high[current]

    Strong move is measured on the current candle:
        abs(close - open) > (high - low) * strong_body_ratio
    """
    required = {"datetime", "open", "high", "low", "close"}
    missing = required - set(candles.columns)

    if missing:
        raise ValueError(f"Missing candle columns: {sorted(missing)}")

    candles = candles.reset_index(drop=True).copy()
    gaps: list[FairValueGap] = []

    for bar_index in range(2, len(candles)):
        open_price = float(candles.at[bar_index, "open"])
        high = float(candles.at[bar_index, "high"])
        low = float(candles.at[bar_index, "low"])
        close = float(candles.at[bar_index, "close"])

        high_two_bars_ago = float(candles.at[bar_index - 2, "high"])
        low_two_bars_ago = float(candles.at[bar_index - 2, "low"])

        body = abs(close - open_price)
        candle_range = high - low

        strong_move = (
            candle_range > 0
            and body > candle_range * strong_body_ratio
        )

        if not strong_move:
            continue

        timestamp = str(candles.at[bar_index, "datetime"])

        # Pine: bullFVG = low > high[2]
        if low > high_two_bars_ago:
            gaps.append(
                FairValueGap(
                    direction="bullish",
                    created_at=timestamp,
                    created_bar_index=bar_index,
                    left_bar_index=bar_index - 2,
                    top=low,
                    bottom=high_two_bars_ago,
                    strong_move=True,
                    status="active",
                )
            )

        # Pine: bearFVG = high < low[2]
        if high < low_two_bars_ago:
            gaps.append(
                FairValueGap(
                    direction="bearish",
                    created_at=timestamp,
                    created_bar_index=bar_index,
                    left_bar_index=bar_index - 2,
                    top=low_two_bars_ago,
                    bottom=high,
                    strong_move=True,
                    status="active",
                )
            )

    # Pine mitigation logic:
    # Bullish FVG removed if low <= box top
    # Bearish FVG removed if high >= box bottom
    for gap in gaps:
        for bar_index in range(gap.created_bar_index + 1, len(candles)):
            high = float(candles.at[bar_index, "high"])
            low = float(candles.at[bar_index, "low"])

            filled = (
                gap.direction == "bullish" and low <= gap.top
            ) or (
                gap.direction == "bearish" and high >= gap.bottom
            )

            if filled:
                gap.status = "filled"
                gap.filled_at = str(candles.at[bar_index, "datetime"])
                gap.filled_bar_index = bar_index
                break

    return gaps


def fvgs_to_dict(gaps: list[FairValueGap]) -> list[dict]:
    return [asdict(gap) for gap in gaps]
