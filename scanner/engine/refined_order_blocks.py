from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

from engine.structure import StructureEvent

Direction = Literal["bullish", "bearish"]
Status = Literal["fresh", "mitigated", "invalidated"]
ZoneMode = Literal["full", "refined"]


@dataclass
class RefinedOrderBlock:
    id: str
    direction: Direction
    created_at: str
    created_bar_index: int
    bos_at: str
    bos_bar_index: int
    structure_type: str
    structure_level: float

    # Full candle zone is retained for optional visualization.
    full_top: float
    full_bottom: float

    # Refined zone:
    # bullish: open -> low
    # bearish: open -> high
    top: float
    bottom: float
    zone_mode: ZoneMode

    status: Status
    strength: float
    search_back_candles: int

    mitigated_at: str | None = None
    mitigated_bar_index: int | None = None
    invalidated_at: str | None = None
    invalidated_bar_index: int | None = None

    # Scanner eligibility: only recent fresh/mitigated zones.
    scanner_eligible: bool = False


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
    start = max(0, bos_bar_index - lookback)

    for index in range(bos_bar_index - 1, start - 1, -1):
        open_price = float(candles.at[index, "open"])
        close_price = float(candles.at[index, "close"])

        if direction == "bullish" and close_price < open_price:
            return index

        if direction == "bearish" and close_price > open_price:
            return index

    return None


def get_zone(candle: pd.Series, direction: Direction, zone_mode: ZoneMode) -> tuple[float, float]:
    high = float(candle["high"])
    low = float(candle["low"])
    open_price = float(candle["open"])

    if zone_mode == "full":
        return high, low

    # Refined ICT zone
    if direction == "bullish":
        return max(open_price, low), min(open_price, low)

    return max(open_price, high), min(open_price, high)


def detect_refined_order_blocks(
    candles: pd.DataFrame,
    structure_events: list[StructureEvent],
    lookback: int = 10,
    min_displacement_body_ratio: float = 0.50,
    zone_mode: ZoneMode = "refined",
    recent_candles: int = 100,
) -> list[RefinedOrderBlock]:
    candles = candles.reset_index(drop=True).copy()
    blocks: list[RefinedOrderBlock] = []

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
        full_top = float(ob_candle["high"])
        full_bottom = float(ob_candle["low"])
        top, bottom = get_zone(ob_candle, direction, zone_mode)

        block = RefinedOrderBlock(
            id=f"ob_{direction}_{ob_index}_{bos_index}",
            direction=direction,
            created_at=str(ob_candle["datetime"]),
            created_bar_index=ob_index,
            bos_at=str(bos_candle["datetime"]),
            bos_bar_index=bos_index,
            structure_type=event.event_type,
            structure_level=float(event.level),
            full_top=full_top,
            full_bottom=full_bottom,
            top=top,
            bottom=bottom,
            zone_mode=zone_mode,
            status="fresh",
            strength=round(displacement * 100, 2),
            search_back_candles=bos_index - ob_index,
        )

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

            if entered_zone and block.status == "fresh":
                block.status = "mitigated"
                block.mitigated_at = str(candles.at[index, "datetime"])
                block.mitigated_bar_index = index

        block.scanner_eligible = (
            block.status in {"fresh", "mitigated"}
            and (len(candles) - 1 - block.created_bar_index) <= recent_candles
        )

        blocks.append(block)

    unique: dict[tuple, RefinedOrderBlock] = {}

    for block in blocks:
        key = (
            block.direction,
            block.created_bar_index,
            round(block.top, 4),
            round(block.bottom, 4),
            block.zone_mode,
        )

        if key not in unique:
            unique[key] = block

    return list(unique.values())


def refined_order_blocks_to_dict(blocks: list[RefinedOrderBlock]) -> list[dict]:
    return [asdict(block) for block in blocks]
