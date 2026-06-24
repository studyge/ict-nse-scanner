 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";
const DATA_URL = `${BASE_PATH}/data/RELIANCE_daily_chart.json`;

function candleTime(candle) {
  return Math.floor(new Date(candle.time).getTime() / 1000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const THEMES = {
  dark: {
    page: "#07101f",
    card: "#0b1729",
    text: "#e2e8f0",
    muted: "#94a3b8",
    border: "#334155",
    grid: "#172033",
    up: "#22c55e",
    down: "#ef4444",
  },
  light: {
    page: "#f1f5f9",
    card: "#ffffff",
    text: "#0f172a",
    muted: "#475569",
    border: "#cbd5e1",
    grid: "#e2e8f0",
    up: "#16a34a",
    down: "#dc2626",
  },
};

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const selectedSeriesRef = useRef(null);
  const replaySelectModeRef = useRef(false);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState(null);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [themeName, setThemeName] = useState("dark");
  const [status, setStatus] = useState("Tap ✂ Bar Replay, then tap any candle.");

  const theme = THEMES[themeName];

  useEffect(() => {
    replaySelectModeRef.current = replaySelectMode;
  }, [replaySelectMode]);

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load chart data (${response.status})`);
        return response.json();
      })
      .then((json) => {
        if (!Array.isArray(json.candles) || json.candles.length === 0) {
          throw new Error("No candles found in chart data");
        }

        const start = Math.min(50, json.candles.length - 1);
        setData(json);
        setReplayStart(start);
        setReplayIndex(start);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  useEffect(() => {
    if (!data || !chartBox.current) return;

    const chart = createChart(chartBox.current, {
      width: chartBox.current.clientWidth,
      height: 540,
      layout: {
        background: { color: THEMES.dark.page },
        textColor: THEMES.dark.text,
      },
      grid: {
        vertLines: { color: THEMES.dark.grid },
        horzLines: { color: THEMES.dark.grid },
      },
      rightPriceScale: { borderColor: THEMES.dark.border },
      timeScale: { borderColor: THEMES.dark.border, timeVisible: true },
      crosshair: { mode: 1 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: THEMES.dark.up,
      downColor: THEMES.dark.down,
      borderVisible: false,
      wickUpColor: THEMES.dark.up,
      wickDownColor: THEMES.dark.down,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.subscribeClick((param) => {
      try {
        if (!replaySelectModeRef.current || !param?.point) return;

        const logical = chart.timeScale().coordinateToLogical(param.point.x);
        if (logical === null || !Number.isFinite(logical)) return;

        const index = clamp(Math.round(logical), 0, data.candles.length - 1);
        const candle = data.candles[index];

        setPlaying(false);
        setSelectedCandleIndex(index);
        setReplayStart(index);
        setReplayIndex(index);
        setReplaySelectMode(false);

        setStatus(
          `Replay started from ${new Date(candle.time).toLocaleDateString()} · ₹${Number(candle.close).toFixed(2)}`
        );
      } catch (err) {
        console.error("Replay selection error:", err);
        setStatus("Could not select candle. Tap ✂ Bar Replay and try again.");
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
      selectedSeriesRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (!chartRef.current || !candleSeriesRef.current) return;

    const currentTheme = THEMES[themeName];

    chartRef.current.applyOptions({
      layout: {
        background: { color: currentTheme.page },
        textColor: currentTheme.text,
      },
      grid: {
        vertLines: { color: currentTheme.grid },
        horzLines: { color: currentTheme.grid },
      },
      rightPriceScale: { borderColor: currentTheme.border },
      timeScale: { borderColor: currentTheme.border },
    });

    candleSeriesRef.current.applyOptions({
      upColor: currentTheme.up,
      downColor: currentTheme.down,
      wickUpColor: currentTheme.up,
      wickDownColor: currentTheme.down,
    });
  }, [themeName]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    const candles = data.candles
      .slice(0, replayStart + 1)
      .map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      }));

    candleSeriesRef.current.setData(candles);
  }, [data, replayStart]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;
    if (replayIndex < replayStart) return;

    const candle = data.candles[replayIndex];
    if (!candle) return;

    candleSeriesRef.current.update({
      time: candleTime(candle),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close),
    });
  }, [data, replayIndex, replayStart]);

  useEffect(() => {
    if (!data || !chartRef.current) return;

    if (selectedSeriesRef.current) {
      try {
        chartRef.current.removeSeries(selectedSeriesRef.current);
      } catch (_) {}
      selectedSeriesRef.current = null;
    }

    if (selectedCandleIndex === null) return;

    const candle = data.candles[selectedCandleIndex];
    if (!candle) return;

    const verticalSeries = chartRef.current.addSeries(CandlestickSeries, {
      upColor: "#facc15",
      downColor: "#facc15",
      borderColor: "#facc15",
      wickUpColor: "#facc15",
      wickDownColor: "#facc15",
      priceLineVisible: false,
      lastValueVisible: false,
    });

    verticalSeries.setData([
      {
        time: candleTime(candle),
        open: Number(candle.low),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.high),
      },
    ]);

    selectedSeriesRef.current = verticalSeries;
  }, [data, selectedCandleIndex]);

  useEffect(() => {
    if (!playing || !data) return;

    const delay = Math.max(150, 900 / speed);

    const timer = setInterval(() => {
      setReplayIndex((current) => {
        if (current >= data.candles.length - 1) {
          setPlaying(false);
          setStatus("Replay finished.");
          return current;
        }
        return current + 1;
      });
    }, delay);

    return () => clearInterval(timer);
  }, [playing, speed, data]);

  function toggleReplaySelection() {
    setPlaying(false);

    setReplaySelectMode((active) => {
      const next = !active;
      setStatus(
        next
          ? "✂ Replay selection active. Tap near any candle."
          : "Replay selection cancelled."
      );
      return next;
    });
  }

  function nextCandle() {
    setPlaying(false);
    setReplayIndex((current) => {
      if (current >= data.candles.length - 1) return current;
      return current + 1;
    });
  }

  function resetReplay() {
    setPlaying(false);
    setReplayIndex(replayStart);
    setStatus(`Reset to selected replay candle #${replayStart + 1}.`);
  }

  if (error) {
    return (
      <main className="loading">
        <h1>Chart error</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!data) {
    return <main className="loading">Loading ICT chart data…</main>;
  }

  const current = data.candles[replayIndex];

  return (
    <main className={themeName === "light" ? "app light" : "app"}>
      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>
            {data.meta?.exchange || "NSE"}:
            {data.meta?.symbol || "RELIANCE"} · {data.meta?.interval || "daily"}
          </p>
        </div>

        <div className="price">
          <strong>₹ {Number(current.close).toFixed(2)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        <button
          className={replaySelectMode ? "toggle active" : "toggle"}
          onClick={toggleReplaySelection}
        >
          {replaySelectMode ? "✕ Cancel Replay" : "✂ Bar Replay"}
        </button>

        <button
          className="toggle"
          onClick={() => setThemeName((old) => old === "dark" ? "light" : "dark")}
        >
          {themeName === "dark" ? "☀ Light" : "☾ Dark"}
        </button>

        {replaySelectMode && <span className="replay-hint">✂ Tap near any candle</span>}
      </section>

      <section className="status-card">
        <strong>{status}</strong>
      </section>

      <section className="chart-card">
        <div
          ref={chartBox}
          className={replaySelectMode ? "chart replay-selecting" : "chart"}
        />
      </section>

      <section className="replay-card">
        <div className="replay-top">
          <span>Replay: {replayIndex + 1} / {data.candles.length}</span>
          <span>O {current.open} · H {current.high} · L {current.low} · C {current.close}</span>
        </div>

        <div className="controls">
          <button className="play" onClick={() => setPlaying((value) => !value)}>
            {playing ? "Pause" : "▶ Play"}
          </button>

          <button onClick={nextCandle}>Next ▶</button>

          <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
            <option value="1">1x speed</option>
            <option value="2">2x speed</option>
            <option value="5">5x speed</option>
          </select>

          <button onClick={resetReplay}>Reset</button>
        </div>
      </section>
    </main>
  );
}
