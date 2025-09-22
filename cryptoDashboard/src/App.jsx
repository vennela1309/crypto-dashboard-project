/*
React Crypto Dashboard — Single-file Starter (App.jsx)

How to use:
1. Create a Vite React app (recommended):
   npm create vite@latest crypto-dashboard -- --template react
   cd crypto-dashboard
2. Replace src/App.jsx with the contents of this file.
3. Install deps (none required for this file — uses native fetch). If you want icons, install react-icons.
4. Run the dev server: npm install && npm run dev

Notes:
- This is a compact, single-file starter that implements:
  - Header with market summary cards
  - Highlights: Trending and Top Gainers
  - Search (debounced) and client-side filtering
  - Sortable table columns (price, 24h change, market cap, volume)
  - Pagination via "Load more" (simple infinite page loader)
  - Lightweight modal for coin details
  - Loading and error states
  - Sparkline (mini SVG) using sparkline data from CoinGecko

- For production hide API keys behind a backend. This example uses the public CoinGecko endpoints.
- If you hit rate limits during development, reduce requests frequency or switch to a server proxy.
*/

import React, { useEffect, useMemo, useState, useRef } from "react";
import Highlights from "./components/Highlights";

// ---------- Helpers ----------
function formatCurrency(n) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function formatNumber(n) {
  if (n === null || n === undefined) return "-";
  return new Intl.NumberFormat("en-US").format(n);
}
function formatPercent(n) {
  if (n === null || n === undefined) return "-";
  return `${n.toFixed(2)}%`;
}

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

// Simple SVG sparkline component
function Sparkline({ data = [], width = 110, height = 30, stroke = "#16a34a" }) {
  if (!data || data.length === 0) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((d, i) => {
    const x = i * step;
    const y = height - ((d - min) / range) * height;
    return `${x},${y}`;
  });
  const dAttr = `M${points.join(' L ')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={dAttr} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ---------- API helpers ----------
const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

async function fetchMarkets({ page = 1, per_page = 50, signal } = {}) {
  const url = new URL(`${COINGECKO_BASE}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(per_page));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sparkline", "true");
  url.searchParams.set("price_change_percentage", "24h");
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data;
}

async function fetchTrending(signal) {
  const url = `${COINGECKO_BASE}/search/trending`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.coins || [];
}

async function fetchCoinDetail(id, signal) {
  const url = new URL(`${COINGECKO_BASE}/coins/${id}`);
  // minimize payload
  url.searchParams.set("localization", "false");
  url.searchParams.set("tickers", "false");
  url.searchParams.set("market_data", "true");
  url.searchParams.set("community_data", "false");
  url.searchParams.set("developer_data", "false");
  url.searchParams.set("sparkline", "true");
  const res = await fetch(url.toString(), { signal });
  if (!res.ok) throw new Error(`API ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data;
}

// ---------- Modal ----------
function Modal({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <button style={styles.modalClose} onClick={onClose}>✕</button>
        {children}
      </div>
    </div>
  );
}

// ---------- Main App ----------
export default function App() {
  const [coins, setCoins] = useState([]);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 300);
  const [sortBy, setSortBy] = useState({ key: 'market_cap_rank', dir: 'asc' });
  const [highlightsOpen, setHighlightsOpen] = useState(true);
  const [trending, setTrending] = useState([]);
  const [selectedCoin, setSelectedCoin] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    abortRef.current && abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    fetchMarkets({ page: 1, per_page: perPage, signal: controller.signal })
      .then((data) => {
        setCoins(data);
        setPage(1);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    // trending
    fetchTrending(controller.signal).then((t) => setTrending(t)).catch(() => {});

    return () => controller.abort();
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchMarkets({ page: nextPage, per_page: perPage });
      setCoins((c) => [...c, ...data]);
      setPage(nextPage);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // search + filter
  const filtered = useMemo(() => {
    if (!debouncedSearch) return coins;
    const q = debouncedSearch.toLowerCase();
    return coins.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
  }, [coins, debouncedSearch]);

  // sorting
  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy;
    arr.sort((a, b) => {
      let av = a[key];
      let bv = b[key];
      // nested path checks
      if (key === 'price_change_percentage_24h') {
        av = a.price_change_percentage_24h;
        bv = b.price_change_percentage_24h;
      }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av > bv) return dir === 'asc' ? 1 : -1;
      if (av < bv) return dir === 'asc' ? -1 : 1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy((s) => {
      if (s.key === key) return { key, dir: s.dir === 'asc' ? 'desc' : 'asc' };
      return { key, dir: 'asc' };
    });
  }

  // highlights
  const topGainers = useMemo(() => {
    const arr = [...coins].filter(c => typeof c.price_change_percentage_24h === 'number');
    arr.sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
    return arr.slice(0, 3);
  }, [coins]);

  // open detail modal
  useEffect(() => {
    if (!selectedCoin) return;
    setDetailLoading(true);
    setDetail(null);
    let mounted = true;
    const controller = new AbortController();
    fetchCoinDetail(selectedCoin.id, controller.signal)
      .then((d) => {
        if (!mounted) return;
        setDetail(d);
      })
      .catch((err) => {
        console.error('detail fetch error', err);
      })
      .finally(() => setDetailLoading(false));
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [selectedCoin]);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>Cryptocurrency Prices by Market Cap</h1>
          <p style={styles.subtitle}>The global cryptocurrency market cap today is ~ <strong>{coins && coins.length ? formatCurrency(coins.reduce((s,c)=>s+(c.market_cap||0),0)) : '—'}</strong></p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            Highlights
           
            <input type='checkbox' checked={highlightsOpen} onChange={(e)=>setHighlightsOpen(e.target.checked)} />
          </label>
        </div>
      </header>

      {/* top cards + highlights */}
      <section style={styles.topGrid}>
        <div style={styles.card}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{coins && coins.length ? formatCurrency(coins.reduce((s,c)=>s+(c.market_cap||0),0)) : '—'}</div>
          <div style={{ color: '#16a34a', marginTop: 6 }}>Market Cap ▲ 1.2%</div>
          {/* tiny sparkline using aggregated data */}
          <div style={{ marginTop: 8 }}> <Sparkline data={coins.slice(0,6).flatMap(c => c.sparkline_in_7d?.price?.slice(-20) || [])} width={180} height={40} /></div>
        </div>

        <div style={styles.card}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{coins && coins.length ? formatCurrency(coins.reduce((s,c)=>s+(c.total_volume||0),0)) : '—'}</div>
          <div style={{ color: '#0ea5e9', marginTop: 6 }}>24h Trading Volume</div>
          <div style={{ marginTop: 8 }}><Sparkline data={coins.slice(0,6).flatMap(c => c.sparkline_in_7d?.price?.slice(-18) || [])} width={180} height={40} stroke="#0ea5e9" /></div>
        </div>

        {highlightsOpen && (
          <div style={{ ...styles.card, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Trending</h3>
              <a href="#" onClick={(e)=>e.preventDefault()}>View more</a>
            </div>
            <div style={{ marginTop: 8 }}>
              {trending.length === 0 && <div style={{ color: '#888' }}>No trending data</div>}
              {trending.map((tObj, idx) => {
                const item = tObj.item || tObj;
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <img src={item.small} alt="" style={{ width: 20, height: 20, borderRadius: 10 }} />
                      <div>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{item.symbol.toUpperCase()}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 80 }}>$ -</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {highlightsOpen && (
          <div style={{ ...styles.card, flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Top Gainers</h3>
              <a href="#" onClick={(e)=>e.preventDefault()}>View more</a>
            </div>
            <div style={{ marginTop: 8 }}>
              {topGainers.map((c) => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f2f2f2' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <img src={c.image} alt="" style={{ width: 20, height: 20, borderRadius: 10 }} />
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontWeight: 700 }}>{c.current_price ? `$${c.current_price.toLocaleString()}` : '-'}</div>
                    <div style={{ color: '#16a34a' }}>{c.price_change_percentage_24h?.toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* search + filters */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or symbol"
          style={styles.search}
        />

        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.filterBtn}>All</button>
          <button style={styles.filterBtn}>Highlights</button>
          <button style={styles.filterBtn}>Categories</button>
          <button style={styles.filterBtn}>More ▾</button>
        </div>
      </div>

      {/* table */}
      <section style={{ marginTop: 20 }}>
        <div style={styles.tableHead}>
          <div style={{ width: 40, textAlign: 'center' }}>#</div>
          <div style={{ flex: 2 }}>Coin</div>
          <div style={{ width: 120, textAlign: 'right', cursor: 'pointer' }} onClick={()=>toggleSort('current_price')}>Price</div>
          <div style={{ width: 120, textAlign: 'right', cursor: 'pointer' }} onClick={()=>toggleSort('price_change_percentage_24h')}>24h</div>
          <div style={{ width: 160, textAlign: 'right', cursor: 'pointer' }} onClick={()=>toggleSort('total_volume')}>24h Volume</div>
          <div style={{ width: 160, textAlign: 'right', cursor: 'pointer' }} onClick={()=>toggleSort('market_cap')}>Market Cap</div>
          <div style={{ width: 160, textAlign: 'right' }}>Last 7 Days</div>
        </div>

        {loading && (
          <div style={{ padding: 20 }}>Loading data…</div>
        )}

        {!loading && sorted.map((c, idx) => (
          <div key={c.id} style={styles.tableRow} onClick={() => setSelectedCoin({ id: c.id, name: c.name })}>
            <div style={{ width: 40, textAlign: 'center' }}>{c.market_cap_rank}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flex: 2 }}>
              <img src={c.image} alt="" style={{ width: 28, height: 28, borderRadius: 8 }} />
              <div>
                <div style={{ fontWeight: 700 }}>{c.name} <span style={{ color: '#666', fontSize: 13, marginLeft: 6 }}>{c.symbol.toUpperCase()}</span></div>
                <div style={{ fontSize: 12, color: '#888' }}>{c.market_cap_rank ? `Rank #${c.market_cap_rank}` : ''}</div>
              </div>
            </div>

            <div style={{ width: 120, textAlign: 'right' }}>{c.current_price ? `$${c.current_price.toLocaleString()}` : '-'}</div>

            <div style={{ width: 120, textAlign: 'right', color: c.price_change_percentage_24h >= 0 ? '#16a34a' : '#ef4444' }}>{c.price_change_percentage_24h ? `${c.price_change_percentage_24h.toFixed(2)}%` : '-'}</div>

            <div style={{ width: 160, textAlign: 'right' }}>{c.total_volume ? formatNumber(Math.round(c.total_volume)) : '-'}</div>

            <div style={{ width: 160, textAlign: 'right' }}>{c.market_cap ? formatNumber(Math.round(c.market_cap)) : '-'}</div>

            <div style={{ width: 160, textAlign: 'right' }}>
              <Sparkline data={c.sparkline_in_7d?.price?.slice(-20) || []} width={140} height={40} stroke={c.price_change_percentage_24h >= 0 ? '#16a34a' : '#ef4444'} />
            </div>
          </div>
        ))}

        {sorted.length === 0 && !loading && (
          <div style={{ padding: 20, color: '#666' }}>No coins found.</div>
        )}

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={loadMore} style={styles.loadMoreBtn} disabled={loadingMore}>{loadingMore ? 'Loading…' : 'Load more'}</button>
        </div>

      </section>

      <Modal open={!!selectedCoin} onClose={() => { setSelectedCoin(null); setDetail(null); }}>
        <div>
          {detailLoading && <div>Loading...</div>}
          {detail && (
            <div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <img src={detail.image?.small} alt="" style={{ width: 36, height: 36 }} />
                <div>
                  <h2 style={{ margin: 0 }}>{detail.name} <small style={{ color: '#666' }}>{detail.symbol?.toUpperCase()}</small></h2>
                  <div style={{ color: '#666' }}>{detail.market_data?.current_price?.usd ? `$${detail.market_data.current_price.usd.toLocaleString()}` : '-'}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <strong>Market Cap:</strong> {detail.market_data?.market_cap?.usd ? formatCurrency(detail.market_data.market_cap.usd) : '-'}
              </div>

              <div style={{ marginTop: 12 }}>
                <strong>24h Change:</strong> {detail.market_data?.price_change_percentage_24h ? `${detail.market_data.price_change_percentage_24h.toFixed(2)}%` : '-'}
              </div>

              <div style={{ marginTop: 12 }}>
                <a href={detail.links?.homepage?.[0]} target="_blank" rel="noreferrer">Official website</a>
              </div>

            </div>
          )}
        </div>
      </Modal>

      {error && (
        <div style={{ marginTop: 12, color: 'red' }}>
          API error: {error} <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

    </div>
  );
}

// ---------- Styles (inline for convenience) ----------
const styles = {
  page: { maxWidth: 1200, margin: '24px auto', padding: '0 16px', fontFamily: 'Inter, system-ui, -apple-system, Roboto, "Segoe UI", "Helvetica Neue", Arial' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, fontSize: 22 },
  subtitle: { margin: 0, color: '#666', marginTop: 6 },
  topGrid: { display: 'grid', gridTemplateColumns: '220px 220px 1fr 1fr', gap: 12, marginTop: 16 },
  card: { background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', border: '1px solid #f3f4f6' },
  search: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', width: 360 },
  filterBtn: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: 'white' },
  tableHead: { display: 'flex', gap: 12, padding: '12px 8px', color: '#6b7280', borderBottom: '1px solid #f3f4f6', alignItems: 'center', fontSize: 14, marginTop: 8 },
  tableRow: { display: 'flex', gap: 12, padding: '12px 8px', borderBottom: '1px solid #f8fafc', alignItems: 'center', cursor: 'pointer' },
  loadMoreBtn: { padding: '8px 16px', borderRadius: 8, border: 'none', background: '#111827', color: 'white' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  modal: { width: 720, maxWidth: '95%', background: 'white', borderRadius: 8, padding: 18, position: 'relative' },
  modalClose: { position: 'absolute', right: 8, top: 8, border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' },
};
