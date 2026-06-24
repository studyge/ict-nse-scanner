import unittest
import pandas as pd

from engine.refined_order_blocks import get_zone


class TestRefinedOrderBlocks(unittest.TestCase):
    def test_bullish_refined_zone_is_open_to_low(self):
        candle = pd.Series({"open": 110, "high": 115, "low": 100, "close": 105})
        top, bottom = get_zone(candle, "bullish", "refined")
        self.assertEqual(top, 110)
        self.assertEqual(bottom, 100)

    def test_bearish_refined_zone_is_open_to_high(self):
        candle = pd.Series({"open": 110, "high": 115, "low": 100, "close": 112})
        top, bottom = get_zone(candle, "bearish", "refined")
        self.assertEqual(top, 115)
        self.assertEqual(bottom, 110)


if __name__ == "__main__":
    unittest.main()
