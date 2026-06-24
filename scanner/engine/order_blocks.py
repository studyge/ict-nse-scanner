from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal
import pandas as pd

from engine.structure import StructureEvent

Direction = Literal["bullish", "bearish"]


@dataclass
class OrderBlock:
    direction: Direction
    created_at: str
    created_bar_index: int
    bos_bar_index: int
    bos_level: float
    top: float
    bottom: float
    status: str
    mitigated_at: str | None = None
    mitigated_bar_index: int | None = None


def is_strong_candle(candle: pd.Series, body_ratio: float = 0.60) -> bool:
    body = abs(float(candle["close"]) - float(candle["open"]))
    candle_range = float(candle["high"]) - float(candle["low"])
    return candle_range > 0 and body > candle_range * body_ratio


def detect_order_blocks(
    candles: pd.DataFrame,
    structure_events: list[StructureEvent],
    strong_body_ratio: float = 0.60,
) -> list[OrderBlock]:
    """
    Matches the first Pine script:

    Bullish OB:
    - bullish BOS
    - BOS candle is strong
    - previous candle bearish
    - zone = previous candle high / low

    Bearish OB:
    - bearish BOS
    - BOS candle is strong
    - previous candle bullish
    - zone = previous candle high / low
    """
    candles = candles.reset_index(drop=True).copy()
    blocks: list[OrderBlock] = []

    for event in structure_events:
        # Your Pine script creates OB only when showBOS + bullBreak/bearBreak.
        # CHoCH is also a break, but we keep OBs BOS-only for cleaner signals.
        if event.event_type != "BOS":
            continue

        bos_bar = event.bar_index

        if bos_bar < 1 or bos_bar >= len(candles):
            continue

        bos_candle = candles.iloc[bos_bar]
        previous_candle = candles.iloc[bos_bar - 1]

        if not is_strong_candle(bos_candle, strong_body_ratio):
            continue

        previous_is_bearish = (
            float(previous_candle["close"]) < float(previous_candle["open"])
        )
        previous_is_bullish = (
            float(previous_candle["close"]) > float(previous_candle["open"])
        )

        bullish_ob = event.direction == "bullish" and previous_is_bearish
        bearish_ob = event.direction == "bearish" and previous_is_bullish

        if not bullish_ob and not bearish_ob:
            continue

        direction: Direction = "bullish" if bullish_ob else "bearish"

        blocks.append(
            OrderBlock(
                direction=direction,
                created_at=str(previous_candle["datetime"]),
                created_bar_index=bos_bar - 1,
                bos_bar_index=bos_bar,
                bos_level=float(event.level),
                top=float(previous_candle["high"]),
                bottom=float(previous_candle["low"]),
                status="active",
            )
        )

    # Same mitigation as Pine:
    # Bullish OB deleted if low <= OB bottom
    # Bearish OB deleted if high >= OB top
    for block in blocks:
        for bar_index in range(block.bos_bar_index + 1, len(candles)):
            high = float(candles.at[bar_index, "high"])
            low = float(candles.at[bar_index, "low"])

            mitigated = (
                block.direction == "bullish" and low <= block.bottom
            ) or (
                block.direction == "bearish" and high >= block.top
            )

            if mitigated:
                block.status = "mitigated"
                block.mitigated_at = str(candles.at[bar_index, "datetime"])
                block.mitigated_bar_index = bar_index
                break

    return blocks


def order_blocks_to_dict(blocks: list[OrderBlock]) -> list[dict]:
    return [asdict(block) for block in blocks]
