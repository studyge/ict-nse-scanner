from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

Direction = Literal["bullish", "bearish"]
EventType = Literal["BOS", "CHoCH"]


@dataclass
class StructureEvent:
    timestamp: str
    bar_index: int
    event_type: EventType
    direction: Direction
    level: float
    pivot_bar_index: int
    pivot_timestamp: str


def find_pivots(candles: pd.DataFrame, swing_length: int = 7) -> list[dict]:
    pivots = []

    if len(candles) < (swing_length * 2 + 1):
        return pivots

    highs = candles["high"].tolist()
    lows = candles["low"].tolist()
    times = candles["datetime"].astype(str).tolist()

    for index in range(swing_length, len(candles) - swing_length):
        left_highs = highs[index - swing_length:index]
        right_highs = highs[index + 1:index + swing_length + 1]

        left_lows = lows[index - swing_length:index]
        right_lows = lows[index + 1:index + swing_length + 1]

        if highs[index] > max(left_highs) and highs[index] >= max(right_highs):
            pivots.append({
                "type": "high",
                "bar_index": index,
                "confirmed_at": index + swing_length,
                "price": float(highs[index]),
                "timestamp": times[index],
            })

        if lows[index] < min(left_lows) and lows[index] <= min(right_lows):
            pivots.append({
                "type": "low",
                "bar_index": index,
                "confirmed_at": index + swing_length,
                "price": float(lows[index]),
                "timestamp": times[index],
            })

    return sorted(pivots, key=lambda item: item["confirmed_at"])


def detect_structure(
    candles: pd.DataFrame,
    swing_length: int = 7,
    min_gap: int = 10,
) -> list[StructureEvent]:
    required = {"datetime", "open", "high", "low", "close"}
    missing = required - set(candles.columns)

    if missing:
        raise ValueError(f"Missing candle columns: {sorted(missing)}")

    candles = candles.reset_index(drop=True).copy()
    pivots = find_pivots(candles, swing_length)

    pivots_by_confirmation = {}
    for pivot in pivots:
        pivots_by_confirmation.setdefault(pivot["confirmed_at"], []).append(pivot)

    latest_high = None
    latest_low = None
    used_high_pivots = set()
    used_low_pivots = set()

    trend = 0
    last_signal_bar = None
    events = []

    for bar_index in range(len(candles)):
        for pivot in pivots_by_confirmation.get(bar_index, []):
            if pivot["type"] == "high":
                latest_high = pivot
            else:
                latest_low = pivot

        close = float(candles.at[bar_index, "close"])
        previous_close = (
            float(candles.at[bar_index - 1, "close"])
            if bar_index > 0 else close
        )

        can_draw = (
            last_signal_bar is None
            or bar_index - last_signal_bar > min_gap
        )

        bull_break = (
            latest_high is not None
            and latest_high["bar_index"] not in used_high_pivots
            and close > latest_high["price"]
            and previous_close <= latest_high["price"]
        )

        bear_break = (
            latest_low is not None
            and latest_low["bar_index"] not in used_low_pivots
            and close < latest_low["price"]
            and previous_close >= latest_low["price"]
        )

        if bull_break and can_draw:
            event_type = "CHoCH" if trend == -1 else "BOS"

            events.append(StructureEvent(
                timestamp=str(candles.at[bar_index, "datetime"]),
                bar_index=bar_index,
                event_type=event_type,
                direction="bullish",
                level=float(latest_high["price"]),
                pivot_bar_index=int(latest_high["bar_index"]),
                pivot_timestamp=str(latest_high["timestamp"]),
            ))

            used_high_pivots.add(latest_high["bar_index"])
            trend = 1
            last_signal_bar = bar_index

        elif bear_break and can_draw:
            event_type = "CHoCH" if trend == 1 else "BOS"

            events.append(StructureEvent(
                timestamp=str(candles.at[bar_index, "datetime"]),
                bar_index=bar_index,
                event_type=event_type,
                direction="bearish",
                level=float(latest_low["price"]),
                pivot_bar_index=int(latest_low["bar_index"]),
                pivot_timestamp=str(latest_low["timestamp"]),
            ))

            used_low_pivots.add(latest_low["bar_index"])
            trend = -1
            last_signal_bar = bar_index

    return events


def events_to_dict(events: list[StructureEvent]) -> list[dict]:
    return [asdict(event) for event in events]
