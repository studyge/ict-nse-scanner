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
    page: "#07101f", text: "#e2e8f0", border: "#334155",
    grid: "#172033", up: "#22c55e", down: "#ef4444"
  },
  light: {
    page: "#f1f5f9", text: "#0f172a", border: "#cbd5e1",
    grid: "#e2e8f0", up: "#16a34a", down: "#dc2626"
  }
};

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const replaySelectModeRef = useRef(false);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(null);
  const [replayIndex, setReplayIndex] = useState(null);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [themeName, setThemeName] = useState("dark");
  const [activeTool, setActiveTool] = useState("cursor");
  const [drawings, setDrawings] = useState([]);
  const [pendingPoint, setPendingPoint] = useState(null);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [status, setStatus] = useState("Full chart loaded. Tap ✂ Bar Replay to choose a candle.");

  useEffect(() => {
    replaySelectModeRef.current = replaySelectMode;
  }, [replaySelectMode]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ict_manual_drawings");
      if (saved) setDrawings(JSON.parse(saved));
    } catch (_) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("ict_manual_drawings", JSON.stringify(drawings));
    } catch (_) {}
  }, [drawings]);

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
        setData(json);
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
          try {
            const stamp = typeof time === "number"
              ? time * 1000
              : Date.UTC(time.year, time.month - 1, time.day);

            return new Date(stamp).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short"
            });
          } catch (_) {
            return "";
          }
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

    // Initial view: all available candles.
    candleSeries.setData(
      data.candles.map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
    );
    chart.timeScale().fitContent();

    chart.subscribeClick((param) => {
      try {
        if (handleDrawingClick(param)) return;
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
          `Replay starts from ${new Date(candle.time).toLocaleDateString()} · ₹${Number(candle.close).toFixed(2)}`
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
    if (replayStart === null || replayIndex === null) return;

    // Once replay is selected, only show candles up to current replay candle.
    candleSeriesRef.current.setData(
      data.candles.slice(0, replayIndex + 1).map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
    );
  }, [data, replayStart, replayIndex]);

  useEffect(() => {
    if (!playing || !data || replayIndex === null) return;

    const timer = setInterval(() => {
      setReplayIndex((current) => {
        if (current === null || current >= data.candles.length - 1) {
          setPlaying(false);
          setStatus("Replay finished.");
          return current;
        }
        return current + 1;
      });
    }, Math.max(150, 900 / speed));

    return () => clearInterval(timer);
  }, [playing, speed, data, replayIndex]);

  function chartPointFromClick(param) {
    if (!param?.point || !chartRef.current) return null;

    const logical = chartRef.current.timeScale().coordinateToLogical(param.point.x);
    const price = candleSeriesRef.current?.coordinateToPrice(param.point.y);

    if (logical === null || !Number.isFinite(logical) || price === null || !Number.isFinite(price)) {
      return null;
    }

    return {
      bar: clamp(Math.round(logical), 0, data.candles.length - 1),
      price: Number(price.toFixed(2))
    };
  }

  function handleDrawingClick(param) {
    if (activeTool === "cursor" || activeTool === "replay") return false;

    const point = chartPointFromClick(param);
    if (!point) return true;

    if (activeTool === "hline") {
      const drawing = {
        id: Date.now(),
        type: "hline",
        price: point.price,
        label: "H-Line"
      };
      setDrawings((old) => [...old, drawing]);
      setSelectedDrawingId(drawing.id);
      setStatus(`Horizontal line added at ₹${point.price}`);
      setActiveTool("cursor");
      return true;
    }

    if (!pendingPoint) {
      setPendingPoint(point);
      setStatus(activeTool === "trend" ? "Tap second point for trend line." : "Tap opposite corner for zone.");
      return true;
    }

    const drawing = activeTool === "trend"
      ? {
          id: Date.now(),
          type: "trend",
          start: pendingPoint,
          end: point,
          label: "Trend"
        }
      : {
          id: Date.now(),
          type: "zone",
          start: pendingPoint,
          end: point,
          label: "Zone"
        };

    setDrawings((old) => [...old, drawing]);
    setSelectedDrawingId(drawing.id);
    setPendingPoint(null);
    setActiveTool("cursor");
    setStatus(`${drawing.label} added.`);
    return true;
  }

  function deleteSelectedDrawing() {
    if (selectedDrawingId === null) return;
    setDrawings((old) => old.filter((item) => item.id !== selectedDrawingId));
    setSelectedDrawingId(null);
    setStatus("Selected drawing deleted.");
  }

  function clearDrawings() {
    setDrawings([]);
    setPendingPoint(null);
    setSelectedDrawingId(null);
    setActiveTool("cursor");
    setStatus("All manual drawings cleared.");
  }

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
    if (!data) return;

    setPlaying(false);

    if (replayIndex === null) {
      const start = Math.min(50, data.candles.length - 1);
      setReplayStart(start);
      setReplayIndex(start);
      setStatus("Replay started from candle 51. Use ✂ Bar Replay for another candle.");
      return;
    }

    setReplayIndex((current) => Math.min(data.candles.length - 1, current + 1));
  }

  function resetReplay() {
    setPlaying(false);

    if (replayStart === null) {
      if (chartRef.current) chartRef.current.timeScale().fitContent();
      setStatus("Full chart restored. Choose a candle with ✂ Bar Replay.");
      return;
    }

    setReplayIndex(replayStart);
    setStatus(`Reset to selected replay candle #${replayStart + 1}.`);
  }

  if (error) {
    return <main className="loading"><h1>Chart error</h1><p>{error}</p></main>;
  }

  if (!data) {
    return <main className="loading">Loading ICT chart data…</main>;
  }

  const currentIndex = replayIndex === null ? data.candles.length - 1 : replayIndex;
  const current = data.candles[currentIndex];

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

      <section className="drawing-card">
        <div className="drawing-title">Drawing Tools</div>
        <div className="controls">
          <button className={activeTool === "cursor" ? "toggle active" : "toggle"} onClick={() => { setActiveTool("cursor"); setPendingPoint(null); }}>
            Cursor
          </button>
          <button className={activeTool === "hline" ? "toggle active" : "toggle"} onClick={() => { setActiveTool("hline"); setPendingPoint(null); setStatus("Tap chart to place horizontal line."); }}>
            ─ H-Line
          </button>
          <button className={activeTool === "trend" ? "toggle active" : "toggle"} onClick={() => { setActiveTool("trend"); setPendingPoint(null); setStatus("Tap first point for trend line."); }}>
            ╱ Trend
          </button>
          <button className={activeTool === "zone" ? "toggle active" : "toggle"} onClick={() => { setActiveTool("zone"); setPendingPoint(null); setStatus("Tap first corner for zone."); }}>
            □ Zone
          </button>
          <button onClick={deleteSelectedDrawing} disabled={selectedDrawingId === null}>Delete</button>
          <button onClick={clearDrawings} disabled={drawings.length === 0}>Clear All</button>
        </div>

        {drawings.length > 0 && (
          <div className="drawing-list">
            {drawings.map((drawing) => (
              <button
                key={drawing.id}
                className={selectedDrawingId === drawing.id ? "drawing-item selected" : "drawing-item"}
                onClick={() => setSelectedDrawingId(drawing.id)}
              >
                {drawing.label}
                {drawing.type === "hline" ? ` · ₹${drawing.price}` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="replay-card">
        <div className="replay-top">
          <span>
            {replayIndex === null
              ? `Full chart: ${data.candles.length} candles`
              : `Replay: ${replayIndex + 1} / ${data.candles.length}`}
          </span>
          <span>O {current.open} · H {current.high} · L {current.low} · C {current.close}</span>
        </div>

        <div className="controls">
          <button
            className={replaySelectMode ? "toggle active" : "toggle"}
            onClick={toggleReplaySelection}
          >
            {replaySelectMode ? "✕ Cancel Replay" : "✂ Bar Replay"}
          </button>

          {replayIndex !== null && (
            <>
              <button
                className="play"
                onClick={() => setPlaying((value) => !value)}
              >
                {playing ? "Pause" : "▶ Play"}
              </button>

              <button onClick={nextCandle}>Next ▶</button>

              <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
                <option value="1">1x speed</option>
                <option value="2">2x speed</option>
                <option value="5">5x speed</option>
              </select>

              <button onClick={resetReplay}>Reset</button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
