 "use client";

import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries } from "lightweight-charts";
import "./style.css";

const BASE_PATH = "/ict-nse-scanner";

const SYMBOLS = [
  { symbol: "RELIANCE", label: "RELIANCE", file: "NSE_RELIANCE_1D.json" },
  { symbol: "TCS", label: "TCS", file: "NSE_TCS_1D.json" },
  { symbol: "HDFCBANK", label: "HDFCBANK", file: "NSE_HDFCBANK_1D.json" },
  { symbol: "INFY", label: "INFY", file: "NSE_INFY_1D.json" },
  { symbol: "ICICIBANK", label: "ICICIBANK", file: "NSE_ICICIBANK_1D.json" },
  { symbol: "SBIN", label: "SBIN", file: "NSE_SBIN_1D.json" },
  { symbol: "LT", label: "LT", file: "NSE_LT_1D.json" }
];

function getDataUrl(symbol) {
  const item = SYMBOLS.find((x) => x.symbol === symbol) || SYMBOLS[0];
  return `${BASE_PATH}/data/${item.file}`;
}

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
  const hLineModeRef = useRef(false);
  const manualPriceLinesRef = useRef([]);
  const positionModeRef = useRef(null);
  const positionPriceLinesRef = useRef([]);

  const [selectedSymbol, setSelectedSymbol] = useState("RELIANCE");
  const [scannerData, setScannerData] = useState(null);
  const [scannerError, setScannerError] = useState("");
  const [scannerOpen, setScannerOpen] = useState(true);
  const [scannerSearch, setScannerSearch] = useState("");
  const [scannerBiasFilter, setScannerBiasFilter] = useState("All");
  const [scannerZoneFilter, setScannerZoneFilter] = useState("All");
  const [scannerSort, setScannerSort] = useState("newest");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [replayStart, setReplayStart] = useState(null);
  const [replayIndex, setReplayIndex] = useState(null);
  const [replaySelectMode, setReplaySelectMode] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [themeName, setThemeName] = useState("dark");
  const [status, setStatus] = useState("Full chart loaded. Tap ✂ Bar Replay to choose a candle.");
  const [hLineMode, setHLineMode] = useState(false);
  const [manualLines, setManualLines] = useState([]);
  const [positionMode, setPositionMode] = useState(null);
  const [positionDraft, setPositionDraft] = useState(null);
  const [positions, setPositions] = useState([]);

  useEffect(() => {
    replaySelectModeRef.current = replaySelectMode;
  }, [replaySelectMode]);

  useEffect(() => {
    hLineModeRef.current = hLineMode;
  }, [hLineMode]);

  useEffect(() => {
    positionModeRef.current = positionMode;
  }, [positionMode]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`ict_native_positions_${selectedSymbol}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setPositions(parsed);
      }
    } catch (err) {
      console.warn("Could not restore positions", err);
    }
  }, [selectedSymbol]);

  useEffect(() => {
    try {
      localStorage.setItem(`ict_native_positions_${selectedSymbol}`, JSON.stringify(positions));
    } catch (err) {
      console.warn("Could not save positions", err);
    }
  }, [positions]);

  // Symbol-specific drawings are restored only after symbol changes.
  useEffect(() => {
    try {
      const savedLines = localStorage.getItem(`ict_native_hlines_${selectedSymbol}`);
      const savedPositions = localStorage.getItem(`ict_native_positions_${selectedSymbol}`);

      setManualLines(
        savedLines && Array.isArray(JSON.parse(savedLines))
          ? JSON.parse(savedLines)
          : []
      );

      setPositions(
        savedPositions && Array.isArray(JSON.parse(savedPositions))
          ? JSON.parse(savedPositions)
          : []
      );
    } catch (err) {
      console.warn("Could not restore symbol drawings", err);
      setManualLines([]);
      setPositions([]);
    }
  }, [selectedSymbol]);

  // Save H-Lines only when a symbol is active.
  useEffect(() => {
    try {
      localStorage.setItem(
        `ict_native_hlines_${selectedSymbol}`,
        JSON.stringify(manualLines)
      );
    } catch (err) {
      console.warn("Could not save H-Lines", err);
    }
  }, [manualLines]);

  // Save positions only when they change.
  useEffect(() => {
    try {
      localStorage.setItem(
        `ict_native_positions_${selectedSymbol}`,
        JSON.stringify(positions)
      );
    } catch (err) {
      console.warn("Could not save positions", err);
    }
  }, [positions]);

  // Phase 15: load Pine-parity scanner data once.
  useEffect(() => {
    let cancelled = false;

    fetch(`${BASE_PATH}/data/scanner_daily.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Scanner data unavailable (${response.status})`);
        }
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!Array.isArray(json.results)) {
          throw new Error("Scanner data format is invalid");
        }
        setScannerData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("Scanner dashboard unavailable:", err);
        setScannerError("Scanner data could not load.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Load only the selected symbol JSON.
  useEffect(() => {
    let cancelled = false;

    setError("");
    setData(null);
    setPlaying(false);
    setReplaySelectMode(false);
    setHLineMode(false);
    setPositionMode(null);
    setPositionDraft(null);
    setReplayStart(null);
    setReplayIndex(null);

    fetch(getDataUrl(selectedSymbol))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${selectedSymbol} chart data (${response.status})`);
        }
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;

        if (!Array.isArray(json.candles) || json.candles.length === 0) {
          throw new Error(`No candles found for ${selectedSymbol}`);
        }

        setData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSymbol]);

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
        if (!param?.point) return;

        // H-Line tool gets first priority.
        if (hLineModeRef.current) {
          const price = candleSeries.coordinateToPrice(param.point.y);

          if (price === null || !Number.isFinite(price)) return;

          const newLine = {
            id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            price: Number(price.toFixed(2))
          };

          setManualLines((old) => [...old, newLine]);
          setHLineMode(false);
          setStatus(`H-Line added at ₹${Number(price).toFixed(2)}.`);
          return;
        }

        // Replay candle selection.
        if (!replaySelectModeRef.current) return;

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
        console.error("Chart click error:", err);
        setStatus("Could not complete chart action. Try again.");
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
    redrawManualLines(manualLines);
    redrawPositions(positions);
  }, [manualLines, positions, data, replayIndex, themeName]);

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

  function redrawManualLines(lines) {
    if (!candleSeriesRef.current) return;

    manualPriceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch (_) {}
    });

    manualPriceLinesRef.current = [];

    lines.forEach((item) => {
      try {
        const line = candleSeriesRef.current.createPriceLine({
          price: Number(item.price),
          color: "#38bdf8",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: "H-Line"
        });
        manualPriceLinesRef.current.push(line);
      } catch (err) {
        console.warn("Could not render H-Line", err);
      }
    });
  }

  function redrawPositions(items) {
    if (!candleSeriesRef.current) return;

    positionPriceLinesRef.current.forEach((line) => {
      try {
        candleSeriesRef.current.removePriceLine(line);
      } catch (_) {}
    });

    positionPriceLinesRef.current = [];

    items.forEach((position, index) => {
      const isLong = position.side === "long";
      const prefix = `${isLong ? "Long" : "Short"} ${index + 1}`;

      const lineOptions = [
        {
          price: Number(position.entry),
          color: "#38bdf8",
          lineWidth: 2,
          lineStyle: 0,
          axisLabelVisible: true,
          title: `${prefix} Entry`
        },
        {
          price: Number(position.stop),
          color: "#ef4444",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${prefix} SL`
        },
        {
          price: Number(position.target),
          color: "#22c55e",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `${prefix} Target`
        }
      ];

      lineOptions.forEach((options) => {
        try {
          const line = candleSeriesRef.current.createPriceLine(options);
          positionPriceLinesRef.current.push(line);
        } catch (err) {
          console.warn("Could not render position line", err);
        }
      });
    });
  }

  function startPosition(side) {
    if (!data) return;

    setPlaying(false);
    setReplaySelectMode(false);
    setHLineMode(false);

    const activeIndex = replayIndex === null
      ? data.candles.length - 1
      : replayIndex;

    const close = Number(data.candles[activeIndex]?.close || 0);
    if (!Number.isFinite(close) || close <= 0) {
      setStatus("Could not create position from current price.");
      return;
    }

    const gap = Math.max(close * 0.01, 1);

    const position = side === "long"
      ? {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          side: "long",
          entry: Number(close.toFixed(2)),
          stop: Number((close - gap).toFixed(2)),
          target: Number((close + gap * 2).toFixed(2))
        }
      : {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          side: "short",
          entry: Number(close.toFixed(2)),
          stop: Number((close + gap).toFixed(2)),
          target: Number((close - gap * 2).toFixed(2))
        };

    setPositions((old) => [...old, position]);
    setPositionMode(null);
    setPositionDraft(null);
    setStatus(`${side === "long" ? "Long" : "Short"} position created. Edit its prices below.`);
  }

  function cancelPosition() {
    setPositionMode(null);
    setPositionDraft(null);
    setStatus("Position tool cancelled.");
  }

  function updatePosition(id, field, rawValue) {
    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) return;

    setPositions((old) =>
      old.map((position) =>
        position.id === id
          ? { ...position, [field]: Number(value.toFixed(2)) }
          : position
      )
    );
  }

  function deletePosition(id) {
    setPositions((old) => old.filter((position) => position.id !== id));
    setStatus("Position deleted.");
  }

  function clearPositions() {
    setPositions([]);
    cancelPosition();
    setStatus("All positions cleared.");
  }

  function toggleHLineMode() {
    setPlaying(false);
    setReplaySelectMode(false);
    setPositionMode(null);
    setPositionDraft(null);

    setHLineMode((old) => {
      const next = !old;
      setStatus(next ? "─ H-Line active. Tap any chart price." : "H-Line cancelled.");
      return next;
    });
  }

  function deleteHLine(id) {
    setManualLines((old) => old.filter((line) => line.id !== id));
    setStatus("H-Line deleted.");
  }

  function clearHLines() {
    setManualLines([]);
    setHLineMode(false);
    setStatus("All H-Lines cleared.");
  }

  function toggleReplaySelection() {
    setPlaying(false);
    setHLineMode(false);
    setPositionMode(null);
    setPositionDraft(null);
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

  function getFilteredScannerRows() {
    const rows = Array.isArray(scannerData?.results)
      ? [...scannerData.results]
      : [];

    const query = scannerSearch.trim().toUpperCase();

    const filtered = rows.filter((row) => {
      const symbol = String(row?.symbol || "").toUpperCase();
      const bias = String(row?.bias || "Neutral");

      const matchesSearch = !query || symbol.includes(query);
      const matchesBias =
        scannerBiasFilter === "All" || bias === scannerBiasFilter;

      const obCount = Number(row?.active_ob_count || 0);
      const cisdCount = Number(row?.active_cisd_count || 0);

      const matchesZone =
        scannerZoneFilter === "All" ||
        (scannerZoneFilter === "OB" && obCount > 0) ||
        (scannerZoneFilter === "CISD" && cisdCount > 0);

      return matchesSearch && matchesBias && matchesZone;
    });

    filtered.sort((a, b) => {
      if (scannerSort === "symbol") {
        return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      }

      if (scannerSort === "zones") {
        const aZones =
          Number(a.active_ob_count || 0) +
          Number(a.active_fvg_count || 0) +
          Number(a.active_cisd_count || 0);

        const bZones =
          Number(b.active_ob_count || 0) +
          Number(b.active_fvg_count || 0) +
          Number(b.active_cisd_count || 0);

        if (bZones !== aZones) return bZones - aZones;
        return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      }

      const aTime = new Date(a?.latest_structure?.created_at || 0).getTime();
      const bTime = new Date(b?.latest_structure?.created_at || 0).getTime();

      if (bTime !== aTime) return bTime - aTime;
      return String(a.symbol || "").localeCompare(String(b.symbol || ""));
    });

    return filtered;
  }

  function shortDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short"
      });
    } catch (_) {
      return "—";
    }
  }

  function scannerZoneText(row) {
    const direction = row?.latest_structure?.direction || "";

    if (Number(row?.active_ob_count || 0) > 0) {
      return direction === "bearish" ? "Bearish OB active" : "Bullish OB active";
    }
    if (Number(row?.active_fvg_count || 0) > 0) return "FVG active";
    if (Number(row?.active_cisd_count || 0) > 0) return "CISD active";
    return "No active zone";
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
      <section className="scanner-panel">
        <div className="scanner-panel-head">
          <div>
            <h2>Daily SMC Scanner</h2>
            <p>Based on your SMC FINAL PRO Pine Script · local structure and active zones</p>
          </div>

          <button
            type="button"
            className="scanner-toggle"
            onClick={() => setScannerOpen((value) => !value)}
          >
            {scannerOpen ? "Hide" : "Show"}
          </button>
        </div>

        {scannerOpen && (
          <>
            {scannerError && <p className="scanner-error">{scannerError}</p>}

            {!scannerData && !scannerError && (
              <p className="scanner-loading">Loading scanner…</p>
            )}

            {scannerData?.results?.length > 0 && (
              <>
                <div className="scanner-toolbar">
                  <input
                    className="scanner-search"
                    value={scannerSearch}
                    onChange={(event) => setScannerSearch(event.target.value)}
                    placeholder="Search symbol..."
                    aria-label="Search scanner symbols"
                  />

                  <select
                    className="scanner-select"
                    value={scannerBiasFilter}
                    onChange={(event) => setScannerBiasFilter(event.target.value)}
                    aria-label="Filter local structure"
                  >
                    <option value="All">All structure</option>
                    <option value="Bullish">Bullish</option>
                    <option value="Bearish">Bearish</option>
                    <option value="Neutral">Neutral</option>
                  </select>

                  <select
                    className="scanner-select"
                    value={scannerZoneFilter}
                    onChange={(event) => setScannerZoneFilter(event.target.value)}
                    aria-label="Filter active zones"
                  >
                    <option value="All">All zones</option>
                    <option value="OB">Active OB only</option>
                    <option value="CISD">Active CISD only</option>
                  </select>

                  <select
                    className="scanner-select"
                    value={scannerSort}
                    onChange={(event) => setScannerSort(event.target.value)}
                    aria-label="Sort scanner"
                  >
                    <option value="newest">Newest structure</option>
                    <option value="zones">Most active zones</option>
                    <option value="symbol">Symbol A–Z</option>
                  </select>

                  <button
                    type="button"
                    className="scanner-reset"
                    onClick={() => {
                      setScannerSearch("");
                      setScannerBiasFilter("All");
                      setScannerZoneFilter("All");
                      setScannerSort("newest");
                    }}
                  >
                    Reset
                  </button>
                </div>

                <div className="scanner-results-note">
                  {getFilteredScannerRows().length} of {scannerData.results.length} symbols
                </div>

                <div className="scanner-list">
                {getFilteredScannerRows().map((row) => {
                  const active = row.symbol === selectedSymbol;
                  const structure = row.latest_structure;
                  const structureText = structure?.type
                    ? structure.type.replaceAll("_", " ")
                    : "No structure";

                  const biasClass = row.bias === "Bullish"
                    ? "scanner-bull"
                    : row.bias === "Bearish"
                      ? "scanner-bear"
                      : "scanner-neutral";

                  return (
                    <div
                      className={active ? "scanner-row active" : "scanner-row"}
                      key={row.symbol}
                    >
                      <div className="scanner-symbol">
                        <strong>{row.symbol}</strong>
                        <span>₹ {Number(row.close || 0).toFixed(2)}</span>
                      </div>

                      <div className="scanner-detail">
                        <b className={biasClass}>
                          {row.bias || "Neutral"} local structure
                        </b>
                        <span>{structureText} · {shortDate(structure?.created_at)}</span>
                      </div>

                      <div className="scanner-zone">
                        <b>{scannerZoneText(row)}</b>
                        <span>
                          OB {row.active_ob_count || 0} · FVG {row.active_fvg_count || 0} · CISD {row.active_cisd_count || 0}
                        </span>
                      </div>

                      <button
                        type="button"
                        className="scanner-open-chart"
                        onClick={() => {
                          setSelectedSymbol(row.symbol);
                          setScannerOpen(false);
                        }}
                      >
                        {active ? "Viewing" : "Open chart"}
                      </button>
                    </div>
                  );
                })}
                </div>

                {getFilteredScannerRows().length === 0 && (
                  <div className="scanner-empty">
                    No symbols match these filters.
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>

      <header>
        <div>
          <h1>ICT NSE Chart</h1>
          <p>{data.meta?.exchange || "NSE"}:{data.meta?.symbol || selectedSymbol} · {data.meta?.interval || "1D"}</p>

          <label className="symbol-picker">
            <span>Symbol</span>
            <select
              value={selectedSymbol}
              onChange={(event) => setSelectedSymbol(event.target.value)}
            >
              {SYMBOLS.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
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
          <button
            className={hLineMode ? "toggle active" : "toggle"}
            onClick={toggleHLineMode}
          >
            {hLineMode ? "✕ Cancel H-Line" : "─ H-Line"}
          </button>

          <button onClick={clearHLines} disabled={manualLines.length === 0}>
            Clear Lines
          </button>

          <button
            className="toggle long-tool"
            onClick={() => startPosition("long")}
          >
            ↗ Long
          </button>

          <button
            className="toggle short-tool"
            onClick={() => startPosition("short")}
          >
            ↘ Short
          </button>

          <button onClick={clearPositions} disabled={positions.length === 0}>
            Clear Positions
          </button>
        </div>

        {manualLines.length > 0 && (
          <div className="drawing-list">
            {manualLines.map((line, index) => (
              <button
                key={line.id}
                className="drawing-item"
                onClick={() => deleteHLine(line.id)}
              >
                H-Line {index + 1} · ₹{Number(line.price).toFixed(2)} ✕
              </button>
            ))}
          </div>
        )}

        {positions.length > 0 && (
          <div className="position-editor-list">
            {positions.map((position, index) => {
              const risk = Math.abs(Number(position.entry) - Number(position.stop));
              const reward = Math.abs(Number(position.target) - Number(position.entry));
              const rr = risk > 0 ? (reward / risk).toFixed(2) : "—";

              return (
                <div key={position.id} className="position-editor">
                  <div className="position-editor-head">
                    <strong>
                      {position.side === "long" ? "↗ Long" : "↘ Short"} {index + 1}
                    </strong>
                    <span>RR {rr}</span>
                    <button
                      className="delete-position"
                      onClick={() => deletePosition(position.id)}
                    >
                      Delete
                    </button>
                  </div>

                  <div className="position-fields">
                    <label>
                      Entry
                      <input
                        type="number"
                        step="0.01"
                        value={position.entry}
                        onChange={(e) => updatePosition(position.id, "entry", e.target.value)}
                      />
                    </label>

                    <label>
                      Stop
                      <input
                        type="number"
                        step="0.01"
                        value={position.stop}
                        onChange={(e) => updatePosition(position.id, "stop", e.target.value)}
                      />
                    </label>

                    <label>
                      Target
                      <input
                        type="number"
                        step="0.01"
                        value={position.target}
                        onChange={(e) => updatePosition(position.id, "target", e.target.value)}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
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
