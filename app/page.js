 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";
const DATA_URL = `${BASE_PATH}/data/RELIANCE_daily_chart.json`;

const TOOLS = {
  CURSOR: "cursor",
  HLINE: "hline",
  TREND: "trend",
  RECT: "rect",
  LONG: "long",
  SHORT: "short",
};

function candleTime(candle) {
  return Math.floor(new Date(candle.time).getTime() / 1000);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatPrice(value) {
  return Number(value).toFixed(2);
}

function getChartPoint(param, chart, series) {
  if (!param || !param.point || !chart || !series) return null;

  const price = series.coordinateToPrice(param.point.y);
  const logical = chart.timeScale().coordinateToLogical(param.point.x);

  if (price === null || logical === null || !Number.isFinite(price)) return null;

  return {
    price: Number(price),
    logical: Math.round(logical),
    x: param.point.x,
    y: param.point.y,
  };
}

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const drawingsRef = useRef([]);
  const overlaySeriesRef = useRef([]);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const [tool, setTool] = useState(TOOLS.CURSOR);
  const [toolPoints, setToolPoints] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [selectedDrawingId, setSelectedDrawingId] = useState(null);
  const [status, setStatus] = useState("Tap a candle to choose replay start.");

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Could not load chart data: ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (!Array.isArray(json.candles) || json.candles.length === 0) {
          throw new Error("No candles found in chart JSON");
        }

        json.overlays = json.overlays || {};
        setData(json);

        const start = Math.min(50, json.candles.length - 1);
        setReplayStart(start);
        setReplayIndex(start);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message);
      });
  }, []);

  function clearOverlaySeries() {
    if (!chartRef.current) return;

    overlaySeriesRef.current.forEach((series) => {
      try {
        chartRef.current.removeSeries(series);
      } catch (_) {}
    });

    overlaySeriesRef.current = [];
  }

  function addLineSeries(options, points) {
    if (!chartRef.current || !data) return null;

    const series = chartRef.current.addSeries(LineSeries, {
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      ...options,
    });

    series.setData(points);
    overlaySeriesRef.current.push(series);
    return series;
  }

  function renderOverlays() {
    if (!data || !chartRef.current) return;

    clearOverlaySeries();

    const visibleMax = replayIndex;
    const candles = data.candles;

    // Short BOS / CHoCH segments only.
    (data.overlays?.structure || [])
      .filter((event) => Number(event.bar_index) <= visibleMax)
      .forEach((event) => {
        const endIndex = clamp(Number(event.bar_index), 0, candles.length - 1);
        const startIndex = clamp(
          Number(event.swing_bar_index ?? event.start_bar_index ?? endIndex - 6),
          0,
          endIndex
        );

        if (!candles[startIndex] || !candles[endIndex]) return;

        addLineSeries(
          {
            color: event.direction === "bullish" ? "#14b8a6" : "#ef4444",
            lineStyle: 2,
          },
          [
            { time: candleTime(candles[startIndex]), value: Number(event.level) },
            { time: candleTime(candles[endIndex]), value: Number(event.level) },
          ]
        );
      });

    // Swing dots made from a tiny two-point flat line.
    const usedSwings = new Set();

    (data.overlays?.structure || [])
      .filter((event) => Number(event.bar_index) <= visibleMax)
      .forEach((event) => {
        const index = clamp(
          Number(event.swing_bar_index ?? event.start_bar_index ?? Number(event.bar_index) - 6),
          0,
          candles.length - 1
        );

        const key = `${index}-${event.direction}`;
        if (usedSwings.has(key) || !candles[index]) return;
        usedSwings.add(key);

        const candle = candles[index];
        const value = event.direction === "bullish" ? Number(candle.low) : Number(candle.high);
        const time = candleTime(candle);

        addLineSeries(
          {
            color: event.direction === "bullish" ? "#14b8a6" : "#ef4444",
            lineWidth: 4,
            lineStyle: 0,
          },
          [
            { time: Math.max(1, time - 1), value },
            { time, value },
          ]
        );
      });

    // Replay start / selected candle marker.
    if (selectedCandleIndex !== null && candles[selectedCandleIndex]) {
      const selected = candles[selectedCandleIndex];
      const time = candleTime(selected);

      addLineSeries(
        {
          color: "#facc15",
          lineWidth: 1,
          lineStyle: 2,
        },
        [
          { time, value: Number(selected.low) },
          { time: time + 1, value: Number(selected.high) },
        ]
      );
    }

    // Manual drawings.
    try {
    drawings.forEach((drawing) => {
      if (drawing.type === "hline") {
        const first = candles[Math.max(0, Math.min(drawing.point.logical, candles.length - 1))];
        const last = candles[visibleMax];
        if (!first || !last) return;

        addLineSeries(
          {
            color: drawing.id === selectedDrawingId ? "#facc15" : "#60a5fa",
            lineStyle: 0,
          },
          [
            { time: candleTime(first), value: drawing.point.price },
            { time: candleTime(last), value: drawing.point.price },
          ]
        );
      }

      if (drawing.type === "trend") {
        const a = candles[clamp(drawing.a.logical, 0, candles.length - 1)];
        const b = candles[clamp(drawing.b.logical, 0, candles.length - 1)];
        if (!a || !b) return;

        addLineSeries(
          {
            color: drawing.id === selectedDrawingId ? "#facc15" : "#a78bfa",
            lineStyle: 0,
          },
          [
            { time: candleTime(a), value: drawing.a.price },
            { time: candleTime(b), value: drawing.b.price },
          ]
        );
      }

      if (drawing.type === "rect" || drawing.type === "position") {
        const a = candles[clamp(drawing.a.logical, 0, candles.length - 1)];
        const b = candles[clamp(drawing.b.logical, 0, candles.length - 1)];
        if (!a || !b) return;

        const leftTime = candleTime(a);
        const rightTime = candleTime(b);
        const top = Math.max(drawing.a.price, drawing.b.price);
        const bottom = Math.min(drawing.a.price, drawing.b.price);
        const color =
          drawing.id === selectedDrawingId
            ? "#facc15"
            : drawing.side === "long"
            ? "#22c55e"
            : drawing.side === "short"
            ? "#ef4444"
            : "#60a5fa";

        addLineSeries(
          { color, lineStyle: 0 },
          [
            { time: leftTime, value: top },
            { time: rightTime, value: top },
          ]
        );

        addLineSeries(
          { color, lineStyle: 0 },
          [
            { time: leftTime, value: bottom },
            { time: rightTime, value: bottom },
          ]
        );

        addLineSeries(
          { color, lineStyle: 0 },
          [
            { time: Math.max(1, leftTime - 1), value: bottom },
            { time: leftTime, value: top },
          ]
        );

        addLineSeries(
          { color, lineStyle: 0 },
          [
            { time: Math.max(1, rightTime - 1), value: bottom },
            { time: rightTime, value: top },
          ]
        );

        if (drawing.type === "position") {
          const entry = drawing.entry.price;
          const stop = drawing.stop.price;
          const target = drawing.target.price;

          addLineSeries(
            { color: "#e2e8f0", lineStyle: 2 },
            [
              { time: leftTime, value: entry },
              { time: rightTime, value: entry },
            ]
          );

          addLineSeries(
            { color: "#ef4444", lineStyle: 2 },
            [
              { time: leftTime, value: stop },
              { time: rightTime, value: stop },
            ]
          );

          addLineSeries(
            { color: "#22c55e", lineStyle: 2 },
            [
              { time: leftTime, value: target },
              { time: rightTime, value: target },
            ]
          );
        }
      }
    });
    } catch (error) {
      console.error("Overlay render error:", error);
    }
  }

  useEffect(() => {
    if (!data || !chartBox.current) return;

    const chart = createChart(chartBox.current, {
      width: chartBox.current.clientWidth,
      height: 540,
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
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    chart.subscribeClick((param) => {
      try {
      const point = getChartPoint(param, chart, candleSeries);
      if (!point) return;

      const candleIndex = clamp(point.logical, 0, data.candles.length - 1);

      // Cursor mode: candle selection for bar replay.
      if (tool === TOOLS.CURSOR) {
        setPlaying(false);
        setSelectedCandleIndex(candleIndex);
        setStatus(
          `Selected candle #${candleIndex + 1}. Tap “Start Replay From Selected”.`
        );
        return;
      }

      if (tool === TOOLS.HLINE) {
        const drawing = {
          id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          type: "hline",
          point,
        };
        setDrawings((old) => [...old, drawing]);
        setSelectedDrawingId(drawing.id);
        setTool(TOOLS.CURSOR);
        setStatus("Horizontal line created.");
        return;
      }

      const requiredPoints =
        tool === TOOLS.TREND || tool === TOOLS.RECT ? 2 :
        tool === TOOLS.LONG || tool === TOOLS.SHORT ? 3 : 0;

      if (!requiredPoints) return;

      setToolPoints((old) => {
        const next = [...old, point];

        if (next.length < requiredPoints) {
          const label =
            tool === TOOLS.TREND ? "Tap end point." :
            tool === TOOLS.RECT ? "Tap opposite corner." :
            next.length === 1 ? "Tap stop-loss." :
            "Tap target.";
          setStatus(label);
          return next;
        }

        const id = `draw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        if (tool === TOOLS.TREND) {
          setDrawings((items) => [...items, { id, type: "trend", a: next[0], b: next[1] }]);
          setSelectedDrawingId(id);
          setStatus("Trend line created.");
        }

        if (tool === TOOLS.RECT) {
          setDrawings((items) => [...items, { id, type: "rect", a: next[0], b: next[1] }]);
          setSelectedDrawingId(id);
          setStatus("Rectangle created.");
        }

        if (tool === TOOLS.LONG || tool === TOOLS.SHORT) {
          const [entry, stop, target] = next;
          const side = tool === TOOLS.LONG ? "long" : "short";
          const left = entry.logical;
          const right = clamp(entry.logical + 12, 0, data.candles.length - 1);

          const risk = Math.abs(entry.price - stop.price);
          const reward = Math.abs(target.price - entry.price);
          const rr = risk > 0 ? reward / risk : 0;

          setDrawings((items) => [
            ...items,
            {
              id,
              type: "position",
              side,
              a: { logical: left, price: Math.max(stop.price, target.price) },
              b: { logical: right, price: Math.min(stop.price, target.price) },
              entry,
              stop,
              target,
              rr,
            },
          ]);

          setSelectedDrawingId(id);
          setStatus(
            `${side === "long" ? "Long" : "Short"} position created · RR ${rr.toFixed(2)}`
          );
        }

        setTool(TOOLS.CURSOR);
        return [];
      });
    });

      } catch (error) {
        console.error("Chart tool error:", error);
        setStatus(`Tool error: ${error.message}`);
        setTool(TOOLS.CURSOR);
        setToolPoints([]);
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
      clearOverlaySeries();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [data, tool]);

  // Load only replay-start candles once. This is the key to keeping pan/zoom stable.
  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    const initial = data.candles
      .slice(0, replayStart + 1)
      .map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      }));

    candleSeriesRef.current.setData(initial);
    renderOverlays();
  }, [data, replayStart]);

  // Only append the new candle. No setData here, so zoom/pan stays unchanged.
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

    renderOverlays();
  }, [replayIndex, drawings, selectedDrawingId, selectedCandleIndex]);

  useEffect(() => {
    if (!playing || !data) return;

    const delay = Math.max(140, 850 / speed);

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

  function chooseTool(nextTool) {
    setPlaying(false);
    setTool(nextTool);
    setToolPoints([]);

    const message = {
      [TOOLS.CURSOR]: "Tap a candle to select replay start.",
      [TOOLS.HLINE]: "Tap chart once to place horizontal line.",
      [TOOLS.TREND]: "Tap trend-line start point.",
      [TOOLS.RECT]: "Tap first rectangle corner.",
      [TOOLS.LONG]: "Long position: tap Entry price.",
      [TOOLS.SHORT]: "Short position: tap Entry price.",
    };

    setStatus(message[nextTool]);
  }

  function startReplayFromSelected() {
    if (selectedCandleIndex === null) {
      setStatus("First tap a candle on the chart.");
      return;
    }

    setPlaying(false);
    setReplayStart(selectedCandleIndex);
    setReplayIndex(selectedCandleIndex);
    setStatus(`Replay started from candle #${selectedCandleIndex + 1}.`);
  }

  function deleteSelected() {
    if (!selectedDrawingId) {
      setStatus("Select a drawing first.");
      return;
    }

    setDrawings((old) => old.filter((drawing) => drawing.id !== selectedDrawingId));
    setSelectedDrawingId(null);
    setStatus("Selected drawing deleted.");
  }

  function clearAll() {
    setDrawings([]);
    setSelectedDrawingId(null);
    setToolPoints([]);
    setStatus("All manual drawings cleared.");
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
  const selected = selectedCandleIndex !== null ? data.candles[selectedCandleIndex] : null;

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
          <strong>₹ {formatPrice(current.close)}</strong>
          <small>{new Date(current.time).toLocaleDateString()}</small>
        </div>
      </header>

      <section className="toolbar">
        <button className={tool === TOOLS.CURSOR ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.CURSOR)}>
          Cursor
        </button>
        <button className={tool === TOOLS.HLINE ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.HLINE)}>
          Horizontal
        </button>
        <button className={tool === TOOLS.TREND ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.TREND)}>
          Trend
        </button>
        <button className={tool === TOOLS.RECT ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.RECT)}>
          Box
        </button>
        <button className={tool === TOOLS.LONG ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.LONG)}>
          Long
        </button>
        <button className={tool === TOOLS.SHORT ? "toggle active" : "toggle"} onClick={() => chooseTool(TOOLS.SHORT)}>
          Short
        </button>
        <button className="toggle" onClick={deleteSelected}>Delete</button>
        <button className="toggle" onClick={clearAll}>Clear all</button>
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
          <span>
            O {current.open} · H {current.high} · L {current.low} · C {current.close}
          </span>
        </div>

        <div className="selected-candle">
          {selected ? (
            <>
              <span>
                Selected candle #{selectedCandleIndex + 1} ·{" "}
                {new Date(selected.time).toLocaleDateString()} · Close ₹{formatPrice(selected.close)}
              </span>
              <button className="play" onClick={startReplayFromSelected}>
                Start Replay From Selected
              </button>
            </>
          ) : (
            <span>Cursor mode: tap a candle, then start replay from it.</span>
          )}
        </div>

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
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="5">5x</option>
          </select>

          <button
            onClick={() => {
              setPlaying(false);
              setReplayIndex(replayStart);
              setStatus(`Reset to candle #${replayStart + 1}.`);
            }}
          >
            Reset
          </button>
        </div>
      </section>

      {drawings.filter((drawing) => drawing.type === "position").length > 0 && (
        <section className="replay-card">
          <strong>Position tools</strong>
          {drawings
            .filter((drawing) => drawing.type === "position")
            .map((drawing) => (
              <p key={drawing.id}>
                {drawing.side === "long" ? "Long" : "Short"} · Entry ₹{formatPrice(drawing.entry.price)}
                {" · "}SL ₹{formatPrice(drawing.stop.price)}
                {" · "}TP ₹{formatPrice(drawing.target.price)}
                {" · "}RR {drawing.rr.toFixed(2)}
              </p>
            ))}
        </section>
      )}
    </main>
  );
}
