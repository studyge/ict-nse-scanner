from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

import pandas as pd


EventType = Literal["BOS", "CHoCH"]
Direction = Literal["bullish", "bearish"]


@dataclass
class StructureEvent:
    candle_index: int
    time: str
    event_type: EventType
    direction: Direction
    level: float
    pivot_index: int
    pivot_time: str


def detect_market_structure(
    candles: pd.DataFrame,
    swing_length: int = 7,
    min_gap: int = 10,
) -> list[StructureEvent]:
    """
    Script 1 structure logic:
    - confirmed pivots use swing_length candles on both sides
    - BOS / CHoCH trigger only once per pivot level
    - no future candle data is used before a pivot is confirmed
    """
    required = {"datetime", "high", "low", "close"}
    missing = required - set(candles.columns)
    if missing:
        raise ValueError(f"Missing candle columns: {sorted(missing)}")

    if len(candles) < (swing_length * 2 + 1):
        return []

    df = candles.reset_index(drop=True).copy()

    last_high = None
    last_low = None
    last_high_index = None
    last_low_index = None

    # Prevent the same swing level from producing repeated breaks.
    high_consumed = False
    low_consumed = False

    trend = 0
    last_signal_index = None
    events: list[StructureEvent] = []

    for current_index in range(len(df)):
        pivot_index = current_index - swing_length

        if pivot_index >= swing_length:
            left = pivot_index - swing_length
            right = pivot_index + swing_length + 1

            window_highs = df.loc[left:right - 1, "high"]
            window_lows = df.loc[left:right - 1, "low"]

            pivot_high = float(df.at[pivot_index, "high"])
            pivot_low = float(df.at[pivot_index, "low"])

            if pivot_high == float(window_highs.max()) and (window_highs == pivot_high).sum() == 1:
                last_high = pivot_high
                last_high_index = pivot_index
                high_consumed = False

            if pivot_low == float(window_lows.min()) and (window_lows == pivot_low).sum() == 1:
                last_low = pivot_low
                last_low_index = pivot_index
                low_consumed = False

        if current_index == 0:
            continue

        close = float(df.at[current_index, "close"])
        previous_close = float(df.at[current_index - 1, "close"])

        bull_break = (
            not high_consumed
            and last_high is not None
            and close > last_high
            and previous_close <= last_high
        )

        bear_break = (
            not low_consumed
            and last_low is not None
            and close < last_low
            and previous_close >= last_low
        )

        can_draw = (
            last_signal_index is None
            or current_index - last_signal_index > min_gap
        )

        if bull_break and can_draw and last_high_index is not None:
            event_type = "CHoCH" if trend == -1 else "BOS"

            events.append(
                StructureEvent(
                    candle_index=current_index,
                    time=str(df.at[current_index, "datetime"]),
                    event_type=event_type,
                    direction="bullish",
                    level=last_high,
                    pivot_index=last_high_index,
                    pivot_time=str(df.at[last_high_index, "datetime"]),
                )
            )

            trend = 1
            last_signal_index = current_index
            high_consumed = True

        elif bear_break and can_draw and last_low_index is not None:
            event_type = "CHoCH" if trend == 1 else "BOS"

            events.append(
                StructureEvent(
                    candle_index=current_index,
                    time=str(df.at[current_index, "datetime"]),
                    event_type=event_type,
                    direction="bearish",
                    level=last_low,
                    pivot_index=last_low_index,
                    pivot_time=str(df.at[last_low_index, "datetime"]),
                )
            )

            trend = -1
            last_signal_index = current_index
            low_consumed = True

    return events


def events_to_records(events: list[StructureEvent]) -> list[dict]:
    return [asdict(event) for event in events]
