import unittest
import pandas as pd

from engine.structure import detect_structure


class TestStructureEngine(unittest.TestCase):
    def test_empty_data_returns_no_events(self):
        candles = pd.DataFrame(
            columns=["datetime", "open", "high", "low", "close", "volume"]
        )
        events = detect_structure(candles, swing_length=7)
        self.assertEqual(events, [])


if __name__ == "__main__":
    unittest.main()
