import unittest
import pandas as pd

from engine.order_blocks import detect_order_blocks
from engine.structure import StructureEvent


class TestOrderBlocks(unittest.TestCase):
    def test_bullish_ob_is_created(self):
        candles = pd.DataFrame([
            {"datetime": "2026-01-01", "open": 100, "high": 105, "low": 95, "close": 98},
            {"datetime": "2026-01-02", "open": 99, "high": 125, "low": 98, "close": 122},
        ])

        events = [StructureEvent(
            timestamp="2026-01-02",
            bar_index=1,
            event_type="BOS",
            direction="bullish",
            level=106.0,
            pivot_bar_index=0,
            pivot_timestamp="2026-01-01",
        )]

        blocks = detect_order_blocks(candles, events)
        self.assertEqual(len(blocks), 1)
        self.assertEqual(blocks[0].direction, "bullish")
        self.assertEqual(blocks[0].top, 105.0)
        self.assertEqual(blocks[0].bottom, 95.0)


if __name__ == "__main__":
    unittest.main()
