 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";
const DATA_URL = `${BASE_PATH}/data/RELIANCE_daily_chart.json`;

function candleTime(candle) {
  return Math.floor(new Date(candle.time).getTime() / 1000);
}

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [selectedCandleIndex, setSelectedCandleIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [status, setStatus] = useState("Tap a candle to choose replay start.");

  useEffect(() => {
    fetch(DATA_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load chart data: ${response.status}`);
        }
        return response.json();
      })
      .then((json) => {
        if (!Array.isArray(json.candles) || json.candles.length === 0) {
          throw new Error("No candles found in chart JSON");
        }

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
        if (!param || param.time === undefined || param.time === null) return;

        const clickedTime = Number(param.time);

        const index = data.candles.findIndex((candle) => {
          return candleTime(candle) === clickedTime;
        });

        if (index >= 0) {
          setPlaying(false);
          setSelectedCandleIndex(index);
          setStatus(
            `Selected candle #${index + 1}. Tap Start Replay From Selected.`
          );
        }
      } catch (err) {
        console.error("Candle selection error:", err);
        setStatus("Could not select this candle. Try tapping directly on a candle body.");
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
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [data]);

  // Initial replay data load only when replay start changes.
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

  // Next and Play only append/update one candle.
  // This keeps the user's zoom and pan unchanged.
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

  function startReplayFromSelected() {
    if (selectedCandleIndex === null) {
      setStatus("Tap a candle first.");
      return;
    }

    setPlaying(false);
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
    selectedCandleIndex !== null ? data.candles[selectedCandleIndex] : null;

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

      <section className="status-card">
        <strong>{status}</strong>
      </section>

      <section className="chart-card">
        <div ref={chartBox} className="chart" />
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
                Selected candle #{selectedCandleIndex + 1} ·{" "}
                {new Date(selected.time).toLocaleDateString()} · Close ₹
                {Number(selected.close).toFixed(2)}
              </span>

              <button className="play" onClick={startReplayFromSelected}>
                Start Replay From Selected
              </button>
            </>
          ) : (
            <span>Tap directly on any candle body to select replay start.</span>
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

      <section className="replay-card">
        <strong>Drawing tools temporarily disabled</strong>
        <p>
          First we are stabilizing exact candle selection and bar replay.
          Horizontal line, trend line, box, long and short tools will be added
          back in one tested update after this version is working.
        </p>
      </section>
    </main>
  );
}
