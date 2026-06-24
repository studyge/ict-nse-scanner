from __future__ import annotations

from dataclasses import asdict
from typing import Any
import pandas as pd


def iso_timestamp(value: Any) -> str:
    return pd.Timestamp(value).isoformat()


def export_chart_data(
    symbol: str,
    exchange: str,
    interval: str,
    candles: pd.DataFrame,
    structure_events,
    fvgs,
    cisd_levels,
    liquidity_events,
    inducements,
    order_blocks,
) -> dict:
    candle_data = []

    for index, row in candles.reset_index(drop=True).iterrows():
        candle_data.append({
            "index": int(index),
            "time": iso_timestamp(row["datetime"]),
            "open": float(row["open"]),
            "high": float(row["high"]),
            "low": float(row["low"]),
            "close": float(row["close"]),
            "volume": float(row["volume"]) if pd.notna(row["volume"]) else 0.0,
        })

    structure_data = [{
        "type": event.event_type,
        "direction": event.direction,
        "time": event.timestamp,
        "bar_index": int(event.bar_index),
        "level": float(event.level),
        "pivot_bar_index": int(event.pivot_bar_index),
        "pivot_time": event.pivot_timestamp,
    } for event in structure_events]

    fvg_data = [{
        "id": f"fvg_{index}",
        "direction": item.direction,
        "start_bar_index": int(item.created_bar_index),
        "start_time": item.created_at,
        "end_bar_index": int(
            item.filled_bar_index
            if item.filled_bar_index is not None
            else len(candle_data) - 1
        ),
        "top": float(item.top),
        "bottom": float(item.bottom),
        "status": item.status,
        "filled_at": item.filled_at,
    } for index, item in enumerate(fvgs)]

    cisd_data = [{
        "id": f"cisd_{index}",
        "direction": item.direction,
        "level": float(item.level),
        "start_bar_index": int(item.created_bar_index),
        "start_time": item.created_at,
        "end_bar_index": int(
            item.invalidated_bar_index
            if item.invalidated_bar_index is not None
            else len(candle_data) - 1
        ),
        "status": item.status,
    } for index, item in enumerate(cisd_levels)]

    liquidity_data = [{
        "id": f"liq_{index}",
        "kind": item.kind,
        "side": item.side,
        "direction": item.direction,
        "level": float(item.level),
        "start_bar_index": int(item.created_bar_index),
        "start_time": item.created_at,
        "end_bar_index": int(
            item.taken_bar_index
            if getattr(item, "taken_bar_index", None) is not None
            else len(candle_data) - 1
        ),
        "status": item.status,
    } for index, item in enumerate(liquidity_events)]

    inducement_data = [{
        "id": f"idm_{index}",
        "kind": getattr(item, "kind", "inducement"),
        "side": getattr(item, "side", ""),
        "direction": item.direction,
        "level": float(item.level),
        "start_bar_index": int(item.created_bar_index),
        "start_time": item.created_at,
        "end_bar_index": int(
            item.taken_bar_index
            if getattr(item, "taken_bar_index", None) is not None
            else len(candle_data) - 1
        ),
        "status": item.status,
    } for index, item in enumerate(inducements)]

    order_block_data = [{
        "id": item.id,
        "direction": item.direction,
        "status": item.status,
        "zone_mode": item.zone_mode,
        "top": float(item.top),
        "bottom": float(item.bottom),
        "full_top": float(item.full_top),
        "full_bottom": float(item.full_bottom),
        "start_bar_index": int(item.created_bar_index),
        "start_time": item.created_at,
        "bos_bar_index": int(item.bos_bar_index),
        "bos_time": item.bos_at,
        "end_bar_index": int(
            item.invalidated_bar_index
            if item.invalidated_bar_index is not None
            else len(candle_data) - 1
        ),
        "mitigated_at": item.mitigated_at,
        "invalidated_at": item.invalidated_at,
        "strength": float(item.strength),
        "scanner_eligible": bool(item.scanner_eligible),
    } for item in order_blocks]

    return {
        "meta": {
            "symbol": symbol,
            "exchange": exchange,
            "interval": interval,
            "candles": len(candle_data),
            "schema_version": "1.0",
        },
        "candles": candle_data,
        "overlays": {
            "structure": structure_data,
            "fvgs": fvg_data,
            "order_blocks": order_block_data,
            "cisd_levels": cisd_data,
            "liquidity": liquidity_data,
            "inducements": inducement_data,
        },
    }
