 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";
const DATA_URL = `${BASE_PATH}/data/RELIANCE_daily_chart.json`;
const STORAGE_KEY = "ict_manual_drawings_v2";

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

const DEFAULT_TOGGLES = {
  structure: true,
  fvgs: true,
  orderBlocks: true,
  liquidity: true,
  cisd: false,
  inducements: false
};

function candleTime(candle) {
  return Math.floor(new Date(candle.time).getTime() / 1000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function priceText(value) {
  return `₹${Number(value).toFixed(2)}`;
}

function directionColor(item) {
  if (item?.direction === "bullish") return "#22c55e";
  if (item?.direction === "bearish") return "#ef4444";
  return "#f59e0b";
}

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const replaySelectModeRef = useRef(false);
  const activeToolRef = useRef("cursor");
  const pendingPointsRef = useRef([]);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(null);
  const [replayIndex, setReplayIndex] = useState(null);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [themeName, setThemeName] = useState("dark");
  const [status, setStatus] = useState("Full chart loaded. Tap ✂ Bar Replay to choose a candle.");

  const [activeTool, setActiveTool] = useState("cursor");
  const [pendingPoints, setPendingPoints] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [toggles, setToggles] = useState(DEFAULT_TOGGLES);
  const [chartTick, setChartTick] = useState(0);

  useEffect(() => {
    replaySelectModeRef.current = replaySelectMode;
  }, [replaySelectMode]);

  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  useEffect(() => {
    pendingPointsRef.current = pendingPoints;
  }, [pendingPoints]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setDrawings(JSON.parse(saved));
    } catch (err) {
      console.warn("Could not restore drawings", err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drawings));
    } catch (err) {
      console.warn("Could not save drawings", err);
    }
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
        vertLine: { color: "#94a3b8", width: 1, style: 2, visible: true, labelVisible: true },
        horzLine: { color: "#94a3b8", width: 1, style: 2, visible: true, labelVisible: true }
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

    chart.subscribeVisibleLogicalRangeChange(() => {
      setChartTick((value) => value + 1);
    });

    chart.subscribeClick((param) => {
      try {
        if (!param?.point) return;

        const logical = chart.timeScale().coordinateToLogical(param.point.x);
        const price = candleSeries.coordinateToPrice(param.point.y);

        if (logical === null || !Number.isFinite(logical) || price === null || !Number.isFinite(price)) {
          return;
        }

        const point = {
          bar: clamp(Math.round(logical), 0, data.candles.length - 1),
          price: Number(price.toFixed(2))
        };

        // Replay selection always has priority.
        if (replaySelectModeRef.current) {
          const candle = data.candles[point.bar];
          setPlaying(false);
          setReplayStart(point.bar);
          setReplayIndex(point.bar);
          setReplaySelectMode(false);
          setStatus(`Replay starts from ${new Date(candle.time).toLocaleDateString()} · ${priceText(candle.close)}`);
          return;
        }

        const tool = activeToolRef.current;
        if (tool === "cursor") return;

        const points = pendingPointsRef.current || [];

        if (tool === "hline") {
          const drawing = { id: makeId(), type: "hline", price: point.price, label: "H-Line" };
          setDrawings((old) => [...old, drawing]);
          setSelectedDrawingId(drawing.id);
          setActiveTool("cursor");
          setStatus(`Horizontal line added at ${priceText(point.price)}.`);
          return;
        }

        const requiredPoints = tool === "long" || tool === "short" ? 3 : 2;
        const nextPoints = [...points, point];

        if (nextPoints.length < requiredPoints) {
          setPendingPoints(nextPoints);
          const nextLabel =
            tool === "trend" ? "Tap second point for Trend." :
            tool === "zone" ? "Tap opposite corner for Zone." :
            tool === "long" ? (nextPoints.length === 1 ? "Tap Stop Loss price." : "Tap Target price.") :
            (nextPoints.length === 1 ? "Tap Stop Loss price." : "Tap Target price.");
          setStatus(nextLabel);
          return;
        }

        let drawing = null;

        if (tool === "trend") {
          drawing = { id: makeId(), type: "trend", start: nextPoints[0], end: nextPoints[1], label: "Trend" };
        } else if (tool === "zone") {
          drawing = { id: makeId(), type: "zone", start: nextPoints[0], end: nextPoints[1], label: "Zone" };
        } else if (tool === "long" || tool === "short") {
          drawing = {
            id: makeId(),
            type: tool,
            entry: nextPoints[0],
            stop: nextPoints[1],
            target: nextPoints[2],
            label: tool === "long" ? "Long Position" : "Short Position"
          };
        }

        if (drawing) {
          setDrawings((old) => [...old, drawing]);
          setSelectedDrawingId(drawing.id);
          setPendingPoints([]);
          setActiveTool("cursor");
          setStatus(`${drawing.label} added.`);
        }
      } catch (err) {
        console.error("Chart click error:", err);
        setStatus("Tool action failed. Switch to Cursor and try again.");
        setPendingPoints([]);
        setActiveTool("cursor");
      }
    });

    const resize = () => {
      if (chartBox.current) {
        chart.applyOptions({ width: chartBox.current.clientWidth });
        setChartTick((value) => value + 1);
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
      layout: { background: { color: theme.page }, textColor: theme.text },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      crosshair: {
        vertLine: { color: replaySelectMode ? "#facc15" : "#94a3b8", width: 1, style: 2, visible: true, labelVisible: true },
        horzLine: { color: replaySelectMode ? "#facc15" : "#94a3b8", width: 1, style: 2, visible: true, labelVisible: true }
      }
    });

    candleSeriesRef.current.applyOptions({
      upColor: theme.up, downColor: theme.down,
      wickUpColor: theme.up, wickDownColor: theme.down
    });
  }, [themeName, replaySelectMode]);

  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;
    if (replayStart === null || replayIndex === null) return;

    candleSeriesRef.current.setData(
      data.candles.slice(0, replayIndex + 1).map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close)
      }))
    );
    setChartTick((value) => value + 1);
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

  function setTool(tool) {
    setPlaying(false);
    setReplaySelectMode(false);
    setPendingPoints([]);
    setActiveTool(tool);

    const message = {
      cursor: "Cursor mode.",
      hline: "Tap chart to place a horizontal line.",
      trend: "Tap first point for Trend.",
      zone: "Tap first corner for Zone.",
      long: "Long Position: tap Entry price.",
      short: "Short Position: tap Entry price."
    };

    setStatus(message[tool] || "Tool selected.");
  }

  function toggleReplaySelection() {
    setPlaying(false);
    setPendingPoints([]);
    setActiveTool("cursor");
    setReplaySelectMode((old) => {
      const next = !old;
      setStatus(next
        ? "✂ Replay selection active. Yellow dashed line follows your candle."
        : "Replay selection cancelled.");
      return next;
    });
  }

  function nextCandle() {
    if (!data || replayIndex === null) return;
    setPlaying(false);
    setReplayIndex((current) => Math.min(data.candles.length - 1, current + 1));
  }

  function resetReplay() {
    setPlaying(false);

    if (replayStart === null) {
      chartRef.current?.timeScale().fitContent();
      setStatus("Full chart restored. Choose a candle with ✂ Bar Replay.");
      return;
    }

    setReplayIndex(replayStart);
    setStatus(`Reset to selected replay candle #${replayStart + 1}.`);
  }

  function deleteSelectedDrawing() {
    if (!selectedDrawingId) return;
    setDrawings((old) => old.filter((drawing) => drawing.id !== selectedDrawingId));
    setSelectedDrawingId(null);
    setStatus("Selected drawing deleted.");
  }

  function clearDrawings() {
    setDrawings([]);
    setSelectedDrawingId(null);
    setPendingPoints([]);
    setActiveTool("cursor");
    setStatus("All manual drawings cleared.");
  }

  function toggleOverlay(name) {
    setToggles((old) => ({ ...old, [name]: !old[name] }));
  }

  function xForBar(bar) {
    if (!chartRef.current || !data) return null;
    const candle = data.candles[clamp(bar, 0, data.candles.length - 1)];
    if (!candle) return null;
    return chartRef.current.timeScale().timeToCoordinate(candleTime(candle));
  }

  function yForPrice(price) {
    return candleSeriesRef.current?.priceToCoordinate(Number(price)) ?? null;
  }

  if (error) {
    return <main className="loading"><h1>Chart error</h1><p>{error}</p></main>;
  }

  if (!data) {
    return <main className="loading">Loading ICT chart data…</main>;
  }

  const currentIndex = replayIndex === null ? data.candles.length - 1 : replayIndex;
  const current = data.candles[currentIndex];
  const visibleEnd = replayIndex === null ? data.candles.length - 1 : replayIndex;
  const overlays = data.overlays || {};

  const visibleStructure = (overlays.structure || [])
    .filter((item) => Number(item.bar_index) <= visibleEnd)
    .slice(-3);

  const visibleFvgs = (overlays.fvgs || [])
    .filter((item) => Number(item.start_bar_index ?? item.bar_index ?? 0) <= visibleEnd)
    .filter((item) => item.status !== "invalidated")
    .slice(-3);

  const visibleObs = (overlays.order_blocks || [])
    .filter((item) => Number(item.start_bar_index ?? item.bar_index ?? 0) <= visibleEnd)
    .filter((item) => item.status !== "invalidated")
    .slice(-3);

  const visibleLiquidity = (overlays.liquidity || [])
    .filter((item) => Number(item.start_bar_index ?? item.bar_index ?? 0) <= visibleEnd)
    .filter((item) => item.status === "active" || !item.status)
    .slice(-2);

  const visibleCisd = (overlays.cisd_levels || [])
    .filter((item) => Number(item.start_bar_index ?? item.bar_index ?? 0) <= visibleEnd)
    .filter((item) => item.status === "active" || !item.status)
    .slice(-2);

  const visibleIdm = (overlays.inducements || [])
    .filter((item) => Number(item.bar_index ?? item.start_bar_index ?? 0) <= visibleEnd)
    .slice(-3);

  const renderManualDrawing = (drawing) => {
    const selected = selectedDrawingId === drawing.id;
    const stroke = selected ? "#facc15" : "#38bdf8";
    const width = selected ? 2.5 : 1.5;

    if (drawing.type === "hline") {
      const y = yForPrice(drawing.price);
      if (y === null) return null;
      return (
        <g key={drawing.id}>
          <line x1="0" x2="100%" y1={y} y2={y} stroke={stroke} strokeWidth={width} strokeDasharray="6 4" />
          <text x="8" y={y - 5} fill={stroke} fontSize="11">H-Line {priceText(drawing.price)}</text>
        </g>
      );
    }

    if (drawing.type === "trend") {
      const x1 = xForBar(drawing.start.bar), y1 = yForPrice(drawing.start.price);
      const x2 = xForBar(drawing.end.bar), y2 = yForPrice(drawing.end.price);
      if ([x1, y1, x2, y2].some((value) => value === null)) return null;
      return <line key={drawing.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} />;
    }

    if (drawing.type === "zone") {
      const x1 = xForBar(drawing.start.bar), y1 = yForPrice(drawing.start.price);
      const x2 = xForBar(drawing.end.bar), y2 = yForPrice(drawing.end.price);
      if ([x1, y1, x2, y2].some((value) => value === null)) return null;
      return (
        <g key={drawing.id}>
          <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)}
            fill="rgba(56,189,248,0.14)" stroke={stroke} strokeWidth={width} />
          <text x={Math.min(x1, x2) + 4} y={Math.min(y1, y2) + 14} fill={stroke} fontSize="11">Zone</text>
        </g>
      );
    }

    if (drawing.type === "long" || drawing.type === "short") {
      const x1 = xForBar(drawing.entry.bar);
      const x2 = xForBar(Math.min(visibleEnd, drawing.entry.bar + 18));
      const entryY = yForPrice(drawing.entry.price);
      const stopY = yForPrice(drawing.stop.price);
      const targetY = yForPrice(drawing.target.price);

      if ([x1, x2, entryY, stopY, targetY].some((value) => value === null)) return null;

      const risk = Math.abs(drawing.entry.price - drawing.stop.price);
      const reward = Math.abs(drawing.target.price - drawing.entry.price);
      const rr = risk > 0 ? (reward / risk).toFixed(2) : "—";
      const left = Math.min(x1, x2);
      const widthBox = Math.max(30, Math.abs(x2 - x1));
      const targetTop = Math.min(entryY, targetY);
      const targetHeight = Math.abs(entryY - targetY);
      const stopTop = Math.min(entryY, stopY);
      const stopHeight = Math.abs(entryY - stopY);

      return (
        <g key={drawing.id}>
          <rect x={left} y={targetTop} width={widthBox} height={targetHeight} fill="rgba(34,197,94,0.26)" stroke="rgba(34,197,94,0.9)" strokeWidth={selected ? 2.5 : 1} />
          <rect x={left} y={stopTop} width={widthBox} height={stopHeight} fill="rgba(239,68,68,0.26)" stroke="rgba(239,68,68,0.9)" strokeWidth={selected ? 2.5 : 1} />
          <line x1={left} x2={left + widthBox} y1={entryY} y2={entryY} stroke="#f8fafc" strokeWidth="2" />
          <text x={left + 5} y={entryY - 7} fill="#f8fafc" fontSize="11">
            {drawing.type === "long" ? "LONG" : "SHORT"} · RR {rr}
          </text>
          <text x={left + 5} y={targetTop + 14} fill="#bbf7d0" fontSize="10">Target {priceText(drawing.target.price)}</text>
          <text x={left + 5} y={stopTop + 14} fill="#fecaca" fontSize="10">SL {priceText(drawing.stop.price)}</text>
        </g>
      );
    }

    return null;
  };

  const renderFvg = (item, index) => {
    const start = Number(item.start_bar_index ?? item.bar_index ?? 0);
    const end = Math.min(visibleEnd, Number(item.end_bar_index ?? visibleEnd));
    const top = Number(item.top ?? item.high ?? item.upper ?? 0);
    const bottom = Number(item.bottom ?? item.low ?? item.lower ?? 0);
    const x1 = xForBar(start), x2 = xForBar(Math.max(start + 1, end));
    const y1 = yForPrice(top), y2 = yForPrice(bottom);
    if ([x1, x2, y1, y2].some((value) => value === null)) return null;
    const bullish = item.direction === "bullish";
    return (
      <g key={`fvg_${index}`}>
        <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.max(3, Math.abs(x2 - x1))} height={Math.max(3, Math.abs(y2 - y1))}
          fill={bullish ? "rgba(34,197,94,0.14)" : "rgba(239,68,68,0.14)"}
          stroke={bullish ? "rgba(34,197,94,0.65)" : "rgba(239,68,68,0.65)"}
          strokeWidth="1" />
        <text x={Math.min(x1, x2) + 3} y={Math.min(y1, y2) + 12} fill={bullish ? "#86efac" : "#fca5a5"} fontSize="10">FVG</text>
      </g>
    );
  };

  const renderOb = (item, index) => {
    const start = Number(item.start_bar_index ?? item.bar_index ?? 0);
    const end = Math.min(visibleEnd, Number(item.end_bar_index ?? visibleEnd));
    const top = Number(item.top ?? item.high ?? item.zone_high ?? 0);
    const bottom = Number(item.bottom ?? item.low ?? item.zone_low ?? 0);
    const x1 = xForBar(start), x2 = xForBar(Math.max(start + 1, end));
    const y1 = yForPrice(top), y2 = yForPrice(bottom);
    if ([x1, x2, y1, y2].some((value) => value === null)) return null;
    const bullish = item.direction === "bullish";
    return (
      <g key={`ob_${index}`}>
        <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.max(3, Math.abs(x2 - x1))} height={Math.max(3, Math.abs(y2 - y1))}
          fill={bullish ? "rgba(14,165,233,0.15)" : "rgba(168,85,247,0.15)"}
          stroke={bullish ? "rgba(56,189,248,0.8)" : "rgba(192,132,252,0.8)"}
          strokeWidth="1" />
        <text x={Math.min(x1, x2) + 3} y={Math.min(y1, y2) + 12} fill={bullish ? "#7dd3fc" : "#d8b4fe"} fontSize="10">OB</text>
      </g>
    );
  };

  return (
    <main className={themeName === "light" ? "app light" : "app"}>
      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>{data.meta?.exchange || "NSE"}:{data.meta?.symbol || "RELIANCE"} · {data.meta?.interval || "daily"}</p>
        </div>
        <div className="price">
          <strong>{priceText(current.close)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        <button className="toggle" onClick={() => setThemeName((old) => old === "dark" ? "light" : "dark")}>
          {themeName === "dark" ? "☀ Light" : "☾ Dark"}
        </button>
        <button className={toggles.structure ? "toggle active" : "toggle"} onClick={() => toggleOverlay("structure")}>Structure</button>
        <button className={toggles.fvgs ? "toggle active" : "toggle"} onClick={() => toggleOverlay("fvgs")}>FVG</button>
        <button className={toggles.orderBlocks ? "toggle active" : "toggle"} onClick={() => toggleOverlay("orderBlocks")}>OB</button>
        <button className={toggles.liquidity ? "toggle active" : "toggle"} onClick={() => toggleOverlay("liquidity")}>Liquidity</button>
        <button className={toggles.cisd ? "toggle active" : "toggle"} onClick={() => toggleOverlay("cisd")}>CISD</button>
        <button className={toggles.inducements ? "toggle active" : "toggle"} onClick={() => toggleOverlay("inducements")}>IDM</button>
      </section>

      <section className="status-card"><strong>{status}</strong></section>

      <section className="chart-card">
        <div className="chart-wrap">
          <div ref={chartBox} className="chart" />
          <svg className="overlay-svg" width="100%" height="540" pointerEvents="none">
            {toggles.fvgs && visibleFvgs.map(renderFvg)}
            {toggles.orderBlocks && visibleObs.map(renderOb)}

            {toggles.structure && visibleStructure.map((item, index) => {
              const bar = Number(item.bar_index ?? 0);
              const start = Math.max(0, bar - 5);
              const x1 = xForBar(start), x2 = xForBar(bar), y = yForPrice(item.level);
              if ([x1, x2, y].some((value) => value === null)) return null;
              const color = directionColor(item);
              return (
                <g key={`structure_${index}`}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke={color} strokeWidth="2" />
                  <text x={Math.min(x1, x2) + 3} y={y - 5} fill={color} fontSize="10">{item.type || "BOS"}</text>
                </g>
              );
            })}

            {toggles.liquidity && visibleLiquidity.map((item, index) => {
              const bar = Number(item.start_bar_index ?? item.bar_index ?? 0);
              const x1 = xForBar(bar), x2 = xForBar(Math.min(visibleEnd, bar + 8)), y = yForPrice(item.level);
              if ([x1, x2, y].some((value) => value === null)) return null;
              return (
                <g key={`liq_${index}`}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="#fb923c" strokeWidth="1.5" strokeDasharray="5 4" />
                  <text x={x1 + 3} y={y - 5} fill="#fb923c" fontSize="10">{item.side === "buyside" ? "BSL" : "SSL"}</text>
                </g>
              );
            })}

            {toggles.cisd && visibleCisd.map((item, index) => {
              const bar = Number(item.start_bar_index ?? item.bar_index ?? 0);
              const x1 = xForBar(bar), x2 = xForBar(Math.min(visibleEnd, bar + 7)), y = yForPrice(item.level);
              if ([x1, x2, y].some((value) => value === null)) return null;
              return (
                <g key={`cisd_${index}`}>
                  <line x1={x1} y1={y} x2={x2} y2={y} stroke="#facc15" strokeWidth="1.5" strokeDasharray="4 3" />
                  <text x={x1 + 3} y={y - 5} fill="#facc15" fontSize="10">CISD</text>
                </g>
              );
            })}

            {toggles.inducements && visibleIdm.map((item, index) => {
              const bar = Number(item.bar_index ?? item.start_bar_index ?? 0);
              const x = xForBar(bar), y = yForPrice(item.level);
              if ([x, y].some((value) => value === null)) return null;
              return (
                <g key={`idm_${index}`}>
                  <circle cx={x} cy={y} r="4" fill="#c084fc" />
                  <text x={x + 6} y={y - 5} fill="#c084fc" fontSize="10">IDM</text>
                </g>
              );
            })}

            {drawings.map(renderManualDrawing)}
          </svg>
        </div>
      </section>

      <section className="drawing-card">
        <div className="drawing-title">Drawing Tools</div>
        <div className="controls">
          <button className={activeTool === "cursor" ? "toggle active" : "toggle"} onClick={() => setTool("cursor")}>Cursor</button>
          <button className={activeTool === "hline" ? "toggle active" : "toggle"} onClick={() => setTool("hline")}>─ H-Line</button>
          <button className={activeTool === "trend" ? "toggle active" : "toggle"} onClick={() => setTool("trend")}>╱ Trend</button>
          <button className={activeTool === "zone" ? "toggle active" : "toggle"} onClick={() => setTool("zone")}>□ Zone</button>
          <button className={activeTool === "long" ? "toggle active" : "toggle"} onClick={() => setTool("long")}>↗ Long</button>
          <button className={activeTool === "short" ? "toggle active" : "toggle"} onClick={() => setTool("short")}>↘ Short</button>
          <button onClick={deleteSelectedDrawing} disabled={!selectedDrawingId}>Delete</button>
          <button onClick={clearDrawings} disabled={drawings.length === 0}>Clear All</button>
        </div>

        {pendingPoints.length > 0 && (
          <p className="pending-note">Tool in progress: {pendingPoints.length} point selected.</p>
        )}

        {drawings.length > 0 && (
          <div className="drawing-list">
            {drawings.map((drawing) => (
              <button
                key={drawing.id}
                className={selectedDrawingId === drawing.id ? "drawing-item selected" : "drawing-item"}
                onClick={() => setSelectedDrawingId(drawing.id)}
              >
                {drawing.label}
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
            </>
          )}
        </div>
      </section>
    </main>
  );
}
