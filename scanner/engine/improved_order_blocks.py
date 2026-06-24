from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

from engine.structure import StructureEvent

Direction = Literal["bullish", "bearish"]
Status = Literal["fresh", "mitigated", "invalidated"]


@dataclass
class ImprovedOrderBlock:
    direction: Direction
    created_at: str
    created_bar_index: int
    bos_at: str
    bos_bar_index: int
    structure_type: str
    structure_level: float
    top: float
    bottom: float
    status: Status
    strength: float
    search_back_candles: int
    mitigated_at: str | None = None
    mitigated_bar_index: int | None = None
    invalidated_at: str | None = None
    invalidated_bar_index: int | None = None


def candle_body_ratio(candle: pd.Series) -> float:
    candle_range = float(candle["high"]) - float(candle["low"])
    body = abs(float(candle["close"]) - float(candle["open"]))
    return body / candle_range if candle_range > 0 else 0.0


def find_last_opposite_candle(
    candles: pd.DataFrame,
    bos_bar_index: int,
    direction: Direction,
    lookback: int,
) -> int | None:
    """
    Bullish structure: last bearish candle before displacement.
    Bearish structure: last bullish candle before displacement.
    """
    start = max(0, bos_bar_index - lookback)

    for index in range(bos_bar_index - 1, start - 1, -1):
        open_price = float(candles.at[index, "open"])
        close_price = float(candles.at[index, "close"])

        is_bearish = close_price < open_price
        is_bullish = close_price > open_price

        if direction == "bullish" and is_bearish:
            return index

        if direction == "bearish" and is_bullish:
            return index

    return None


def detect_improved_order_blocks(
    candles: pd.DataFrame,
    structure_events: list[StructureEvent],
    lookback: int = 10,
    min_displacement_body_ratio: float = 0.50,
) -> list[ImprovedOrderBlock]:
    """
    ICT-style version:
    - BOS or CHoCH must have a displacement candle
    - searches backwards for last opposite-color candle
    - OB zone is that candle's full high-low range
    - fresh = price has not entered zone after BOS
    - mitigated = price entered zone but did not break invalidation edge
    - invalidated = bullish closes below bottom / bearish closes above top
    """
    candles = candles.reset_index(drop=True).copy()
    blocks: list[ImprovedOrderBlock] = []

    for event in structure_events:
        bos_index = event.bar_index

        if bos_index < 1 or bos_index >= len(candles):
            continue

        bos_candle = candles.iloc[bos_index]
        displacement = candle_body_ratio(bos_candle)

        if displacement < min_displacement_body_ratio:
            continue

        direction: Direction = event.direction
        ob_index = find_last_opposite_candle(
            candles=candles,
            bos_bar_index=bos_index,
            direction=direction,
            lookback=lookback,
        )

        if ob_index is None:
            continue

        ob_candle = candles.iloc[ob_index]

        block = ImprovedOrderBlock(
            direction=direction,
            created_at=str(ob_candle["datetime"]),
            created_bar_index=ob_index,
            bos_at=str(bos_candle["datetime"]),
            bos_bar_index=bos_index,
            structure_type=event.event_type,
            structure_level=float(event.level),
            top=float(ob_candle["high"]),
            bottom=float(ob_candle["low"]),
            status="fresh",
            strength=round(displacement * 100, 2),
            search_back_candles=bos_index - ob_index,
        )

        # Check every candle after BOS for mitigation / invalidation.
        for index in range(bos_index + 1, len(candles)):
            high = float(candles.at[index, "high"])
            low = float(candles.at[index, "low"])
            close = float(candles.at[index, "close"])

            entered_zone = low <= block.top and high >= block.bottom

            if direction == "bullish" and close < block.bottom:
                block.status = "invalidated"
                block.invalidated_at = str(candles.at[index, "datetime"])
                block.invalidated_bar_index = index
                break

            if direction == "bearish" and close > block.top:
                block.status = "invalidated"
                block.invalidated_at = str(candles.at[index, "datetime"])
                block.invalidated_bar_index = index
                break

            if entered_zone:
                block.status = "mitigated"
                block.mitigated_at = str(candles.at[index, "datetime"])
                block.mitigated_bar_index = index
                # Keep checking: a mitigated zone can later invalidate.

        blocks.append(block)

    # Remove duplicate OBs created from repeated structure breaks.
    unique: dict[tuple, ImprovedOrderBlock] = {}
    for block in blocks:
        key = (
            block.direction,
            block.created_bar_index,
            round(block.top, 4),
            round(block.bottom, 4),
        )
        if key not in unique:
            unique[key] = block

    return list(unique.values())


def improved_order_blocks_to_dict(blocks: list[ImprovedOrderBlock]) -> list[dict]:
    return [asdict(block) for block in blocks]
