
"""
Pine Script parity engine for:
SMC FINAL PRO (ULTIMATE CLEAN)

Logic copied from the user's Pine Script:
- pivot swings: length 7
- BOS / CHoCH
- min gap: 10 bars
- CISD
- FVG with strong-move filter
- light order blocks
"""

def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def candle_body(c):
    return abs(num(c["close"]) - num(c["open"]))


def candle_range(c):
    return num(c["high"]) - num(c["low"])


def is_strong(c, ratio):
    rng = candle_range(c)
    return rng > 0 and candle_body(c) > rng * ratio


def detect_pine_smc(candles, swing_len=7, min_gap=10, extend_fvg=20):
    """
    Bar-by-bar Python equivalent of the supplied Pine Script.
    Output uses chart-friendly bar indexes.
    """
    structure = []
    cisd_levels = []
    fvgs = []
    order_blocks = []

    last_high = None
    last_low = None
    last_high_bar = None
    last_low_bar = None
    last_drawn_high = None
    last_drawn_low = None
    trend = 0
    last_sig_bar = None

    active_bull_cisd = []
    active_bear_cisd = []
    active_bull_fvg = []
    active_bear_fvg = []
    active_bull_ob = []
    active_bear_ob = []

    n = len(candles)

    for i in range(n):
        c = candles[i]
        o = num(c["open"])
        h = num(c["high"])
        l = num(c["low"])
        cl = num(c["close"])

        # Pine pivots become known only swing_len bars later.
        pivot_index = i - swing_len
        if pivot_index >= swing_len and pivot_index + swing_len < n:
            pivot_high = num(candles[pivot_index]["high"])
            pivot_low = num(candles[pivot_index]["low"])

            high_window = [
                num(candles[j]["high"])
                for j in range(pivot_index - swing_len, pivot_index + swing_len + 1)
            ]
            low_window = [
                num(candles[j]["low"])
                for j in range(pivot_index - swing_len, pivot_index + swing_len + 1)
            ]

            # ta.pivothigh/pivotlow behavior: central point must be max/min.
            # Equal highs/lows are ignored for cleaner scanner parity.
            if pivot_high == max(high_window) and high_window.count(pivot_high) == 1:
                last_high = pivot_high
                last_high_bar = pivot_index

            if pivot_low == min(low_window) and low_window.count(pivot_low) == 1:
                last_low = pivot_low
                last_low_bar = pivot_index

        prev_close = num(candles[i - 1]["close"]) if i >= 1 else None

        bull_break = (
            last_high is not None
            and prev_close is not None
            and cl > last_high
            and prev_close <= last_high
        )

        bear_break = (
            last_low is not None
            and prev_close is not None
            and cl < last_low
            and prev_close >= last_low
        )

        choch_up = bull_break and trend == -1
        choch_down = bear_break and trend == 1

        can_draw = last_sig_bar is None or (i - last_sig_bar > min_gap)

        # STRUCTURE — exact duplicate prevention from Pine
        if bull_break and can_draw and (last_drawn_high is None or last_high != last_drawn_high):
            structure.append({
                "type": "CHoCH_UP" if choch_up else "BOS_UP",
                "direction": "bullish",
                "level": last_high,
                "start_bar_index": last_high_bar,
                "bar_index": i,
                "status": "active"
            })
            last_drawn_high = last_high
            trend = 1
            last_sig_bar = i

        if bear_break and can_draw and (last_drawn_low is None or last_low != last_drawn_low):
            structure.append({
                "type": "CHoCH_DOWN" if choch_down else "BOS_DOWN",
                "direction": "bearish",
                "level": last_low,
                "start_bar_index": last_low_bar,
                "bar_index": i,
                "status": "active"
            })
            last_drawn_low = last_low
            trend = -1
            last_sig_bar = i

        # CISD — exact supplied conditions
        if i >= 1:
            p = candles[i - 1]
            po, ph, pl, pcl = num(p["open"]), num(p["high"]), num(p["low"]), num(p["close"])

            bull_cisd = pcl < po and cl > po
            bear_cisd = pcl > po and cl < po

            if bull_cisd:
                active_bull_cisd.append({
                    "type": "BULL_CISD",
                    "direction": "bullish",
                    "level": ph,
                    "start_bar_index": i - 1,
                    "bar_index": i,
                    "status": "active"
                })

            if bear_cisd:
                active_bear_cisd.append({
                    "type": "BEAR_CISD",
                    "direction": "bearish",
                    "level": pl,
                    "start_bar_index": i - 1,
                    "bar_index": i,
                    "status": "active"
                })

        # Pine removes CISD when current candle touches it.
        active_bull_cisd = [x for x in active_bull_cisd if l > x["level"]]
        active_bear_cisd = [x for x in active_bear_cisd if h < x["level"]]

        # FVG
        if i >= 2:
            c2 = candles[i - 2]
            high2 = num(c2["high"])
            low2 = num(c2["low"])

            bull_fvg = l > high2
            bear_fvg = h < low2
            strong_move = is_strong(c, 0.5)

            if bull_fvg and strong_move:
                active_bull_fvg.append({
                    "type": "BULL_FVG",
                    "direction": "bullish",
                    "top": l,
                    "bottom": high2,
                    "start_bar_index": i - 2,
                    "end_bar_index": i + extend_fvg,
                    "bar_index": i,
                    "status": "active"
                })

            if bear_fvg and strong_move:
                active_bear_fvg.append({
                    "type": "BEAR_FVG",
                    "direction": "bearish",
                    "top": low2,
                    "bottom": h,
                    "start_bar_index": i - 2,
                    "end_bar_index": i + extend_fvg,
                    "bar_index": i,
                    "status": "active"
                })

        # Exact Pine invalidation rules.
        active_bull_fvg = [x for x in active_bull_fvg if l > x["top"]]
        active_bear_fvg = [x for x in active_bear_fvg if h < x["bottom"]]

        # ORDER BLOCK
        if i >= 1:
            prev = candles[i - 1]
            prev_open = num(prev["open"])
            prev_high = num(prev["high"])
            prev_low = num(prev["low"])
            prev_close2 = num(prev["close"])

            strong_ob = is_strong(c, 0.6)

            if bull_break and strong_ob and prev_close2 < prev_open:
                active_bull_ob.append({
                    "type": "BULL_OB",
                    "direction": "bullish",
                    "top": prev_high,
                    "bottom": prev_low,
                    "start_bar_index": i - 1,
                    "end_bar_index": i + 25,
                    "bar_index": i,
                    "status": "active"
                })

            if bear_break and strong_ob and prev_close2 > prev_open:
                active_bear_ob.append({
                    "type": "BEAR_OB",
                    "direction": "bearish",
                    "top": prev_high,
                    "bottom": prev_low,
                    "start_bar_index": i - 1,
                    "end_bar_index": i + 25,
                    "bar_index": i,
                    "status": "active"
                })

        # Exact Pine OB invalidation.
        active_bull_ob = [x for x in active_bull_ob if l > x["bottom"]]
        active_bear_ob = [x for x in active_bear_ob if h < x["top"]]

    cisd_levels = active_bull_cisd + active_bear_cisd
    fvgs = active_bull_fvg + active_bear_fvg
    order_blocks = active_bull_ob + active_bear_ob

    return {
        "structure": structure,
        "cisd_levels": cisd_levels,
        "fvgs": fvgs,
        "order_blocks": order_blocks,
        "trend": trend
    }
