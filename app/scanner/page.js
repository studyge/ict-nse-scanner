"use client";

import { useEffect, useMemo, useState } from "react";
import "../style.css";

const BASE_PATH = "/ict-nse-scanner";

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

function zoneText(row) {
  const direction = row?.latest_structure?.direction || "";

  if (Number(row?.active_ob_count || 0) > 0) {
    return direction === "bearish" ? "Bearish OB active" : "Bullish OB active";
  }
  if (Number(row?.active_fvg_count || 0) > 0) return "FVG active";
  if (Number(row?.active_cisd_count || 0) > 0) return "CISD active";
  return "No active zone";
}

export default function ScannerPage() {
  const [scannerData, setScannerData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [biasFilter, setBiasFilter] = useState("All");
  const [zoneFilter, setZoneFilter] = useState("All");
  const [sort, setSort] = useState("newest");
  const [pageNumber, setPageNumber] = useState(1);

  const rowsPerPage = 25;

  useEffect(() => {
    let cancelled = false;

    fetch(`${BASE_PATH}/data/scanner_daily.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Scanner data unavailable (${response.status})`);
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
        console.error(err);
        setError("Scanner data could not load.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => {
    const rows = Array.isArray(scannerData?.results)
      ? [...scannerData.results]
      : [];

    const query = search.trim().toUpperCase();

    const filtered = rows.filter((row) => {
      const symbol = String(row?.symbol || "").toUpperCase();
      const bias = String(row?.bias || "Neutral");

      const matchesSearch = !query || symbol.includes(query);
      const matchesBias = biasFilter === "All" || bias === biasFilter;

      const obCount = Number(row?.active_ob_count || 0);
      const cisdCount = Number(row?.active_cisd_count || 0);

      const matchesZone =
        zoneFilter === "All" ||
        (zoneFilter === "OB" && obCount > 0) ||
        (zoneFilter === "CISD" && cisdCount > 0);

      return matchesSearch && matchesBias && matchesZone;
    });

    filtered.sort((a, b) => {
      if (sort === "symbol") {
        return String(a.symbol || "").localeCompare(String(b.symbol || ""));
      }

      if (sort === "zones") {
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
  }, [scannerData, search, biasFilter, zoneFilter, sort]);

  useEffect(() => {
    setPageNumber(1);
  }, [search, biasFilter, zoneFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / rowsPerPage));
  const safePage = Math.min(pageNumber, totalPages);
  const start = (safePage - 1) * rowsPerPage;
  const visibleRows = filteredRows.slice(start, start + rowsPerPage);

  function resetFilters() {
    setSearch("");
    setBiasFilter("All");
    setZoneFilter("All");
    setSort("newest");
  }

  return (
    <main className="scanner-page">
      <header className="scanner-page-header">
        <div>
          <h1>Daily SMC Scanner</h1>
          <p>SMC FINAL PRO Pine-parity scanner · local structure and active zones</p>
        </div>

        <a className="scanner-back-chart" href={`${BASE_PATH}/`}>
          Open chart
        </a>
      </header>

      <section className="scanner-page-card">
        <div className="scanner-toolbar scanner-page-toolbar">
          <input
            className="scanner-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search symbol..."
            aria-label="Search scanner symbols"
          />

          <select
            className="scanner-select"
            value={biasFilter}
            onChange={(event) => setBiasFilter(event.target.value)}
          >
            <option value="All">All structure</option>
            <option value="Bullish">Bullish</option>
            <option value="Bearish">Bearish</option>
            <option value="Neutral">Neutral</option>
          </select>

          <select
            className="scanner-select"
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
          >
            <option value="All">All zones</option>
            <option value="OB">Active OB only</option>
            <option value="CISD">Active CISD only</option>
          </select>

          <select
            className="scanner-select"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="newest">Newest structure</option>
            <option value="zones">Most active zones</option>
            <option value="symbol">Symbol A–Z</option>
          </select>

          <button type="button" className="scanner-reset" onClick={resetFilters}>
            Reset
          </button>
        </div>

        {error && <p className="scanner-error">{error}</p>}

        {!scannerData && !error && (
          <p className="scanner-loading">Loading scanner…</p>
        )}

        {scannerData && (
          <>
            <div className="scanner-results-note">
              Showing {visibleRows.length} of {filteredRows.length} matching symbols
            </div>

            <div className="scanner-list scanner-page-list">
              {visibleRows.map((row) => {
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
                  <div className="scanner-row" key={row.symbol}>
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
                      <b>{zoneText(row)}</b>
                      <span>
                        OB {row.active_ob_count || 0} · FVG {row.active_fvg_count || 0} · CISD {row.active_cisd_count || 0}
                      </span>
                    </div>

                    <a
                      className="scanner-open-chart"
                      href={`${BASE_PATH}/?symbol=${encodeURIComponent(row.symbol)}`}
                    >
                      View chart
                    </a>
                  </div>
                );
              })}
            </div>

            {visibleRows.length === 0 && (
              <div className="scanner-empty">No symbols match these filters.</div>
            )}

            <div className="scanner-pagination">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPageNumber((value) => Math.max(1, value - 1))}
              >
                Previous
              </button>

              <span>Page {safePage} of {totalPages}</span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPageNumber((value) => Math.min(totalPages, value + 1))}
              >
                Next
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
