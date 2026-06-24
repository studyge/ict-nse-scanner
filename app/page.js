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
    page: "#07101f", card: "#0b1729", text: "#e2e8f0",
    muted: "#94a3b8", border: "#334155", grid: "#172033",
    up: "#22c55e", down: "#ef4444"
  },
  light: {
    page: "#f1f5f9", card: "#ffffff", text: "#0f172a",
    muted: "#475569", border: "#cbd5e1", grid: "#e2e8f0",
    up: "#16a34a", down: "#dc2626"
  }
};

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const replaySelectModeRef = useRef(false);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [themeName, setThemeName] = useState("dark");
  const [status, setStatus] = useState("Use ✂ Bar Replay to choose a starting candle.");

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

    const theme = THEMES.dark;

    const chart = createChart(chartBox.current, {
      width: chartBox.current.clientWidth,
      height: 540,
      layout: {
        background: { color: theme.page },
        textColor: theme.text
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid }
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: {
        borderColor: theme.border,
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time) => {
          const stamp = typeof time === "number"
            ? time * 1000
            : Date.UTC(time.year, time.month - 1, time.day);

          const date = new Date(stamp);

          return date.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short"
          });
        }
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#94a3b8",
          width: 1,
          style: 2,
          visible: true,
          labelVisible: true
        },
        horzLine: {
          color: "#94a3b8",
          width: 1,
          style: 2,
          visible: true,
          labelVisible: true
        }
      }
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: theme.up,
      downColor: theme.down,
      borderVisible: false,
      wickUpColor: theme.up,
      wickDownColor: theme.down
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
        setReplayStart(index);
        setReplayIndex(index);
        setReplaySelectMode(false);

        setStatus(
          `Replay started: ${new Date(candle.time).toLocaleDateString()} · ₹${Number(candle.close).toFixed(2)}`
        );
      } catch (err) {
        console.error("Replay selection error:", err);
        setStatus("Could not select candle. Try ✂ Bar Replay again.");
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
    if (!chartRef.current || !candleSeriesRef.current) return;

    const theme = THEMES[themeName];

    chartRef.current.applyOptions({
      layout: {
        background: { color: theme.page },
        textColor: theme.text
      },
      grid: {
        vertLines: { color: theme.grid },
        horzLines: { color: theme.grid }
      },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      crosshair: {
        vertLine: {
          color: replaySelectMode ? "#facc15" : "#94a3b8",
          width: 1,
          style: 2,
          visible: true,
          labelVisible: true
        },
        horzLine: {
          color: replaySelectMode ? "#facc15" : "#94a3b8",
          width: 1,
          style: 2,
          visible: true,
          labelVisible: true
        }
      }
    });

    candleSeriesRef.current.applyOptions({
      upColor: theme.up,
      downColor: theme.down,
      wickUpColor: theme.up,
      wickDownColor: theme.down
    });
  }, [themeName, replaySelectMode]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    const initialView = replayIndex === replayStart && replayStart === Math.min(50, data.candles.length - 1);

    const candlesToShow = initialView
      ? data.candles
      : data.candles.slice(0, replayIndex + 1);

    candleSeriesRef.current.setData(
      candlesToShow.map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
    );
  }, [data, replayStart]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current || replayIndex < replayStart) return;

    const candle = data.candles[replayIndex];
    if (!candle) return;

    candleSeriesRef.current.update({
      time: candleTime(candle),
      open: Number(candle.open),
      high: Number(candle.high),
      low: Number(candle.low),
      close: Number(candle.close)
    });
  }, [data, replayIndex, replayStart]);

  useEffect(() => {
    if (!playing || !data) return;

    const timer = setInterval(() => {
      setReplayIndex((current) => {
        if (current >= data.candles.length - 1) {
          setPlaying(false);
          setStatus("Replay finished.");
          return current;
        }
        return current + 1;
      });
    }, Math.max(150, 900 / speed));

    return () => clearInterval(timer);
  }, [playing, speed, data]);

  function toggleReplaySelection() {
    setPlaying(false);
    setReplaySelectMode((old) => {
      const next = !old;
      setStatus(
        next
          ? "✂ Replay selection active. Yellow dashed line follows your candle."
          : "Replay selection cancelled."
      );
      return next;
    });
  }

  function nextCandle() {
    setPlaying(false);
    setReplayIndex((current) => Math.min(data.candles.length - 1, current + 1));
  }

  function resetReplay() {
    setPlaying(false);
    setReplayIndex(replayStart);
    setStatus(`Reset to replay start candle #${replayStart + 1}.`);
  }

  if (error) {
    return <main className="loading"><h1>Chart error</h1><p>{error}</p></main>;
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
          <p>{data.meta?.exchange || "NSE"}:{data.meta?.symbol || "RELIANCE"} · {data.meta?.interval || "daily"}</p>
        </div>
        <div className="price">
          <strong>₹ {Number(current.close).toFixed(2)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        <button className="toggle" onClick={() => setThemeName((old) => old === "dark" ? "light" : "dark")}>
          {themeName === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
      </section>

      <section className="status-card">
        <strong>{status}</strong>
      </section>

      <section className="chart-card">
        <div ref={chartBox} className="chart" />
      </section>

      <section className="replay-card">
        <div className="replay-top">
          <span>Replay: {replayIndex + 1} / {data.candles.length}</span>
          <span>O {current.open} · H {current.high} · L {current.low} · C {current.close}</span>
        </div>

        <div className="controls">
          <button
            className={replaySelectMode ? "toggle active" : "toggle"}
            onClick={toggleReplaySelection}
          >
            {replaySelectMode ? "✕ Cancel Replay" : "✂ Bar Replay"}
          </button>

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
