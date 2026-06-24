 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";
const DATA_URL = `${BASE_PATH}/data/RELIANCE_daily_chart.json`;

export default function Home() {
  const chartBox = useRef(null);
  const chartRef = useRef(null);
  const candleSeriesRef = useRef(null);

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(0);
  const [replayIndex, setReplayIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

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

  useEffect(() => {
    if (!data || !chartRef.current || !candleSeriesRef.current) return;

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

    const from = Math.max(0, replayIndex - 35);
    const to = Math.min(data.candles.length - 1, replayIndex + 10);

    if (to > from) {
      chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
    }
  }, [data, replayIndex]);

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

  function startReplay() {
    setPlaying(false);
    setReplayIndex(replayStart);
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
  const startCandle = data.candles[replayStart];

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

      <section className="chart-card">
        <div ref={chartBox} className="chart" />
      </section>

      <section className="replay-card">
        <div className="replay-top">
          <span>
            Visible candle: {replayIndex + 1} / {data.candles.length}
          </span>
          <span>
            O {current.open} · H {current.high} · L {current.low} · C {current.close}
          </span>
        </div>

        <div className="selected-candle">
          <span>
            Replay starts at candle #{replayStart + 1} ·{" "}
            {new Date(startCandle.time).toLocaleDateString()}
          </span>
        </div>

        <label className="replay-label">
          Choose replay start candle
        </label>

        <input
          type="range"
          min="0"
          max={data.candles.length - 1}
          value={replayStart}
          onChange={(event) => {
            const value = Number(event.target.value);
            setPlaying(false);
            setReplayStart(value);
            setReplayIndex(value);
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
            <option value="1">1x speed</option>
            <option value="2">2x speed</option>
            <option value="5">5x speed</option>
          </select>

          <button onClick={startReplay}>Reset</button>
        </div>
      </section>
    </main>
  );
}
