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

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);
  const markerRef = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState(null);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState("Tap ✂ Bar Replay to choose a starting candle.");

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
        mode: 1,
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
        if (!replaySelectMode) return;
        if (!param || !param.point) return;

        const logical = chart.timeScale().coordinateToLogical(param.point.x);

        if (logical === null || !Number.isFinite(logical)) {
          return;
        }

        const index = clamp(
          Math.round(logical),
          0,
          data.candles.length - 1
        );

        const candle = data.candles[index];

        setPlaying(false);
        setSelectedCandleIndex(index);
        setReplaySelectMode(false);
        setStatus(
          `Selected ${new Date(candle.time).toLocaleDateString()} · Close ₹${Number(candle.close).toFixed(2)}`
        );
      } catch (err) {
        console.error("Replay selection error:", err);
        setStatus("Could not select candle. Tap ✂ Bar Replay and try again.");
      }
    });

    const resize = () => {
      if (chartBox.current) {
        chart.applyOptions({
          width: chartBox.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);

      if (markerRef.current) {
        try {
          candleSeries.removePriceLine(markerRef.current);
        } catch (_) {}
      }

      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      markerRef.current = null;
    };
  }, [data, replaySelectMode]);

  // Load replay data only when the chosen start candle changes.
  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    const initialCandles = data.candles
      .slice(0, replayStart + 1)
      .map((candle) => ({
        time: candleTime(candle),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
      }));

    candleSeriesRef.current.setData(initialCandles);
  }, [data, replayStart]);

  // Append one candle only. No full redraw, so pan/zoom remains stable.
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

  // Show only one selected-candle marker.
  useEffect(() => {
    if (!data || !candleSeriesRef.current) return;

    if (markerRef.current) {
      try {
        candleSeriesRef.current.removePriceLine(markerRef.current);
      } catch (_) {}
      markerRef.current = null;
    }

    if (selectedCandleIndex === null) return;

    const candle = data.candles[selectedCandleIndex];
    if (!candle) return;

    markerRef.current = candleSeriesRef.current.createPriceLine({
      price: Number(candle.close),
      color: "#facc15",
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "REPLAY",
    });
  }, [data, selectedCandleIndex]);

  useEffect(() => {
    if (!playing || !data) return;

    const delay = Math.max(150, 900 / speed);

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

  function startReplayFromSelected() {
    if (selectedCandleIndex === null) {
      setStatus("First choose a candle with ✂ Bar Replay.");
      return;
    }

    setPlaying(false);
    setReplaySelectMode(false);
    setReplayStart(selectedCandleIndex);
    setReplayIndex(selectedCandleIndex);
    setStatus(`Replay started from candle #${selectedCandleIndex + 1}.`);
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
  const selected =
    selectedCandleIndex === null
      ? null
      : data.candles[selectedCandleIndex];

  return (
    <main>
      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>
            {data.meta?.exchange || "NSE"}:
            {data.meta?.symbol || "RELIANCE"} ·{" "}
            {data.meta?.interval || "daily"}
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

        {replaySelectMode && (
          <span className="replay-hint">
            ✂ Tap near any candle
          </span>
        )}
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
          <span>
            Replay: {replayIndex + 1} / {data.candles.length}
          </span>
          <span>
            O {current.open} · H {current.high} · L {current.low} · C{" "}
            {current.close}
          </span>
        </div>

        <div className="selected-candle">
          {selected ? (
            <>
              <span>
                Selected #{selectedCandleIndex + 1} ·{" "}
                {new Date(selected.time).toLocaleDateString()} · Close ₹
                {Number(selected.close).toFixed(2)}
              </span>

              <button className="play" onClick={startReplayFromSelected}>
                Start Replay From Selected
              </button>
            </>
          ) : (
            <span>Use ✂ Bar Replay, then tap near the candle you want.</span>
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

          <button
            className="play"
            onClick={() => setPlaying((value) => !value)}
          >
            {playing ? "Pause" : "▶ Play"}
          </button>

          <button
            onClick={() => {
              setPlaying(false);
              setReplayIndex(
                Math.min(data.candles.length - 1, replayIndex + 1)
              );
            }}
          >
            Next ▶
          </button>

          <select
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
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
    </main>
  );
}
