import unittest
import pandas as pd

from engine.improved_order_blocks import detect_improved_order_blocks
from engine.structure import StructureEvent


class TestImprovedOrderBlocks(unittest.TestCase):
    def test_finds_last_bearish_candle_before_bullish_bos(self):
        candles = pd.DataFrame([
            {"datetime":"2026-01-01","open":100,"high":102,"low":98,"close":99},
            {"datetime":"2026-01-02","open":99,"high":101,"low":97,"close":98},
            {"datetime":"2026-01-03","open":98,"high":125,"low":97,"close":123},
        ])

        events = [StructureEvent(
            timestamp="2026-01-03",
            bar_index=2,
            event_type="BOS",
            direction="bullish",
            level=102.0,
            pivot_bar_index=0,
            pivot_timestamp="2026-01-01",
        )]

        blocks = detect_improved_order_blocks(
            candles, events, lookback=10, min_displacement_body_ratio=0.5
        )

        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].direction, "bullish")
        self.assertEqual(blocks[0].created_bar_index, 1)
        self.assertEqual(blocks[0].status, "fresh")


if __name__ == "__main__":
    unittest.main()
