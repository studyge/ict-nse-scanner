from __future__ import annotations

from dataclasses import dataclass, asdict
from typing import Literal
import pandas as pd

Direction = Literal["bullish", "bearish"]
Side = Literal["buyside", "sellside"]
Kind = Literal["liquidity_pool", "equal_high", "equal_low", "grab", "sweep", "inducement"]


@dataclass
class LiquidityEvent:
    kind: Kind
    side: Side
    direction: Direction | None
    created_at: str
    created_bar_index: int
    level: float
    pivot_bar_index: int | None
    status: str
    taken_at: str | None = None
    taken_bar_index: int | None = None
    notes: str = ""


def atr(candles: pd.DataFrame, period: int = 14) -> pd.Series:
    high_low = candles["high"] - candles["low"]
    high_close = (candles["high"] - candles["close"].shift(1)).abs()
    low_close = (candles["low"] - candles["close"].shift(1)).abs()
    tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
    return tr.rolling(period, min_periods=1).mean()


def pivot_highs_lows(candles: pd.DataFrame, left: int = 5, right: int = 5):
    highs, lows = [], []
    for i in range(left, len(candles) - right):
        high = float(candles.at[i, "high"])
        low = float(candles.at[i, "low"])

        high_window = candles.loc[i-left:i+right, "high"]
        low_window = candles.loc[i-left:i+right, "low"]

        if high == float(high_window.max()) and int((high_window == high).sum()) == 1:
            highs.append(i)

        if low == float(low_window.min()) and int((low_window == low).sum()) == 1:
            lows.append(i)

    return highs, lows


def detect_liquidity(
    candles: pd.DataFrame,
    pivot_left: int = 5,
    pivot_right: int = 5,
    equal_atr_factor: float = 0.5,
    equal_lookback: int = 3,
) -> list[LiquidityEvent]:
    candles = candles.reset_index(drop=True).copy()
    required = {"datetime", "open", "high", "low", "close"}
    missing = required - set(candles.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    events: list[LiquidityEvent] = []
    highs, lows = pivot_highs_lows(candles, pivot_left, pivot_right)
    atr_values = atr(candles)

    # BSL / SSL pools from confirmed swing pivots
    for pivot in highs:
        level = float(candles.at[pivot, "high"])
        event = LiquidityEvent(
            kind="liquidity_pool",
            side="buyside",
            direction="bullish",
            created_at=str(candles.at[pivot, "datetime"]),
            created_bar_index=pivot,
            pivot_bar_index=pivot,
            level=level,
            status="active",
            notes="BSL at confirmed swing high",
        )
        for i in range(pivot + 1, len(candles)):
            if float(candles.at[i, "high"]) >= level:
                event.status = "taken"
                event.taken_at = str(candles.at[i, "datetime"])
                event.taken_bar_index = i
                break
        events.append(event)

    for pivot in lows:
        level = float(candles.at[pivot, "low"])
        event = LiquidityEvent(
            kind="liquidity_pool",
            side="sellside",
            direction="bearish",
            created_at=str(candles.at[pivot, "datetime"]),
            created_bar_index=pivot,
            pivot_bar_index=pivot,
            level=level,
            status="active",
            notes="SSL at confirmed swing low",
        )
        for i in range(pivot + 1, len(candles)):
            if float(candles.at[i, "low"]) <= level:
                event.status = "taken"
                event.taken_at = str(candles.at[i, "datetime"])
                event.taken_bar_index = i
                break
        events.append(event)

    # Equal highs / lows: compare newest pivot with previous pivots
    for pivot_list, side, kind, price_column in [
        (highs, "buyside", "equal_high", "high"),
        (lows, "sellside", "equal_low", "low"),
    ]:
        for pos, current in enumerate(pivot_list):
            start = max(0, pos - equal_lookback)
            for old in pivot_list[start:pos]:
                current_price = float(candles.at[current, price_column])
                old_price = float(candles.at[old, price_column])
                tolerance = float(atr_values.iloc[current]) * equal_atr_factor

                if abs(current_price - old_price) <= tolerance:
                    level = (current_price + old_price) / 2
                    events.append(LiquidityEvent(
                        kind=kind,
                        side=side,
                        direction=None,
                        created_at=str(candles.at[current, "datetime"]),
                        created_bar_index=current,
                        pivot_bar_index=old,
                        level=level,
                        status="active",
                        notes=f"Equal pivot pair: bars {old} and {current}",
                    ))
                    break

    # Grabs / sweeps from pivot levels
    # Grab: wick crosses level but closes back inside.
    # Sweep: wick crosses level and closes beyond level.
    pivot_levels = [(i, "buyside", float(candles.at[i, "high"])) for i in highs]
    pivot_levels += [(i, "sellside", float(candles.at[i, "low"])) for i in lows]

    for pivot, side, level in pivot_levels:
        for i in range(pivot + 1, len(candles)):
            high = float(candles.at[i, "high"])
            low = float(candles.at[i, "low"])
            close = float(candles.at[i, "close"])

            crossed = high >= level if side == "buyside" else low <= level
            if not crossed:
                continue

            closed_back_inside = close <= level if side == "buyside" else close >= level
            kind = "grab" if closed_back_inside else "sweep"
            direction = "bearish" if side == "buyside" else "bullish"

            events.append(LiquidityEvent(
                kind=kind,
                side=side,
                direction=direction,
                created_at=str(candles.at[i, "datetime"]),
                created_bar_index=i,
                pivot_bar_index=pivot,
                level=level,
                status="confirmed",
                taken_at=str(candles.at[i, "datetime"]),
                taken_bar_index=i,
                notes="Wick-through pivot with close-back-inside" if kind == "grab"
                      else "Wick-through pivot with close beyond level",
            ))
            break

    return events


def detect_inducements(candles: pd.DataFrame, structure_events) -> list[LiquidityEvent]:
    """
    First confirmed opposite pivot after a BOS/CHoCH.
    This is the initial IDM implementation; later we can add the
    exact multi-timeframe Pine behavior.
    """
    candles = candles.reset_index(drop=True).copy()
    highs, lows = pivot_highs_lows(candles, 1, 1)
    events = []

    for structure in structure_events:
        after = structure.bar_index

        if structure.direction == "bullish":
            candidates = [i for i in lows if i > after]
            if candidates:
                i = candidates[0]
                events.append(LiquidityEvent(
                    kind="inducement",
                    side="sellside",
                    direction="bullish",
                    created_at=str(candles.at[i, "datetime"]),
                    created_bar_index=i,
                    pivot_bar_index=i,
                    level=float(candles.at[i, "low"]),
                    status="active",
                    notes=f"First pullback low after {structure.event_type}",
                ))

        if structure.direction == "bearish":
            candidates = [i for i in highs if i > after]
            if candidates:
                i = candidates[0]
                events.append(LiquidityEvent(
                    kind="inducement",
                    side="buyside",
                    direction="bearish",
                    created_at=str(candles.at[i, "datetime"]),
                    created_bar_index=i,
                    pivot_bar_index=i,
                    level=float(candles.at[i, "high"]),
                    status="active",
                    notes=f"First pullback high after {structure.event_type}",
                ))

    return events


def liquidity_to_dict(events: list[LiquidityEvent]) -> list[dict]:
    return [asdict(event) for event in events]
