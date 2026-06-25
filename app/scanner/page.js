"use client";

import { useEffect, useMemo, useState } from "react";
import "../style.css";

const BASE_PATH = "/ict-nse-scanner";
const TIMEFRAME = "1D";

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
  const [manifest, setManifest] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [biasFilter, setBiasFilter] = useState("All");
  const [zoneFilter, setZoneFilter] = useState("All");
  const [sort, setSort] = useState("newest");
  const [pageNumber, setPageNumber] = useState(1);

  useEffect(() => {
    let cancelled = false;

    fetch(`${BASE_PATH}/data/scanner/${TIMEFRAME}/scanner_manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`Manifest unavailable (${response.status})`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!Array.isArray(json.pages) || !Number.isFinite(Number(json.total_pages))) {
          throw new Error("Invalid scanner manifest");
        }
        setManifest(json);
        setPageNumber(1);
      })
      .catch((err) => {
        if (cancelled) return;

        console.warn("Manifest load failed, trying legacy scanner fallback:", err);

        // Phase 18A fallback: old scanner_daily.json
        fetch(`${BASE_PATH}/data/scanner_daily.json`)
          .then((response) => {
            if (!response.ok) throw new Error(`Legacy scanner unavailable (${response.status})`);
            return response.json();
          })
          .then((legacy) => {
            if (cancelled) return;
            if (!Array.isArray(legacy.results)) throw new Error("Invalid legacy scanner data");

            const fallbackManifest = {
              timeframe: "1D",
              total_symbols: legacy.results.length,
              total_pages: 1,
              pages: [{ page: 1, file: "legacy" }]
            };

            setManifest(fallbackManifest);
            setPageData({
              timeframe: "1D",
              page: 1,
              results: legacy.results
            });
          })
          .catch((fallbackErr) => {
            if (cancelled) return;
            console.error("Legacy scanner fallback failed:", fallbackErr);
            setError("Scanner data could not load. Refresh after GitHub Pages deployment is green.");
          });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!manifest) return;

    // Legacy fallback already has rows in memory.
    if (manifest.pages?.[0]?.file === "legacy") return;

    let cancelled = false;
    setPageData(null);

    const info = manifest.pages.find((item) => Number(item.page) === Number(pageNumber));
    const file = info?.file || `scanner_page_${String(pageNumber).padStart(3, "0")}.json`;

    fetch(`${BASE_PATH}/data/scanner/${TIMEFRAME}/${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Page unavailable (${response.status})`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (!Array.isArray(json.results)) throw new Error("Invalid scanner page");
        setPageData(json);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError("Scanner page could not load.");
      });

    return () => {
      cancelled = true;
    };
  }, [manifest, pageNumber]);

  const visibleRows = useMemo(() => {
    const rows = Array.isArray(pageData?.results) ? [...pageData.results] : [];
    const query = search.trim().toUpperCase();

    return rows
      .filter((row) => {
        const symbol = String(row?.symbol || "").toUpperCase();
        const bias = String(row?.bias || "Neutral");

        const searchMatch = !query || symbol.includes(query);
        const biasMatch = biasFilter === "All" || bias === biasFilter;

        const ob = Number(row?.active_ob_count || 0);
        const cisd = Number(row?.active_cisd_count || 0);

        const zoneMatch =
          zoneFilter === "All" ||
          (zoneFilter === "OB" && ob > 0) ||
          (zoneFilter === "CISD" && cisd > 0);

        return searchMatch && biasMatch && zoneMatch;
      })
      .sort((a, b) => {
        if (sort === "symbol") {
          return String(a.symbol || "").localeCompare(String(b.symbol || ""));
        }

        if (sort === "zones") {
          const aZones = Number(a.active_ob_count || 0) + Number(a.active_fvg_count || 0) + Number(a.active_cisd_count || 0);
          const bZones = Number(b.active_ob_count || 0) + Number(b.active_fvg_count || 0) + Number(b.active_cisd_count || 0);
          return bZones - aZones || String(a.symbol || "").localeCompare(String(b.symbol || ""));
        }

        const aTime = new Date(a?.latest_structure?.created_at || 0).getTime();
        const bTime = new Date(b?.latest_structure?.created_at || 0).getTime();
        return bTime - aTime || String(a.symbol || "").localeCompare(String(b.symbol || ""));
      });
  }, [pageData, search, biasFilter, zoneFilter, sort]);

  const totalPages = Number(manifest?.total_pages || 1);
  const totalSymbols = Number(manifest?.total_symbols || 0);

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
          <p>SMC FINAL PRO Pine-parity scanner · 1D · {totalSymbols || "Loading"} symbols</p>
        </div>
        <a className="scanner-back-chart" href={`${BASE_PATH}/`}>Open chart</a>
      </header>

      <section className="scanner-page-card">
        <div className="scanner-timeframe-bar">
          <button type="button" className="scanner-timeframe active">1D</button>
          <span>4H · 1H · 15m · 5m · 3m · 1m will be added later</span>
        </div>

        <div className="scanner-toolbar scanner-page-toolbar">
          <input className="scanner-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search current page..." />
          <select className="scanner-select" value={biasFilter} onChange={(e) => setBiasFilter(e.target.value)}>
            <option value="All">All structure</option>
            <option value="Bullish">Bullish</option>
            <option value="Bearish">Bearish</option>
            <option value="Neutral">Neutral</option>
          </select>
          <select className="scanner-select" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
            <option value="All">All zones</option>
            <option value="OB">Active OB only</option>
            <option value="CISD">Active CISD only</option>
          </select>
          <select className="scanner-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">Newest structure</option>
            <option value="zones">Most active zones</option>
            <option value="symbol">Symbol A–Z</option>
          </select>
          <button type="button" className="scanner-reset" onClick={resetFilters}>Reset</button>
        </div>

        {error && <p className="scanner-error">{error}</p>}
        {!manifest && !error && <p className="scanner-loading">Loading scanner manifest…</p>}
        {manifest && !pageData && !error && <p className="scanner-loading">Loading page {pageNumber}…</p>}

        {manifest && pageData && (
          <>
            <div className="scanner-results-note">
              Page {pageNumber} of {totalPages} · {visibleRows.length} of {pageData.results.length} rows shown
            </div>

            <div className="scanner-list scanner-page-list">
              {visibleRows.map((row) => {
                const structure = row.latest_structure;
                const structureText = structure?.type ? structure.type.replaceAll("_", " ") : "No structure";
                const biasClass = row.bias === "Bullish" ? "scanner-bull" : row.bias === "Bearish" ? "scanner-bear" : "scanner-neutral";

                return (
                  <div className="scanner-row" key={row.symbol}>
                    <div className="scanner-symbol">
                      <strong>{row.symbol}</strong>
                      <span>₹ {Number(row.close || 0).toFixed(2)}</span>
                    </div>
                    <div className="scanner-detail">
                      <b className={biasClass}>{row.bias || "Neutral"} local structure</b>
                      <span>{structureText} · {shortDate(structure?.created_at)}</span>
                    </div>
                    <div className="scanner-zone">
                      <b>{zoneText(row)}</b>
                      <span>OB {row.active_ob_count || 0} · FVG {row.active_fvg_count || 0} · CISD {row.active_cisd_count || 0}</span>
                    </div>
                    <a className="scanner-open-chart" href={`${BASE_PATH}/?symbol=${encodeURIComponent(row.symbol)}`}>
                      View chart
                    </a>
                  </div>
                );
              })}
            </div>

            {visibleRows.length === 0 && <div className="scanner-empty">No symbols match these filters on this page.</div>}

            <div className="scanner-pagination">
              <button type="button" disabled={pageNumber <= 1} onClick={() => setPageNumber((v) => Math.max(1, v - 1))}>Previous</button>
              <span>Page {pageNumber} of {totalPages}</span>
              <button type="button" disabled={pageNumber >= totalPages} onClick={() => setPageNumber((v) => Math.min(totalPages, v + 1))}>Next</button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
