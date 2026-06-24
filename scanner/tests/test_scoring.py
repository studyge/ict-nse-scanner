import unittest
from types import SimpleNamespace

from engine.scoring import build_trade_setups


class TestScoring(unittest.TestCase):
    def test_fresh_ob_gets_setup(self):
        ob = SimpleNamespace(
            direction="bullish",
            status="fresh",
            strength=80.0,
            structure_type="BOS",
            top=110.0,
            bottom=100.0,
            created_at="2026-01-01",
            created_bar_index=10,
            bos_bar_index=12,
        )

        setups = build_trade_setups(
            order_blocks=[ob],
            fvgs=[],
            structure_events=[],
            liquidity_events=[],
            cisd_levels=[],
        )

        self.assertEqual(len(setups), 1)
        self.assertGreaterEqual(setups[0].score, 45)
        self.assertEqual(setups[0].direction, "bullish")


if __name__ == "__main__":
    unittest.main()
