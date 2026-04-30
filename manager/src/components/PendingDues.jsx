import React, { useState, useMemo } from "react";
import { addPendingDue, markDuePaid } from "../firebaseService";
import { toast } from "react-toastify";

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}
function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Collect Modal ─────────────────────────────────────────────────────────────
function CollectModal({ due, onClose, onPaid }) {
  const [payMode, setPayMode] = useState("cash");
  const [cashAmt, setCashAmt] = useState("");
  const [upiAmt,  setUpiAmt]  = useState("");
  const [saving,  setSaving]  = useState(false);

  const dueAmt    = due.amount || 0;
  const cashNum   = Number(cashAmt || 0);
  const upiNum    = Number(upiAmt  || 0);
  const totalPaid = payMode === "split" ? cashNum + upiNum : dueAmt;
  const balance   = Math.max(0, dueAmt - totalPaid);
  const overpaid  = totalPaid > dueAmt;
  const canConfirm = payMode !== "split" || totalPaid > 0;

  const handlePay = async () => {
    if (!canConfirm) return toast.error("Enter payment amount");
    setSaving(true);
    try {
      const paidCash = payMode === "cash"  ? dueAmt : payMode === "split" ? cashNum : 0;
      const paidUpi  = payMode === "upi"   ? dueAmt : payMode === "split" ? upiNum  : 0;
      await markDuePaid(due.key, {
        mode:        payMode === "split" ? "split" : payMode,
        amount:      dueAmt,
        cash_amount: paidCash,
        upi_amount:  paidUpi,
      });
      toast.success(`✅ ₹${dueAmt} collected from ${due.customer_name || "customer"}`);
      onPaid();
    } catch (e) {
      toast.error(e.message || "Payment failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal collect-modal" onClick={e => e.stopPropagation()}>
        <div className="collect-modal-header">
          <div className="collect-modal-icon">💳</div>
          <div>
            <h3 className="collect-modal-title">Collect Payment</h3>
            <p className="collect-modal-sub">
              {due.customer_name || "Guest"} · {due.pc_name || due.ps5_name || "General"}
            </p>
          </div>
        </div>

        <div className="collect-summary-box">
          {due.reason && (
            <div className="collect-summary-row">
              <span>Reason</span><span>{due.reason}</span>
            </div>
          )}
          {(due.pc_name || due.ps5_name) && (
            <div className="collect-summary-row">
              <span>Device</span>
              <span>{due.device_type === "ps5" ? "🎮" : "🖥"} {due.pc_name || due.ps5_name}</span>
            </div>
          )}
          <div className="collect-summary-row">
            <span>Created</span><span>{formatDate(due.created_at)}</span>
          </div>
          <div className="collect-summary-divider" />
          <div className="collect-summary-row collect-summary-total">
            <span>Amount Due</span>
            <strong className="collect-due-amount">₹{dueAmt}</strong>
          </div>
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Payment Mode</div>
          <div className="collect-mode-grid">
            {[["cash","💵","Cash"],["upi","📱","UPI"],["split","⚡","Split"]].map(([v, icon, lbl]) => (
              <button key={v} className={`collect-mode-btn ${payMode === v ? "active" : ""}`} onClick={() => setPayMode(v)}>
                <span className="collect-mode-icon">{icon}</span>
                <span className="collect-mode-label">{lbl}</span>
              </button>
            ))}
          </div>
        </div>

        {payMode === "split" && (
          <div className="modal-section">
            <div className="split-inputs-row">
              <div className="split-input-block">
                <label>💵 Cash</label>
                <input className="input-name" type="number" min="0" placeholder="₹0" value={cashAmt} onChange={e => setCashAmt(e.target.value)} autoFocus />
              </div>
              <div className="split-input-block">
                <label>📱 UPI</label>
                <input className="input-name" type="number" min="0" placeholder="₹0" value={upiAmt} onChange={e => setUpiAmt(e.target.value)} />
              </div>
            </div>
            <div className="split-status-row">
              <span>Total: <strong style={{color:"var(--green)"}}>₹{totalPaid}</strong></span>
              {balance > 0 && <span style={{color:"var(--red)"}}>Still due: ₹{balance}</span>}
              {overpaid && <span style={{color:"var(--yellow)"}}>⚠ Overpaid ₹{totalPaid - dueAmt}</span>}
            </div>
          </div>
        )}

        <div className="collect-modal-actions">
          <button className="btn btn-start" onClick={handlePay} disabled={saving || !canConfirm} style={{flex:1}}>
            {saving ? "Processing…" : `✅ Collect ₹${dueAmt}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Due Modal ─────────────────────────────────────────────────────────────
function AddDueModal({ pcs, onClose }) {
  const [form, setForm] = useState({ customer_name:"", pc_id:"", device_type:"pc", reason:"", amount:"" });
  const [saving, setSaving] = useState(false);
  const set = (k,v) => setForm(f => ({...f,[k]:v}));

  const handleAdd = async () => {
    if (!form.customer_name.trim()) return toast.error("Customer name required");
    const val = Number(form.amount);
    if (!val || val <= 0) return toast.error("Valid amount required");
    setSaving(true);
    try {
      const pc = pcs.find(p => p.id === Number(form.pc_id));
      await addPendingDue({
        customer_name: form.customer_name.trim(),
        pc_id: form.pc_id ? Number(form.pc_id) : null,
        device_type: form.device_type || "pc",
        pc_name: pc?.name || null,
        reason: form.reason.trim() || "Manual due",
        amount: val,
      });
      toast.success("Due added!");
      onClose();
    } catch (e) {
      toast.error(e.message || "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{maxWidth:420}}>
        <h3>➕ Add Manual Due</h3>
        <div className="modal-section">
          <label className="settings-label">Customer Name *</label>
          <input className="input-name" placeholder="Enter name" value={form.customer_name} onChange={e => set("customer_name", e.target.value)} autoFocus />
        </div>
        <div className="modal-section" style={{display:"flex",gap:10}}>
          <div style={{flex:1}}>
            <label className="settings-label">Device Type</label>
            <select className="hist-select" style={{width:"100%"}} value={form.device_type} onChange={e => set("device_type", e.target.value)}>
              <option value="pc">PC</option><option value="ps5">PS5</option><option value="other">Other</option>
            </select>
          </div>
          <div style={{flex:1}}>
            <label className="settings-label">Device (optional)</label>
            <select className="hist-select" style={{width:"100%"}} value={form.pc_id} onChange={e => set("pc_id", e.target.value)}>
              <option value="">None</option>
              {pcs.map(pc => <option key={pc.id} value={pc.id}>{pc.name}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-section">
          <label className="settings-label">Reason</label>
          <input className="input-name" placeholder="e.g. extra time, damage…" value={form.reason} onChange={e => set("reason", e.target.value)} />
        </div>
        <div className="modal-section">
          <label className="settings-label">Amount (₹) *</label>
          <input className="input-name" type="number" min="1" placeholder="₹0" value={form.amount} onChange={e => set("amount", e.target.value)} />
        </div>
        <div className="form-actions" style={{marginTop:16}}>
          <button className="btn btn-start" onClick={handleAdd} disabled={saving} style={{flex:1}}>{saving ? "Adding…" : "Add Due"}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Due Card ──────────────────────────────────────────────────────────────────
function DueCard({ due, onCollect }) {
  const isSession    = due.auto || due.session_ref;
  const sessionDue   = due.session_due !== undefined ? due.session_due : (due.amount || 0);
  const canteenDue   = due.canteen_due || 0;
  const showSplit    = isSession && canteenDue > 0;

  return (
    <div className={`due-card-v2 ${isSession ? "due-session" : "due-manual"}`}>
      <div className="due-strip" />
      <div className="due-content">
        <div className="due-top-row">
          <div className="due-name">👤 {due.customer_name || "Unknown"}</div>
          {isSession && <span className="due-badge-session">Session</span>}
        </div>
        <div className="due-meta-row">
          {(due.pc_name || due.ps5_name) && (
            <span className="due-meta-chip">{due.device_type === "ps5" ? "🎮" : "🖥"} {due.pc_name || due.ps5_name}</span>
          )}
          {due.reason && <span className="due-meta-chip due-reason-chip">📝 {due.reason}</span>}
          <span className="due-meta-chip due-time-chip">🕐 {timeAgo(due.created_at)}</span>
        </div>

        {/* ── Split breakdown: Session Due | Canteen Due ── */}
        {showSplit && (
          <div className="due-split-row">
            <div className="due-split-col">
              <span className="due-split-label">🖥 Session Due</span>
              <span className="due-split-value">₹{sessionDue}</span>
            </div>
            <div className="due-split-divider" />
            <div className="due-split-col">
              <span className="due-split-label">🍔 Canteen Due</span>
              <span className="due-split-value due-split-canteen">₹{canteenDue}</span>
            </div>
          </div>
        )}
      </div>
      <div className="due-right-v2">
        <div className="due-amount-v2">₹{due.amount || 0}</div>
        <button className="btn-collect-v2" onClick={() => onCollect(due)}>— Collect</button>
      </div>
    </div>
  );
}

// ── Customer Group Card ───────────────────────────────────────────────────────
function CustomerCard({ group, onCollect }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="customer-card-v2">
      <div className="customer-card-main" onClick={() => setExpanded(e => !e)}>
        <div className="customer-card-left">
          <div className="customer-avatar">{(group.customer_name || "?")[0].toUpperCase()}</div>
          <div>
            <div className="customer-card-name">{group.customer_name}</div>
            <div className="customer-card-sub">{group.dues.length} due{group.dues.length > 1 ? "s" : ""} · {timeAgo(group.latest)}</div>
          </div>
        </div>
        <div className="customer-card-right">
          <div className="customer-total">₹{group.total_due}</div>
          <button className="btn-collect-v2" onClick={e => { e.stopPropagation(); onCollect(group.dues[0]); }}>— Collect</button>
          <span className="customer-expand-icon">{expanded ? "▲" : "▼"}</span>
        </div>
      </div>
      {expanded && (
        <div className="customer-card-dues">
          {group.dues.map(due => {
            const sessionDue = due.session_due !== undefined ? due.session_due : (due.amount || 0);
            const canteenDue = due.canteen_due || 0;
            const showSplit  = (due.auto || due.session_ref) && canteenDue > 0;
            return (
              <div key={due.key} className="customer-due-row">
                <span className="cdr-device">{due.pc_name || due.ps5_name || "General"}</span>
                <span className="cdr-reason">{due.reason || "Due"}</span>
                <span className="cdr-time">{timeAgo(due.created_at)}</span>
                <span className="cdr-amount">
                  ₹{due.amount}
                  {showSplit && (
                    <span className="cdr-split-hint">
                      &nbsp;<span style={{color:"var(--text-muted)",fontSize:10}}>
                        (🖥₹{sessionDue} + 🍔₹{canteenDue})
                      </span>
                    </span>
                  )}
                </span>
                <button className="btn-mini-collect" onClick={() => onCollect(due)}>Collect</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function PendingDues({ dues = [], pcs = [] }) {
  const [view,      setView]      = useState("list");
  const [showAdd,   setShowAdd]   = useState(false);
  const [payingDue, setPayingDue] = useState(null);
  const [search,    setSearch]    = useState("");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");

  const filtered = useMemo(() => {
    let d = [...dues];
    if (search.trim()) {
      const q = search.toLowerCase();
      d = d.filter(x =>
        (x.customer_name || "").toLowerCase().includes(q) ||
        (x.pc_name || "").toLowerCase().includes(q) ||
        (x.reason  || "").toLowerCase().includes(q)
      );
    }
    if (dateFrom) { const f = new Date(dateFrom); f.setHours(0,0,0,0); d = d.filter(x => x.created_at >= f.getTime()); }
    if (dateTo)   { const t = new Date(dateTo);   t.setHours(23,59,59,999); d = d.filter(x => x.created_at <= t.getTime()); }
    return d;
  }, [dues, search, dateFrom, dateTo]);

  const groups = useMemo(() => {
    const map = {};
    dues.forEach(due => {
      const k = due.customer_name || "Unknown";
      if (!map[k]) map[k] = { customer_name: k, total_due: 0, dues: [], latest: 0 };
      map[k].total_due += due.amount || 0;
      map[k].dues.push(due);
      if (due.created_at > map[k].latest) map[k].latest = due.created_at;
    });
    return Object.values(map).sort((a, b) => b.total_due - a.total_due);
  }, [dues]);

  const grandTotal   = dues.reduce((s,d) => s + (d.amount||0), 0);
  const filteredTotal = filtered.reduce((s,d) => s + (d.amount||0), 0);
  const hasFilter    = !!(search || dateFrom || dateTo);
  const clearFilters = () => { setSearch(""); setDateFrom(""); setDateTo(""); };

  return (
    <div className="dues-page-v2">
      {payingDue && <CollectModal due={payingDue} onClose={() => setPayingDue(null)} onPaid={() => setPayingDue(null)} />}
      {showAdd   && <AddDueModal pcs={pcs} onClose={() => setShowAdd(false)} />}

      {/* Stats */}
      <div className="dues-stats-bar">
        <div className="dues-stat-card">
          <div className="dues-stat-value" style={{color:"var(--red)"}}>₹{grandTotal}</div>
          <div className="dues-stat-label">Total Pending</div>
        </div>
        <div className="dues-stat-card">
          <div className="dues-stat-value">{dues.length}</div>
          <div className="dues-stat-label">Entries</div>
        </div>
        <div className="dues-stat-card">
          <div className="dues-stat-value">{groups.length}</div>
          <div className="dues-stat-label">Customers</div>
        </div>
        {hasFilter && (
          <div className="dues-stat-card" style={{borderColor:"var(--accent)"}}>
            <div className="dues-stat-value" style={{color:"var(--accent)"}}>₹{filteredTotal}</div>
            <div className="dues-stat-label">Filtered</div>
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="dues-toolbar-v2">
        <div className="dues-search-wrap">
          <span className="dues-search-icon">🔍</span>
          <input className="dues-search-input" placeholder="Search customer, device, reason…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button className="dues-search-clear" onClick={() => setSearch("")}>✕</button>}
        </div>
        <div className="dues-date-range">
          <input type="date" className="input-name dues-date-input" value={dateFrom} max={dateTo || new Date().toISOString().slice(0,10)} onChange={e => setDateFrom(e.target.value)} title="From" />
          <span style={{color:"var(--text-muted)",fontSize:11}}>→</span>
          <input type="date" className="input-name dues-date-input" value={dateTo} min={dateFrom} max={new Date().toISOString().slice(0,10)} onChange={e => setDateTo(e.target.value)} title="To" />
          {(dateFrom||dateTo) && <button className="btn btn-secondary" style={{fontSize:11,padding:"4px 8px"}} onClick={()=>{setDateFrom("");setDateTo("");}}>✕</button>}
        </div>
        <button className="btn btn-start" onClick={() => setShowAdd(true)}>＋ Add Due</button>
      </div>

      {/* Tabs */}
      <div className="dues-tabs-v2">
        <button className={`dues-tab-v2 ${view==="list"?"active":""}`} onClick={() => setView("list")}>
          📋 All Dues <span className="dues-tab-count">{filtered.length}</span>
        </button>
        <button className={`dues-tab-v2 ${view==="customers"?"active":""}`} onClick={() => setView("customers")}>
          👥 By Customer <span className="dues-tab-count">{groups.length}</span>
        </button>
      </div>

      {hasFilter && filtered.length > 0 && (
        <div className="dues-filter-strip">
          {filtered.length} of {dues.length} · ₹{filteredTotal}
          <button className="dues-filter-clear" onClick={clearFilters}>Clear filters</button>
        </div>
      )}

      {view === "list" && (
        filtered.length === 0 ? (
          <div className="dues-empty-v2">
            <div className="dues-empty-icon">✅</div>
            <div className="dues-empty-title">{hasFilter ? "No dues match your filter" : "No pending dues!"}</div>
            <div className="dues-empty-sub">{hasFilter ? <button className="btn btn-secondary" onClick={clearFilters}>Clear filters</button> : "All payments collected 🎉"}</div>
          </div>
        ) : (
          <div className="dues-list-v2">
            {filtered.map(due => <DueCard key={due.key} due={due} onCollect={setPayingDue} />)}
          </div>
        )
      )}

      {view === "customers" && (
        groups.length === 0 ? (
          <div className="dues-empty-v2">
            <div className="dues-empty-icon">✅</div>
            <div className="dues-empty-title">No pending dues!</div>
          </div>
        ) : (
          <div className="dues-list-v2">
            {groups.map(grp => <CustomerCard key={grp.customer_name} group={grp} onCollect={setPayingDue} />)}
          </div>
        )
      )}
    </div>
  );
}