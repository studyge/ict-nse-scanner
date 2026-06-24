"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const defaultToggles = {
  structure: true,
  fvgs: true,
  orderBlocks: true,
  cisd: true,
  liquidity: true,
  inducements: true
};

function lineColor(item) {
  if (item.direction === "bullish") return "#14b8a6";
  if (item.direction === "bearish") return "#ef4444";
  return "#f59e0b";
}

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const [data, setData] = useState(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toggles, setToggles] = useState(defaultToggles);

  useEffect(() => {
    fetch("/data/RELIANCE_daily_chart.json")
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setReplayIndex(json.candles.length - 1);
      })
      .catch((error) => console.error("Chart data error:", error));
  }, []);

  useEffect(() => {
    if (!data || !chartBox.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
    }

    const chart = createChart(chartBox.current, {
      width: chartBox.current.clientWidth,
      height: 500,
      layout: {
        background: { color: "#0b1220" },
        textColor: "#cbd5e1"
      },
      grid: {
        vertLines: { color: "#172033" },
        horzLines: { color: "#172033" }
      },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155", timeVisible: true }
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444"
    });

    chartRef.current = chart;
    candleSeriesRef.current = series;

    const resize = () => {
      if (chartBox.current) {
        chart.applyOptions({ width: chartBox.current.clientWidth });
      }
    };

    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
    };
  }, [data]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current || !chartRef.current) return;

    const visibleCandles = data.candles.slice(0, replayIndex + 1).map((c) => ({
      time: Math.floor(new Date(c.time).getTime() / 1000),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    }));

    candleSeriesRef.current.setData(visibleCandles);

    // Remove old overlay price lines by rebuilding only visible active levels.
    // Lightweight Charts price lines are used in v1; rectangles come in Phase 8.
    const overlays = data.overlays;

    if (toggles.structure) {
      overlays.structure
        .filter((x) => x.bar_index <= replayIndex)
        .forEach((x) => {
          candleSeriesRef.current.createPriceLine({
            price: x.level,
            color: lineColor(x),
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title: x.type
          });
        });
    }

    if (toggles.cisd) {
      overlays.cisd_levels
        .filter((x) => x.start_bar_index <= replayIndex && x.status === "active")
        .forEach((x) => {
          candleSeriesRef.current.createPriceLine({
            price: x.level,
            color: "#eab308",
            lineWidth: 1,
            lineStyle: 1,
            axisLabelVisible: false,
            title: "CISD"
          });
        });
    }

    if (toggles.liquidity) {
      overlays.liquidity
        .filter((x) => x.start_bar_index <= replayIndex && x.status === "active")
        .forEach((x) => {
          candleSeriesRef.current.createPriceLine({
            price: x.level,
            color: "#f97316",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: false,
            title: x.side === "buyside" ? "BSL" : "SSL"
          });
        });
    }

    chartRef.current.timeScale().fitContent();
  }, [data, replayIndex, toggles]);

  useEffect(() => {
    if (!playing || !data) return;

    const delay = Math.max(120, 800 / speed);
    const timer = setInterval(() => {
      setReplayIndex((current) => {
        if (current >= data.candles.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, delay);

    return () => clearInterval(timer);
  }, [playing, speed, data]);

  if (!data) {
    return <main className="loading">Loading ICT chart data…</main>;
  }

  const current = data.candles[replayIndex];
  const overlays = data.overlays;

  const visibleFvgs = overlays.fvgs.filter(
    (x) => x.start_bar_index <= replayIndex &&
      (x.status === "active" || x.end_bar_index >= replayIndex)
  );

  const visibleObs = overlays.order_blocks.filter(
    (x) => x.start_bar_index <= replayIndex
  );

  return (
    <main>
      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>{data.meta.exchange}:{data.meta.symbol} · {data.meta.interval}</p>
        </div>
        <div className="price">
          <strong>₹ {current.close.toFixed(2)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        {Object.entries({
          structure: "BOS / CHoCH",
          fvgs: `FVG (${visibleFvgs.length})`,
          orderBlocks: `OB (${visibleObs.length})`,
          cisd: "CISD",
          liquidity: "Liquidity",
          inducements: "IDM"
        }).map(([key, label]) => (
          <button
            key={key}
            className={toggles[key] ? "toggle active" : "toggle"}
            onClick={() => setToggles((old) => ({ ...old, [key]: !old[key] }))}
          >
            {toggles[key] ? "✓ " : ""}{label}
          </button>
        ))}
      </section>

      <section className="chart-card">
        <div ref={chartBox} className="chart" />
      </section>

      <section className="replay-card">
        <div className="replay-top">
          <span>Bar Replay: {replayIndex + 1} / {data.candles.length}</span>
          <span>O {current.open} · H {current.high} · L {current.low} · C {current.close}</span>
        </div>

        <input
          type="range"
          min="0"
          max={data.candles.length - 1}
          value={replayIndex}
          onChange={(e) => {
            setPlaying(false);
            setReplayIndex(Number(e.target.value));
          }}
        />

        <div className="controls">
          <button onClick={() => { setPlaying(false); setReplayIndex(Math.max(0, replayIndex - 1)); }}>◀ Prev</button>
          <button className="play" onClick={() => setPlaying((x) => !x)}>
            {playing ? "Pause" : "▶ Play"}
          </button>
          <button onClick={() => { setPlaying(false); setReplayIndex(Math.min(data.candles.length - 1, replayIndex + 1)); }}>Next ▶</button>

          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value="1">1x speed</option>
            <option value="2">2x speed</option>
            <option value="5">5x speed</option>
          </select>

          <button onClick={() => { setPlaying(false); setReplayIndex(0); }}>Reset</button>
        </div>
      </section>

      <section className="zones">
        {toggles.orderBlocks && (
          <div className="zone-list">
            <h2>Order Blocks</h2>
            {visibleObs.length === 0 ? <p>No OB created yet at this replay candle.</p> :
              visibleObs.map((x) => (
                <div key={x.id} className={`zone ${x.direction} ${x.status}`}>
                  <b>{x.direction.toUpperCase()} OB</b>
                  <span>₹ {x.bottom.toFixed(2)} — ₹ {x.top.toFixed(2)}</span>
                  <small>{x.status} · {x.zone_mode}</small>
                </div>
              ))
            }
          </div>
        )}

        {toggles.fvgs && (
          <div className="zone-list">
            <h2>Fair Value Gaps</h2>
            {visibleFvgs.length === 0 ? <p>No visible FVG at this candle.</p> :
              visibleFvgs.slice(-8).map((x) => (
                <div key={x.id} className={`zone ${x.direction}`}>
                  <b>{x.direction.toUpperCase()} FVG</b>
                  <span>₹ {x.bottom.toFixed(2)} — ₹ {x.top.toFixed(2)}</span>
                  <small>{x.status}</small>
                </div>
              ))
            }
          </div>
        )}
      </section>
    </main>
  );
}
