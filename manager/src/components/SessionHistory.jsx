import React, { useState, useMemo } from "react";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms) {
  if (!ms) return "—";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatSessionDuration(seconds) {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="hist-stat-card" style={{ borderColor: color }}>
      <div className="hist-stat-value" style={{ color }}>{value}</div>
      <div className="hist-stat-label">{label}</div>
      {sub && <div className="hist-stat-sub">{sub}</div>}
    </div>
  );
}

export default function SessionHistory({ history = [], sales = [], pcs = [] }) {
  const [filterPC,       setFilterPC]       = useState("all");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterDate,     setFilterDate]     = useState("all");
  const [customDate,     setCustomDate]     = useState("");
  const [expandedKey,    setExpandedKey]    = useState(null);

  // ── Unique customer names from history ─────────────────────────────────────
  const customerNames = useMemo(() => {
    const names = new Set(
      history.map((h) => h.customer_name).filter(Boolean)
    );
    return ["", ...Array.from(names).sort()];
  }, [history]);

  // ── Date filter helper ─────────────────────────────────────────────────────
  function inDateRange(ts) {
    if (filterDate === "custom" && customDate) {
      const s = new Date(customDate); s.setHours(0,0,0,0);
      const e = new Date(customDate); e.setHours(23,59,59,999);
      return ts >= s.getTime() && ts <= e.getTime();
    }
    if (filterDate === "all") return true;
    const now = Date.now();
    if (filterDate === "today") { const d = new Date(); d.setHours(0,0,0,0); return ts >= d.getTime(); }
    if (filterDate === "week")  return now - ts <= 7  * 24 * 3600 * 1000;
    if (filterDate === "month") return now - ts <= 30 * 24 * 3600 * 1000;
    return true;
  }

  // ── Filtered history ───────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return history.filter((h) => {
      const matchPC       = filterPC === "all"
        || (String(filterPC).startsWith("ps5_") ? h.pc_name === `PS5-#${filterPC.replace("ps5_","")}` || h.dev_id == filterPC.replace("ps5_","")
        : h.pc_id === Number(filterPC));
      const matchCustomer = !filterCustomer ||
        (h.customer_name || "").toLowerCase().includes(filterCustomer.toLowerCase());
      const matchDate     = inDateRange(h.session_end || h.logged_at);
      return matchPC && matchCustomer && matchDate;
    });
  }, [history, filterPC, filterCustomer, filterDate]);

  // ── Stats for filtered results ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const totalSessions  = filtered.length;
    const totalDuration  = filtered.reduce((s, h) => {
      if (h.session_start && h.session_end) return s + (h.session_end - h.session_start);
      return s + (h.session_duration || 0) * 1000;
    }, 0);
    const uniqueCustomers = new Set(filtered.map((h) => h.customer_name).filter(Boolean)).size;
    const pcUsage = {};
    filtered.forEach((h) => { pcUsage[h.pc_name] = (pcUsage[h.pc_name] || 0) + 1; });
    const topPC = Object.entries(pcUsage).sort((a, b) => b[1] - a[1])[0];
    const ps5Sessions_count = filtered.filter(h => h.dev_type === "ps5").length;
    const pcSessions_count  = filtered.filter(h => h.dev_type !== "ps5").length;
    return { totalSessions, totalDuration, uniqueCustomers, topPC, ps5Sessions_count, pcSessions_count };
  }, [filtered]);

  // ── Canteen purchases per session (match by pc_id + time overlap) ──────────
  function getSessionPurchases(session) {
    if (!session.pc_id || !session.session_start) return [];
    const start = session.session_start;
    const end   = session.session_end || Date.now();
    return sales.filter((s) =>
      s.pc_id === session.pc_id &&
      s.sold_at >= start &&
      s.sold_at <= end
    );
  }

  return (
    <div className="history-page">

      {/* ── Stats Row ── */}
      <div className="hist-stats-row">
        <StatCard label="Total Sessions" value={stats.totalSessions} color="var(--accent)" />
        <StatCard label="Total Play Time" value={formatDuration(stats.totalDuration)} color="var(--green)" />
        <StatCard label="Unique Customers" value={stats.uniqueCustomers} color="var(--yellow)" />
        <StatCard
          label="Most Used PC"
          value={stats.topPC ? stats.topPC[0] : "—"}
          sub={stats.topPC ? `${stats.topPC[1]} sessions` : null}
          color="var(--orange)"
        />
      </div>

      {/* ── Filters ── */}
      <div className="hist-filters">
        {/* Device filter — PC + PS5 */}
        <div className="hist-filter-group">
          <label className="hist-filter-label">🖥 Device</label>
          <select className="hist-select" value={filterPC}
            onChange={(e) => setFilterPC(e.target.value)}>
            <option value="all">All Devices</option>
            <optgroup label="── PCs ──">
              {pcs.map((pc) => (
                <option key={`pc-${pc.id}`} value={pc.id}>{pc.name}</option>
              ))}
            </optgroup>
            <optgroup label="── PS5 ──">
              {[1,2,3,4,5].map(n => (
                <option key={`ps5-${n}`} value={`ps5_${n}`}>PS5 #{n}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Customer filter */}
        <div className="hist-filter-group">
          <label className="hist-filter-label">👤 Customer</label>
          <div className="hist-search-wrap">
            <input
              className="input-name hist-search"
              placeholder="Search by name..."
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
            />
            {filterCustomer && (
              <button className="hist-clear-btn" onClick={() => setFilterCustomer("")}>✕</button>
            )}
          </div>
        </div>

        {/* Customer quick-pick */}
        {customerNames.filter(Boolean).length > 0 && (
          <div className="hist-filter-group">
            <label className="hist-filter-label">Quick Pick</label>
            <div className="hist-customer-pills">
              {customerNames.filter(Boolean).slice(0, 8).map((name) => (
                <button
                  key={name}
                  className={`hist-customer-pill ${filterCustomer === name ? "active" : ""}`}
                  onClick={() => setFilterCustomer(filterCustomer === name ? "" : name)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Date range + calendar */}
        <div className="hist-filter-group" style={{flexWrap:"wrap",gap:10}}>
          <label className="hist-filter-label">📅 Period</label>
          <div className="hist-date-pills">
            {[["all","All Time"],["today","Today"],["week","This Week"],["month","This Month"]].map(([v,l]) => (
              <button key={v}
                className={`hist-date-pill ${filterDate===v&&!customDate?"active":""}`}
                onClick={() => { setFilterDate(v); setCustomDate(""); }}>{l}
              </button>
            ))}
          </div>
          <div className="calendar-input-wrap" style={{marginLeft:"auto"}}>
            <input type="date"
              className={`input-name calendar-input ${customDate?"calendar-active":""}`}
              value={customDate}
              max={new Date().toISOString().slice(0,10)}
              onChange={e => { setCustomDate(e.target.value); if(e.target.value) setFilterDate("custom"); else setFilterDate("all"); }}
            />
            {customDate && <button className="calendar-clear-btn" onClick={()=>{setCustomDate("");setFilterDate("all");}}>✕</button>}
          </div>
          {customDate && (
            <span className="calendar-showing-label" style={{width:"100%"}}>
              📆 Showing: <strong>{new Date(customDate).toLocaleDateString("en-IN",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</strong>
            </span>
          )}
        </div>

        {/* Result count */}
        <div className="hist-result-count">
          {filtered.length} session{filtered.length !== 1 ? "s" : ""} found
        </div>
      </div>

      {/* ── Table ── */}
      <div className="hist-table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            No sessions found for selected filters
          </div>
        ) : (
          <table className="hist-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>PC</th>
                <th>Customer</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Booked</th>
                <th>Ended By</th>
                <th>Canteen</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((session) => {
                const purchases = getSessionPurchases(session);
                const canteenTotal = purchases.reduce((s, p) => s + p.total, 0);
                const actualDuration = session.session_start && session.session_end
                  ? session.session_end - session.session_start
                  : null;
                const isExpanded = expandedKey === session.key;

                return (
                  <React.Fragment key={session.key}>
                    <tr
                      className={`hist-row ${isExpanded ? "hist-row-expanded" : ""}`}
                      onClick={() => setExpandedKey(isExpanded ? null : session.key)}
                    >
                      <td>
                        <div className="hist-date">{formatDate(session.session_end || session.logged_at)}</div>
                      </td>
                      <td>
                        <span className="hist-pc-badge">{session.pc_name || `PC-0${session.pc_id}`}</span>
                      </td>
                      <td>
                        <span className="hist-customer">
                          {session.customer_name || <span className="hist-anon">Guest</span>}
                        </span>
                      </td>
                      <td className="hist-time-cell">{formatTime(session.session_start)}</td>
                      <td className="hist-time-cell">{formatTime(session.session_end)}</td>
                      <td>
                        <span className="hist-duration">
                          {actualDuration ? formatDuration(actualDuration) : formatSessionDuration(session.session_duration)}
                        </span>
                      </td>
                      <td>
                        <span className="hist-booked">{formatSessionDuration(session.session_duration)}</span>
                      </td>
                      <td>
                        <span className={`hist-ended-badge ${session.ended_by === "timer" ? "badge-timer" : "badge-manager"}`}>
                          {session.ended_by === "timer" ? "⏱ Timer" : "👨‍💼 Manager"}
                        </span>
                      </td>
                      <td>
                        {canteenTotal > 0
                          ? <span className="hist-canteen-amt">₹{canteenTotal.toFixed(0)}</span>
                          : <span className="hist-no-canteen">—</span>
                        }
                      </td>
                      <td>
                        <button className="hist-expand-btn">
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded row — canteen purchases */}
                    {isExpanded && (
                      <tr className="hist-detail-row">
                        <td colSpan={10}>
                          <div className="hist-detail-box">
                            <div className="hist-detail-grid">
                              {/* Session info */}
                              <div className="hist-detail-section">
                                <h4>📋 Session Info</h4>
                                <div className="hist-detail-item">
                                  <span>PC</span><strong>{session.pc_name}</strong>
                                </div>
                                <div className="hist-detail-item">
                                  <span>Customer</span>
                                  <strong>{session.customer_name || "Guest"}</strong>
                                </div>
                                {session.customer_phone && (
                                  <div className="hist-detail-item">
                                    <span>📞 Phone</span>
                                    <strong>{session.customer_phone}</strong>
                                  </div>
                                )}
                                {session.customer_address && (
                                  <div className="hist-detail-item">
                                    <span>🏠 Address</span>
                                    <strong>{session.customer_address}</strong>
                                  </div>
                                )}
                                <div className="hist-detail-item">
                                  <span>Started</span>
                                  <strong>{formatDate(session.session_start)} {formatTime(session.session_start)}</strong>
                                </div>
                                <div className="hist-detail-item">
                                  <span>Ended</span>
                                  <strong>{formatDate(session.session_end)} {formatTime(session.session_end)}</strong>
                                </div>
                                <div className="hist-detail-item">
                                  <span>Actual Duration</span>
                                  <strong>{actualDuration ? formatDuration(actualDuration) : "—"}</strong>
                                </div>
                                <div className="hist-detail-item">
                                  <span>Booked Duration</span>
                                  <strong>{formatSessionDuration(session.session_duration)}</strong>
                                </div>
                                <div className="hist-detail-item">
                                  <span>Ended By</span>
                                  <strong>{session.ended_by === "timer" ? "⏱ Timer expired" : "👨‍💼 Manager"}</strong>
                                </div>
                              </div>

                              {/* Canteen purchases */}
                              <div className="hist-detail-section">
                                <h4>🛒 Canteen Purchases</h4>
                                {purchases.length === 0 ? (
                                  <p className="hist-no-purchases">No purchases during this session</p>
                                ) : (
                                  <>
                                    {purchases.map((p) => (
                                      <div key={p.key || p.sold_at} className="hist-purchase-row">
                                        <span className="hist-purchase-name">{p.item_name}</span>
                                        <span className="hist-purchase-qty">×{p.quantity}</span>
                                        <span className="hist-purchase-amt">₹{p.total.toFixed(0)}</span>
                                        <span className="hist-purchase-time">{formatTime(p.sold_at)}</span>
                                      </div>
                                    ))}
                                    <div className="hist-purchase-total">
                                      <span>Total Canteen</span>
                                      <strong>₹{canteenTotal.toFixed(2)}</strong>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}