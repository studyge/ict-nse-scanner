from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Literal

Direction = Literal["bullish", "bearish"]


@dataclass
class TradeSetup:
    direction: Direction
    score: int
    grade: str
    order_block_top: float
    order_block_bottom: float
    order_block_status: str
    reasons: list[str]
    liquidity_target: float | None
    created_at: str


def overlaps(top_a: float, bottom_a: float, top_b: float, bottom_b: float) -> bool:
    return bottom_a <= top_b and top_a >= bottom_b


def build_trade_setups(
    order_blocks,
    fvgs,
    structure_events,
    liquidity_events,
    cisd_levels,
) -> list[TradeSetup]:
    """
    Score only fresh / mitigated order blocks.
    Fresh OB = stronger setup.
    """
    setups: list[TradeSetup] = []

    active_fvgs = [x for x in fvgs if x.status == "active"]
    active_cisd = [x for x in cisd_levels if x.status == "active"]
    active_pools = [
        x for x in liquidity_events
        if x.kind == "liquidity_pool" and x.status == "active"
    ]
    sweeps = [x for x in liquidity_events if x.kind == "sweep"]

    for ob in order_blocks:
        if ob.status == "invalidated":
            continue

        score = 0
        reasons: list[str] = []

        # Base OB score
        if ob.status == "fresh":
            score += 35
            reasons.append("fresh order block")
        else:
            score += 20
            reasons.append("mitigated order block")

        # Displacement strength: max 20
        displacement_points = min(20, int(ob.strength / 5))
        score += displacement_points
        reasons.append(f"displacement {ob.strength}%")

        # BOS/CHoCH
        if ob.structure_type == "CHoCH":
            score += 15
            reasons.append("CHoCH confirmation")
        else:
            score += 10
            reasons.append("BOS confirmation")

        # FVG overlaps OB zone
        matching_fvgs = [
            fvg for fvg in active_fvgs
            if fvg.direction == ob.direction
            and overlaps(ob.top, ob.bottom, fvg.top, fvg.bottom)
        ]
        if matching_fvgs:
            score += 15
            reasons.append("active FVG overlaps OB")

        # CISD matching direction after OB creation
        matching_cisd = [
            level for level in active_cisd
            if level.direction == ob.direction
            and level.created_bar_index >= ob.created_bar_index
        ]
        if matching_cisd:
            score += 10
            reasons.append("active CISD confirmation")

        # Liquidity sweep before or around BOS
        matching_sweeps = [
            sweep for sweep in sweeps
            if sweep.direction == ob.direction
            and sweep.created_bar_index <= ob.bos_bar_index
            and sweep.created_bar_index >= max(0, ob.bos_bar_index - 15)
        ]
        if matching_sweeps:
            score += 10
            reasons.append("recent liquidity sweep")

        # Find target liquidity on the opposite side.
        target_side = "buyside" if ob.direction == "bullish" else "sellside"
        possible_targets = [
            pool for pool in active_pools
            if pool.side == target_side
        ]

        target = None
        if possible_targets:
            if ob.direction == "bullish":
                above = [x for x in possible_targets if x.level > ob.top]
                if above:
                    target = min(above, key=lambda x: x.level).level
            else:
                below = [x for x in possible_targets if x.level < ob.bottom]
                if below:
                    target = max(below, key=lambda x: x.level).level

        if target is not None:
            score += 10
            reasons.append("active liquidity target")

        score = min(score, 100)

        grade = (
            "A+" if score >= 85 else
            "A" if score >= 75 else
            "B" if score >= 60 else
            "C"
        )

        setups.append(TradeSetup(
            direction=ob.direction,
            score=score,
            grade=grade,
            order_block_top=ob.top,
            order_block_bottom=ob.bottom,
            order_block_status=ob.status,
            reasons=reasons,
            liquidity_target=target,
            created_at=ob.created_at,
        ))

    return sorted(setups, key=lambda item: item.score, reverse=True)


def setups_to_dict(setups: list[TradeSetup]) -> list[dict]:
    return [asdict(setup) for setup in setups]
