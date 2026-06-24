 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const REPO_BASE = "/ict-nse-scanner";
const DATA_URL = `${REPO_BASE}/data/RELIANCE_daily_chart.json`;

const defaultToggles = {
  structure: true,
  swings: true,
  fvgs: true,
  orderBlocks: true,
  cisd: false,
  liquidity: false,
  inducements: false,
};

function directionColor(item) {
  return item.direction === "bullish" ? "#14b8a6" : "#ef4444";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const structureSeriesRef = useRef([]);
  const swingSeriesRef = useRef([]);

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toggles, setToggles] = useState(defaultToggles);

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load chart data (${response.status})`);
        }
        return response.json();
      })
      .then((json) => {
        if (!Array.isArray(json.candles) || json.candles.length === 0) {
          throw new Error("Chart JSON has no candles");
        }

        json.overlays = json.overlays || {};
        setData(json);

        const defaultStart = Math.min(50, json.candles.length - 1);
        setReplayStart(defaultStart);
        setReplayIndex(defaultStart);
      })
      .catch((error) => {
        console.error(error);
        setLoadError(error.message);
      });
  }, []);

  useEffect(() => {
    if (!data || !chartBox.current) return;

    const chart = createChart(chartBox.current, {
      width: chartBox.current.clientWidth,
      height: 520,
      layout: {
        background: { color: "#0b1220" },
        textColor: "#cbd5e1",
      },
      grid: {
        vertLines: { color: "#172033" },
        horzLines: { color: "#172033" },
      },
      rightPriceScale: {
        borderColor: "#334155",
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
      },
      crosshair: {
        mode: 0,
      },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candles;

    chart.subscribeClick((param) => {
      if (!param || !param.time) return;

      const clickedTime = Number(param.time);
      const index = data.candles.findIndex((candle) => {
        const candleTime = Math.floor(new Date(candle.time).getTime() / 1000);
        return candleTime === clickedTime;
      });

      if (index >= 0) {
        setSelectedIndex(index);
        setPlaying(false);
      }
    });

    const resize = () => {
      if (chartBox.current) {
        chart.applyOptions({ width: chartBox.current.clientWidth });
      }
    };

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (!data || !chartRef.current || !candleSeriesRef.current) return;

    structureSeriesRef.current.forEach((series) => {
      try { chartRef.current.removeSeries(series); } catch (error) {}
    });
    swingSeriesRef.current.forEach((series) => {
      try { chartRef.current.removeSeries(series); } catch (error) {}
    });
    structureSeriesRef.current = [];
    swingSeriesRef.current = [];

    const visibleCandles = data.candles
      .slice(0, replayIndex + 1)
      .map((candle) => ({
        time: Math.floor(new Date(candle.time).getTime() / 1000),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      }));

    candleSeriesRef.current.setData(visibleCandles);

    const overlays = data.overlays || {};
    const structure = safeArray(overlays.structure);

    /*
      Short structure segments:
      start = swing candle / previous relevant swing
      end = candle where BOS or CHoCH is confirmed
      No full-chart horizontal scanner lines.
    */
    if (toggles.structure) {
      structure
        .filter((event) => Number(event.bar_index) <= replayIndex)
        .forEach((event) => {
          const endIndex = Number(event.bar_index);
          const startIndex = Math.max(0, Number(event.swing_bar_index ?? event.start_bar_index ?? endIndex - 8));

          if (!data.candles[startIndex] || !data.candles[endIndex]) return;

          const lineSeries = chartRef.current.addLineSeries({
            color: directionColor(event),
            lineWidth: 2,
            lineStyle: 2,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });

          lineSeries.setData([
            {
              time: Math.floor(new Date(data.candles[startIndex].time).getTime() / 1000),
              value: Number(event.level),
            },
            {
              time: Math.floor(new Date(data.candles[endIndex].time).getTime() / 1000),
              value: Number(event.level),
            },
          ]);

          structureSeriesRef.current.push(lineSeries);
        });
    }

    /*
      Swing dots:
      Uses structure event start point when the engine does not export
      a separate swing list yet.
    */
    if (toggles.swings) {
      const used = new Set();

      structure
        .filter((event) => Number(event.bar_index) <= replayIndex)
        .forEach((event) => {
          const swingIndex = Math.max(
            0,
            Number(event.swing_bar_index ?? event.start_bar_index ?? Number(event.bar_index) - 8)
          );

          const key = `${swingIndex}-${event.direction}`;
          if (used.has(key) || !data.candles[swingIndex]) return;
          used.add(key);

          const candle = data.candles[swingIndex];
          const isBullish = event.direction === "bullish";

          const dotSeries = chartRef.current.addLineSeries({
            color: isBullish ? "#14b8a6" : "#ef4444",
            lineWidth: 1,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          });

          dotSeries.setData([
            {
              time: Math.floor(new Date(candle.time).getTime() / 1000),
              value: isBullish ? Number(candle.low) : Number(candle.high),
            },
          ]);

          swingSeriesRef.current.push(dotSeries);
        });
    }

    const from = Math.max(0, replayIndex - 35);
    const to = Math.min(data.candles.length - 1, replayIndex + 10);

    if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
      chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    }
  }, [data, replayIndex, toggles]);

  useEffect(() => {
    if (!playing || !data) return;

    const delay = Math.max(120, 850 / speed);

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

  function startReplayFromSelected() {
    if (selectedIndex === null) return;
    setPlaying(false);
    setReplayStart(selectedIndex);
    setReplayIndex(selectedIndex);
  }

  function resetReplay() {
    setPlaying(false);
    setReplayIndex(replayStart);
  }

  if (loadError) {
    return (
      <main className="loading">
        <h1>Chart data error</h1>
        <p>{loadError}</p>
        <p>Expected data file: {DATA_URL}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="loading">Loading ICT chart data…</main>;
  }

  const current = data.candles[replayIndex];
  const selected = selectedIndex !== null ? data.candles[selectedIndex] : null;

  return (
    <main>
      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>
            {data.meta?.exchange || "NSE"}:{data.meta?.symbol || "RELIANCE"} ·{" "}
            {data.meta?.interval || "daily"}
          </p>
        </div>

        <div className="price">
          <strong>₹ {Number(current.close).toFixed(2)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        {[
          ["structure", "BOS / CHoCH"],
          ["swings", "Swing dots"],
          ["fvgs", "FVG"],
          ["orderBlocks", "OB"],
          ["cisd", "CISD"],
          ["liquidity", "Liquidity"],
          ["inducements", "IDM"],
        ].map(([key, label]) => (
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
          <span>
            Replay candle: {replayIndex + 1} / {data.candles.length}
          </span>
          <span>
            O {current.open} · H {current.high} · L {current.low} · C {current.close}
          </span>
        </div>

        <div className="selected-candle">
          {selected ? (
            <>
              <span>
                Selected candle: #{selectedIndex + 1} ·{" "}
                {new Date(selected.time).toLocaleDateString()}
              </span>
              <button className="play" onClick={startReplayFromSelected}>
                Start Replay Here
              </button>
            </>
          ) : (
            <span>Tap any candle on the chart, then choose “Start Replay Here”.</span>
          )}
        </div>

        <input
          type="range"
          min="0"
          max={data.candles.length - 1}
          value={replayIndex}
          onChange={(event) => {
            setPlaying(false);
            setReplayIndex(Number(event.target.value));
          }}
        />

        <div className="controls">
          <button
            onClick={() => {
              setPlaying(false);
              setReplayIndex(Math.max(replayStart, replayIndex - 1));
            }}
          >
            ◀ Prev
          </button>

          <button className="play" onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause" : "▶ Play"}
          </button>

          <button
            onClick={() => {
              setPlaying(false);
              setReplayIndex(Math.min(data.candles.length - 1, replayIndex + 1));
            }}
          >
            Next ▶
          </button>

          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value="1">1x speed</option>
            <option value="2">2x speed</option>
            <option value="5">5x speed</option>
          </select>

          <button onClick={resetReplay}>Reset to start candle</button>
        </div>
      </section>
    </main>
  );
}
