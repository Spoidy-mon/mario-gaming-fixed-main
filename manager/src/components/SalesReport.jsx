import React, { useState, useMemo, useEffect } from "react";
import { ref, onValue } from "firebase/database";
import { db } from "../firebase";
import { toast } from "react-toastify";
import { isUnlocked, tryUnlock, lockAdmin } from "../utils/auth";
import { transferToBank, withdrawCash, returnToCounter, setLedgerBalance, deleteEntry,
  setCafeShareStatus, setCafeShareAmount, listenCafeShare, recordMonthlySnapshot, listenMonthlyReports, getMonthKey } from "../firebaseService";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt  = ts => !ts ? "—" : new Date(ts).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const fmtM = n  => `₹${Number(n||0).toFixed(0)}`;
const fmtShort = ts => !ts ? "—" : new Date(ts).toLocaleString("en-IN",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});

// ─── Password Gate ────────────────────────────────────────────────────────────
function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [err,setErr]= useState(false);
  const go = async () => {
    const ok = await tryUnlock(pw);
    if (ok) onUnlock();
    else { setErr(true); setPw(""); setTimeout(()=>setErr(false),2000); }
  };
  return (
    <div className="sales-lock-screen">
      <div className="sales-lock-box">
        <div className="sales-lock-icon">🔐</div>
        <h2 className="sales-lock-title">Admin Access Required</h2>
        <p className="sales-lock-sub">Enter the admin password to view sales reports.</p>
        <input className={`input-name sales-lock-input ${err?"input-error":""}`}
          type="password" placeholder="Password"
          value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}}
          onKeyDown={e=>e.key==="Enter"&&go()} autoFocus />
        {err&&<div className="sales-lock-error">❌ Wrong password</div>}
        <button className="btn btn-start" style={{marginTop:12,width:"100%"}} onClick={go}>
          🔓 Unlock
        </button>
      </div>
    </div>
  );
}

// ─── Transfer Modal (reusable) ────────────────────────────────────────────────
function TransferModal({ title, fromLabel, fromColor, fromAmt, toLabel, toColor, toAmt, onClose, onConfirm, confirmLabel, danger }) {
  const [amt, setAmt] = useState("");
  const [who, setWho] = useState("");
  const [rsn, setRsn] = useState("");
  const [busy,setBusy]= useState(false);
  const n = Number(amt||0), over = n > fromAmt;

  const go = async () => {
    if (!amt||!who) return toast.error("Amount and name required");
    if (n<=0)       return toast.error("Enter a valid amount");
    if (over)       return toast.error(`Only ${fmtM(fromAmt)} available`);
    setBusy(true);
    try { await onConfirm(n, who, rsn); onClose(); }
    catch(e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sr-modal" onClick={e=>e.stopPropagation()}>
        <h3 className="sr-modal-title">{title}</h3>

        {/* Balance preview */}
        <div className="sr-transfer-preview">
          <div className="sr-balance-chip">
            <span className="sr-balance-chip-label">{fromLabel}</span>
            <span className="sr-balance-chip-value" style={{color:fromColor}}>{fmtM(fromAmt)}</span>
          </div>
          <div className="sr-transfer-arrow">→</div>
          <div className="sr-balance-chip">
            <span className="sr-balance-chip-label">{toLabel}</span>
            <span className="sr-balance-chip-value" style={{color:toColor}}>{fmtM(toAmt)}</span>
          </div>
        </div>

        <div className="modal-section">
          <label className="settings-label">Amount (₹) *</label>
          <input className={`input-name ${over?"input-error":""}`} type="number" placeholder="0"
            value={amt} onChange={e=>setAmt(e.target.value)} autoFocus />
          {over&&<p className="sr-field-error">⚠ Exceeds available {fromLabel.toLowerCase()}</p>}
        </div>
        <div className="modal-section">
          <label className="settings-label">By *</label>
          <input className="input-name" placeholder="Staff name" value={who} onChange={e=>setWho(e.target.value)} />
        </div>
        <div className="modal-section">
          <label className="settings-label">Reason</label>
          <input className="input-name" placeholder="Optional note" value={rsn}
            onChange={e=>setRsn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
        </div>

        {/* Live math preview */}
        {n>0&&!over&&(
          <div className="sr-math-preview">
            <div className="sr-math-row"><span>{fromLabel}</span><span>{fmtM(fromAmt)}</span></div>
            <div className="sr-math-row red"><span>Transfer</span><span>− {fmtM(n)}</span></div>
            <div className="sr-math-divider"/>
            <div className="sr-math-row bold"><span>{fromLabel} after</span><span style={{color:fromColor}}>{fmtM(fromAmt-n)}</span></div>
            {toAmt!==undefined&&<div className="sr-math-row bold"><span>{toLabel} after</span><span style={{color:toColor}}>{fmtM(toAmt+n)}</span></div>}
          </div>
        )}

        <div className="form-actions" style={{marginTop:16}}>
          <button className={`btn ${danger?"btn-end":"btn-start"}`} onClick={go}
            disabled={busy||over||!amt||!who} style={{flex:1}}>
            {busy?"Processing…":confirmLabel}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ManualBalanceModal({ cash, bank, onClose }) {
  const [nc, setNc] = useState(String(cash));
  const [nb, setNb] = useState(String(bank));
  const [busy,setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await setLedgerBalance(Number(nc||0), Number(nb||0)); toast.success("✅ Balances updated"); onClose(); }
    catch(e) { toast.error(e.message); }
    setBusy(false);
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sr-modal" onClick={e=>e.stopPropagation()}>
        <h3 className="sr-modal-title">⚙️ Set Opening Balances</h3>
        <p style={{fontSize:12,color:"var(--text-muted)",marginBottom:16}}>Correct balances or set an opening amount.</p>
        <div className="modal-section">
          <label className="settings-label">💵 Counter Cash (₹)</label>
          <input className="input-name" type="number" value={nc} onChange={e=>setNc(e.target.value)} autoFocus />
        </div>
        <div className="modal-section">
          <label className="settings-label">🏦 Bank Balance (₹)</label>
          <input className="input-name" type="number" value={nb} onChange={e=>setNb(e.target.value)} />
        </div>
        <div className="form-actions" style={{marginTop:16}}>
          <button className="btn btn-start" onClick={go} disabled={busy} style={{flex:1}}>{busy?"Saving…":"✅ Set Balances"}</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Log Panel ──────────────────────────────────────────────────────────
function AuditLogPanel({ logs=[], inPeriod }) {
  const filtered = logs.filter(l=>inPeriod(l.withdrawn_at||l.transferred_at||0));
  const TYPE = {
    bank_transfer:     {icon:"🏦",label:"→ Bank",       color:"var(--blue)"},
    return_to_counter: {icon:"↩", label:"↩ Return",     color:"var(--green)"},
    cash_withdrawal:   {icon:"💸",label:"Cash W/D",     color:"var(--red)"},
    manual_adjustment: {icon:"⚙️",label:"Manual Adjust",color:"var(--yellow)"},
  };
  return (
    <div className="sr-audit-panel">
      <div className="sr-audit-header">
        <span>🔍 Audit Log</span>
        <span className="sr-audit-count">{filtered.length} entries</span>
      </div>
      {filtered.length===0&&<div className="sr-audit-empty">No records in this period</div>}
      {filtered.slice(0,100).map((l,i)=>{
        const t=TYPE[l.action]||{icon:"📝",label:l.action||"Event",color:"var(--text-muted)"};
        const isIn=l.action==="return_to_counter";
        return (
          <div key={l.key||i} className="sr-audit-row">
            <div className="sr-audit-left">
              <span className="sr-audit-icon">{t.icon}</span>
              <div>
                <span className="sr-audit-type" style={{color:t.color}}>{t.label}</span>
                {l.who&&<span className="sr-audit-who"> · {l.who}</span>}
                {l.reason&&<div className="sr-audit-reason">{l.reason}</div>}
              </div>
            </div>
            <div className="sr-audit-right">
              <span style={{fontWeight:800,color:isIn?"var(--green)":"var(--red)"}}>
                {isIn?"+":"−"}{fmtM(l.amount)}
              </span>
              <span className="sr-audit-time">{fmtShort(l.withdrawn_at||l.transferred_at)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Balance Card ─────────────────────────────────────────────────────────────
function BalanceCard({ icon, label, value, color, sub, actions }) {
  return (
    <div className="sr-balance-card">
      <div className="sr-bc-header">
        <div className="sr-bc-icon">{icon}</div>
        <div className="sr-bc-meta">
          <div className="sr-bc-label">{label}</div>
          <div className="sr-bc-value" style={{color}}>{value}</div>
          {sub&&<div className="sr-bc-sub">{sub}</div>}
        </div>
      </div>
      {actions&&<div className="sr-bc-actions">{actions}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function Stat({ label, value, sub, color="var(--accent)", icon }) {
  return (
    <div className="sr-stat">
      {icon&&<div className="sr-stat-icon">{icon}</div>}
      <div className="sr-stat-value" style={{color}}>{value}</div>
      <div className="sr-stat-label">{label}</div>
      {sub&&<div className="sr-stat-sub">{sub}</div>}
    </div>
  );
}

// ─── Transaction Row ──────────────────────────────────────────────────────────
function TxRow({ item, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [confirm,  setConfirm]  = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try { await onDelete(item._type, item.key); }
    catch(e) { toast.error(e.message); setDeleting(false); }
  };
  const isW      = item._type==="withdrawal";
  const isBank   = item.type==="bank_transfer";
  const isReturn = item.type==="return_to_counter";
  const isCanteen= item._type==="canteen";
  const isGaming = item._type==="gaming";

  const typeChip = isGaming  ? <span className="sr-chip sr-chip-gaming">🖥 Gaming</span>
    : isCanteen              ? <span className="sr-chip sr-chip-canteen">🛒 Canteen</span>
    : isBank                 ? <span className="sr-chip sr-chip-bank">🏦 Bank</span>
    : isReturn               ? <span className="sr-chip sr-chip-return">↩ Return</span>
    :                          <span className="sr-chip sr-chip-wd">💸 W/D</span>;

  const splitDetail = item.mode==="split"
    ? ` 💵₹${item.cash_amount??item.cash??0}+📱₹${item.upi_amount??item.upi??0}`
    : "";
  const modeChip = isGaming
    ? item.mode==="cash"  ? <span className="sr-mode-chip cash">💵 Cash</span>
    : item.mode==="upi"   ? <span className="sr-mode-chip upi">📱 UPI</span>
    : item.mode==="split" ? <span className="sr-mode-chip split">⚡ Split{splitDetail}</span>
    : null
    : isCanteen
    ? item.payment_mode==="upi" ? <span className="sr-mode-chip upi">📱 UPI</span>
    : <span className="sr-mode-chip cash">💵 Cash</span>
    : isW ? <span className="sr-mode-chip">{item.who||"—"}</span>
    : null;

  const amt = item.amount||item.total||0;
  const negative = isW&&!isReturn;

  return (
    <div className={`sr-tx-row ${isW?"sr-tx-wd":""}`}>
      <div className="sr-tx-time">{fmtShort(item._ts)}</div>
      <div className="sr-tx-type">{typeChip}</div>
      <div className="sr-tx-desc">
        {isGaming  && <span className="sr-tx-name">{item.customer_name||"Guest"}</span>}
        {isCanteen && <span className="sr-tx-name">{item.item_name}{item.quantity>1?` ×${item.quantity}`:""}</span>}
        {isW       && <span className="sr-tx-name">{item.reason||"—"}</span>}
      </div>
      <div className="sr-tx-device">
        {item.pc_name
          ? <span className="sr-chip sr-chip-device">{item.pc_name}</span>
          : <span className="sr-tx-dash">—</span>}
      </div>
      <div className="sr-tx-mode">{modeChip||<span className="sr-tx-dash">—</span>}</div>
      <div className={`sr-tx-amount ${negative?"negative":"positive"}`}>
        {negative?"− ":""}{fmtM(amt)}
      </div>
      <div className="sr-tx-delete">
        {!confirm
          ? <button className="btn-tx-delete" title="Delete entry" onClick={()=>setConfirm(true)}>🗑</button>
          : <>
              <button className="btn-tx-delete-confirm" disabled={deleting} onClick={handleDelete}>
                {deleting?"…":"✓ Delete"}
              </button>
              <button className="btn-tx-delete-cancel" onClick={()=>setConfirm(false)}>✕</button>
            </>
        }
      </div>
    </div>
  );
}

// ─── Mario Cafe + Partner Distribution System ────────────────────────────────────────
const FIXED_PARTNERS = ["Vikrant", "Aman", "Vikas"];

// ─── Mario Cafe Card ──────────────────────────────────────────────────────────────
function MarioCafeCard({ totalAssets, cash, bank, cafeStatus, onMarkCleared, onMarkPending }) {
  const cleared    = cafeStatus?.status === "cleared";
  const pending    = cafeStatus?.status === "pending";
  const shareEach  = Math.round(totalAssets / 3);
  const daysInMonth= new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate();
  const today      = new Date().getDate();
  const daysPct    = Math.round((today / daysInMonth) * 100);

  return (
    <div className={`mario-cafe-card ${cleared?"cafe-cleared":pending?"cafe-pending":""}`}>
      <div className="cafe-card-header">
        <div className="cafe-card-title">
          <span style={{fontSize:28}}>🎮</span>
          <div>
            <div className="cafe-card-name">Mario Gaming Café</div>
            <div className="cafe-card-sub">All revenue flows here — split equally at month end</div>
          </div>
        </div>
        <div style={{display:"flex",gap:6}}>
          {pending && <span className="cafe-pending-badge">⏳ PENDING</span>}
          {cleared && <span className="cafe-cleared-badge">✅ CLEARED</span>}
        </div>
      </div>

      <div className="cafe-card-amounts">
        <div className="cafe-amt-block">
          <div className="cafe-amt-label">Total Assets</div>
          <div className="cafe-amt-value cafe-amt-main">{fmtM(totalAssets)}</div>
        </div>
        <div className="cafe-amt-divider" style={{color:"rgba(255,255,255,.3)"}}>≡</div>
        <div className="cafe-amt-block">
          <div className="cafe-amt-label">💵 Counter</div>
          <div className="cafe-amt-value" style={{color:"#10b981"}}>{fmtM(cash)}</div>
        </div>
        <div className="cafe-amt-divider">+</div>
        <div className="cafe-amt-block">
          <div className="cafe-amt-label">🏦 Bank</div>
          <div className="cafe-amt-value" style={{color:"#3b82f6"}}>{fmtM(bank)}</div>
        </div>
      </div>

      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,.3)",marginBottom:4}}>
          <span>Month progress</span><span>Day {today}/{daysInMonth}</span>
        </div>
        <div style={{height:4,background:"rgba(255,255,255,.08)",borderRadius:4,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${daysPct}%`,background:"rgba(99,102,241,.55)",borderRadius:4}} />
        </div>
      </div>

      <div style={{background:"rgba(16,185,129,.07)",border:"1px solid rgba(16,185,129,.18)",borderRadius:10,padding:"10px 14px",marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:11,color:"#6ee7b7",marginBottom:2}}>MONTH-END SPLIT ÷3 PARTNERS</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)"}}>Vikrant · Aman · Vikas</div>
        </div>
        <div style={{fontSize:22,fontWeight:900,color:"#10b981"}}>{fmtM(shareEach)} each</div>
      </div>

      {!cleared && (
        <div className="cafe-card-actions">
          <button className="btn btn-cafe-clear" onClick={onMarkCleared}>✅ Clear & Split This Month</button>
          {!pending && <button className="btn btn-cafe-later" onClick={onMarkPending}>⏳ Mark Pending</button>}
        </div>
      )}
      {cleared && <div style={{textAlign:"center",fontSize:12,color:"#10b981",marginTop:4}}>✅ Month cleared — partners can withdraw their share</div>}
    </div>
  );
}

// ─── Partner Card ─────────────────────────────────────────────────────────────────────────────
function PartnerCard({ name, idx, shareEach, partnerWith, onWithdraw }) {
  const withdrawn = partnerWith[idx] || 0;
  const left      = shareEach - withdrawn;   // negative = over-withdrawn
  const isOver    = left < 0;
  const pct       = shareEach > 0 ? Math.min(100, (withdrawn / shareEach) * 100) : 0;
  const colors    = ["#818cf8","#10b981","#f59e0b"];
  const color     = colors[idx % 3];

  return (
    <div className="partner-card-v2" style={{borderTopColor: isOver?"#ef4444":color}}>
      <div className="partner-card-v2-header">
        <div className="partner-card-v2-name" style={{color: isOver?"#f87171":color}}>{name}</div>
        {isOver && <span style={{fontSize:10,color:"#ef4444",fontWeight:700,background:"rgba(239,68,68,.15)",padding:"2px 6px",borderRadius:4}}>⚠ OVER</span>}
      </div>
      <div className="partner-card-v2-share">
        <span className="partner-card-v2-label">Equal Share</span>
        <span className="partner-card-v2-value" style={{color}}>{fmtM(shareEach)}</span>
      </div>
      <div className="partner-card-v2-stats">
        <div className="partner-stat-block">
          <div className="partner-stat-label">Withdrawn</div>
          <div className="partner-stat-val" style={{color:"#f87171"}}>{fmtM(withdrawn)}</div>
        </div>
        <div className="partner-stat-divider" />
        <div className="partner-stat-block">
          <div className="partner-stat-label">{isOver ? "Excess" : "Left"}</div>
          <div className="partner-stat-val" style={{
            color: isOver ? "#ef4444" : left > 0 ? "#6ee7b7" : "#9ca3af",
            fontWeight: isOver ? 800 : 600,
          }}>
            {isOver ? `− ${fmtM(Math.abs(left))}` : fmtM(left)}
          </div>
        </div>
      </div>
      {isOver && (
        <div style={{
          marginTop:8,fontSize:11,color:"#fca5a5",
          background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.25)",
          borderRadius:6,padding:"5px 8px",textAlign:"center",
        }}>
          Withdrew {fmtM(Math.abs(left))} beyond share — to be adjusted next month
        </div>
      )}
      <div className="partner-bar-track" style={{marginTop:10,marginBottom:12}}>
        <div className="partner-bar-fill" style={{width:`${Math.min(100,pct)}%`,background:pct>100?"#ef4444":pct>75?"#f59e0b":color}} />
      </div>
      <button className="btn btn-partner-withdraw" style={{borderColor:`${color}55`,color}} onClick={onWithdraw}>
        💸 Withdraw
      </button>
    </div>
  );
}

// ─── Partner Section ───────────────────────────────────────────────────────────────────
function PartnerSection({ totalAssets, partnerWith, onWithdraw }) {
  const shareEach = Math.round(totalAssets / 3);
  const totalWithdrawn = FIXED_PARTNERS.reduce((s,_,i) => s + (partnerWith[i]||0), 0);
  const totalLeft      = Math.max(0, totalAssets - totalWithdrawn);

  return (
    <div className="partner-section">
      <div className="partner-section-title">
        🤝 Partner Shares  ·  {fmtM(totalAssets)} ÷3 = <strong style={{color:"#10b981"}}>{fmtM(shareEach)} each</strong>
        <span style={{marginLeft:12,fontSize:11,color:"rgba(255,255,255,.3)"}}>Total left: {fmtM(totalLeft)}</span>
      </div>
      <div className="partner-cards-grid">
        {FIXED_PARTNERS.map((name, i) => (
          <PartnerCard key={name} name={name} idx={i} shareEach={shareEach} partnerWith={partnerWith} onWithdraw={()=>onWithdraw(i,name,shareEach)} />
        ))}
      </div>
    </div>
  );
}

// ─── Monthly Report Panel ──────────────────────────────────────────────────────────────────
function MonthlyReportPanel({ reports }) {
  const [open, setOpen] = useState(false);
  if (!open) return (
    <button className="btn btn-monthly-report" onClick={()=>setOpen(true)}>📅 Monthly Reports</button>
  );
  return (
    <div className="monthly-report-panel">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <h4 style={{margin:0}}>📅 Monthly Reports</h4>
        <button className="btn btn-secondary" style={{padding:"4px 10px",fontSize:12}} onClick={()=>setOpen(false)}>✕ Close</button>
      </div>
      {reports.length === 0 && <div style={{color:"var(--text-muted)",fontSize:13,textAlign:"center",padding:20}}>No monthly reports yet.</div>}
      {reports.map(r => {
        const share = Math.round((r.total_assets||0)/3);
        const [y,m] = r.key.split("-");
        const label = new Date(Number(y),Number(m)-1).toLocaleString("en-IN",{month:"long",year:"numeric"});
        return (
          <div key={r.key} className="monthly-report-card">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div className="monthly-report-title">{label}</div>
              <span style={{fontSize:11,padding:"3px 8px",borderRadius:20,background:r.cafe_status==="cleared"?"rgba(16,185,129,.15)":"rgba(245,158,11,.15)",color:r.cafe_status==="cleared"?"#6ee7b7":"#fbbf24"}}>
                {r.cafe_status==="cleared"?"✅ Cleared":"⏳ Pending"}
              </span>
            </div>
            <div className="monthly-report-row"><span>Total Assets</span><strong>{fmtM(r.total_assets||0)}</strong></div>
            <div className="monthly-report-row"><span>Per Partner (÷3)</span><strong style={{color:"#10b981"}}>{fmtM(share)}</strong></div>
            {FIXED_PARTNERS.map((name,i)=>(
              <div key={name} className="monthly-report-row" style={{fontSize:12}}>
                <span>{name} withdrew</span><span style={{color:"#f87171"}}>{fmtM(r.partner_withdrawals?.[i]||0)}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ─── Withdraw Partner Modal ───────────────────────────────────────────────────
function WithdrawPartnerModal({ cash, bank, shareEach, partnerIdx, partnerName, onClose, onConfirm }) {
  const [source,  setSource]  = useState("cash"); // cash | bank
  const [amt,     setAmt]     = useState("");
  const [rsn,     setRsn]     = useState("");
  const [busy,    setBusy]    = useState(false);
  const n      = Number(amt||0);
  const avail  = source === "cash" ? cash : bank;
  const over   = n > avail;

  const go = async () => {
    if (!amt || n <= 0) return toast.error("Enter a valid amount");
    if (over)           return toast.error(`Only ${fmtM(avail)} available in ${source}`);
    setBusy(true);
    try { await onConfirm(n, source, rsn); onClose(); }
    catch(e) { toast.error(e.message); }
    setBusy(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal sr-modal" onClick={e=>e.stopPropagation()}>
        <h3 className="sr-modal-title">💸 {partnerName}'s Withdrawal</h3>

        <div style={{background:"rgba(16,185,129,.07)",border:"1px solid rgba(16,185,129,.2)",borderRadius:8,padding:"8px 14px",marginBottom:12,display:"flex",justifyContent:"space-between"}}>
          <span style={{fontSize:12,color:"#6ee7b7"}}>Equal share</span>
          <strong style={{color:"#10b981"}}>{fmtM(shareEach)}</strong>
        </div>

        {/* Source */}
        <div className="modal-section">
          <label className="settings-label">Withdraw From</label>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <button className={`btn ${source==="cash"?"btn-start":"btn-secondary"}`} style={{flex:1}} onClick={()=>setSource("cash")}>
              💵 Counter Cash &nbsp;<span style={{opacity:.6}}>{fmtM(cash)}</span>
            </button>
            <button className={`btn ${source==="bank"?"btn-start":"btn-secondary"}`} style={{flex:1}} onClick={()=>setSource("bank")}>
              🏦 Bank &nbsp;<span style={{opacity:.6}}>{fmtM(bank)}</span>
            </button>
          </div>
        </div>

        <div className="modal-section">
          <label className="settings-label">Amount (₹) *</label>
          <input className={`input-name ${over?"input-error":""}`} type="number" placeholder="0"
            value={amt} onChange={e=>setAmt(e.target.value)} autoFocus />
          {over && <p className="sr-field-error">⚠ Only {fmtM(avail)} available in {source}</p>}
        </div>

        <div className="modal-section">
          <label className="settings-label">Reason (optional)</label>
          <input className="input-name" placeholder="e.g. Monthly share withdrawal" value={rsn}
            onChange={e=>setRsn(e.target.value)} onKeyDown={e=>e.key==="Enter"&&go()} />
        </div>

        <div className="form-actions" style={{marginTop:16}}>
          <button className="btn btn-start" style={{background:"rgba(239,68,68,.2)",borderColor:"rgba(239,68,68,.4)",color:"#fca5a5",flex:1}}
            onClick={go} disabled={busy||!amt}>
            {busy?"…":`💸 Withdraw ${fmtM(n)} from ${source}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SalesReport({ payments=[], sales=[], withdrawals=[] }) {
  const [unlocked,   setUnlocked]   = useState(()=>isUnlocked());
  const [period,     setPeriod]     = useState("today");
  const [tab,        setTab]        = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo,   setCustomTo]   = useState("");
  const [modal,      setModal]      = useState(null);
  const [showAudit,  setShowAudit]  = useState(false);
  const [ledger,     setLedger]     = useState({cash_balance:0,bank_balance:0});
  const [auditLog,   setAuditLog]   = useState([]);
  const [partnerWith,   setPartnerWith]   = useState({});
  const [partners,      setPartners]      = useState(["Rajeev","Kunal","Vikrant"]);
  const [cafeSharePct,  setCafeSharePct]  = useState(30);
  const [cafeStatus,    setCafeStatus]    = useState({});
  const [monthlyReports,setMonthlyReports]= useState([]);

  const monthKey = getMonthKey();

  useEffect(()=>{
    if (!unlocked) return;
    const u1=onValue(ref(db,"cash_ledger"),snap=>setLedger(snap.val()||{cash_balance:0,bank_balance:0}));
    const u2=onValue(ref(db,"audit_log"),snap=>{
      const d=snap.val();
      if(!d) return setAuditLog([]);
      setAuditLog(Object.entries(d).map(([k,v])=>({...v,key:k}))
        .sort((a,b)=>(b.withdrawn_at||b.transferred_at||0)-(a.withdrawn_at||a.transferred_at||0)));
    });
    const u3=onValue(ref(db,"partner_withdrawals"),snap=>setPartnerWith(snap.val()||{}));
    const u4=onValue(ref(db,"settings/partners"),snap=>{ if(snap.val()) setPartners(snap.val().filter(Boolean)); });
    const u5=onValue(ref(db,"settings/cafeSharePct"),snap=>{ if(snap.val()!=null) setCafeSharePct(Number(snap.val())||30); });
    const u6=onValue(ref(db,`cafe_share/${monthKey}`),snap=>setCafeStatus(snap.val()||{}));
    const u7=onValue(ref(db,"monthly_reports"),snap=>{
      const d=snap.val()||{};
      setMonthlyReports(Object.entries(d).map(([k,v])=>({key:k,...v})).sort((a,b)=>b.key.localeCompare(a.key)));
    });
    return()=>{u1();u2();u3();u4();u5();u6();u7();};
  },[unlocked]);

  // Period filter
  const inPeriod = (ts) => {
    if (!ts) return false;
    if (customFrom||customTo) {
      const f = customFrom ? (() => { const d=new Date(customFrom); d.setHours(0,0,0,0); return d.getTime(); })() : 0;
      const t = customTo   ? (() => { const d=new Date(customTo);   d.setHours(23,59,59,999); return d.getTime(); })() : Date.now();
      return ts>=f && ts<=t;
    }
    const now=Date.now();
    if (period==="today") { const d=new Date(); d.setHours(0,0,0,0); return ts>=d.getTime(); }
    if (period==="week")  return now-ts<=7*86400000;
    if (period==="month") return now-ts<=30*86400000;
    return true;
  };

  // Memos (all before any conditional return)
  const gamingPayments    = useMemo(()=>payments.filter(p=>inPeriod(p.paid_at)),            [payments,period,customFrom,customTo]);   // eslint-disable-line
  const canteenSales      = useMemo(()=>sales.filter(s=>inPeriod(s.sold_at)&&!s.returned), [sales,period,customFrom,customTo]);      // eslint-disable-line
  const periodWithdrawals = useMemo(()=>withdrawals.filter(w=>inPeriod(w.withdrawn_at)),    [withdrawals,period,customFrom,customTo]);// eslint-disable-line

  const combinedFeed = useMemo(()=>[
    ...gamingPayments.map(p=>({...p,_type:"gaming",    _ts:p.paid_at})),
    ...canteenSales.map(s=>  ({...s,_type:"canteen",   _ts:s.sold_at})),
    ...periodWithdrawals.map(w=>({...w,_type:"withdrawal",_ts:w.withdrawn_at})),
  ].sort((a,b)=>b._ts-a._ts), [gamingPayments,canteenSales,periodWithdrawals]);

  // Revenue math
  const gamingTotal  = gamingPayments.reduce((s,p)=>s+(p.amount||0),0);
  // BUG FIX: payments may store split amounts as cash_amount/upi_amount OR cash/upi
  const gamingCash   = gamingPayments.reduce((s,p)=>{
    const c = p.cash_amount ?? p.cash ?? (p.mode==="cash" ? p.amount : p.mode==="split" ? 0 : 0);
    return s + (Number(c)||0);
  }, 0);
  const gamingUpi    = gamingPayments.reduce((s,p)=>{
    const u = p.upi_amount ?? p.upi ?? (p.mode==="upi" ? p.amount : p.mode==="split" ? 0 : 0);
    return s + (Number(u)||0);
  }, 0);
  const canteenTotal = canteenSales.reduce((s,x)=>s+(x.total||0),0);
  const canteenCash  = canteenSales.reduce((s,x)=>x.payment_mode==="upi"?s:s+(x.total||0),0);
  const canteenUpi   = canteenSales.reduce((s,x)=>x.payment_mode==="upi"?s+(x.total||0):s,0);
  const cashRevenue  = gamingCash + canteenCash;
  const upiRevenue   = gamingUpi  + canteenUpi;
  const bankTransferred   = periodWithdrawals.filter(w=>w.type==="bank_transfer").reduce((s,w)=>s+(w.amount||0),0);
  const totalWithdrawn    = periodWithdrawals.filter(w=>w.type==="cash_withdrawal").reduce((s,w)=>s+(w.amount||0),0);
  const returnedToCounter = periodWithdrawals.filter(w=>w.type==="return_to_counter").reduce((s,w)=>s+(w.amount||0),0);
  const grossTotal = gamingTotal + canteenTotal;
  const netBalance = grossTotal - totalWithdrawn - bankTransferred;

  const displayFeed =
    tab==="gaming"     ? gamingPayments.map(p=>({...p,_type:"gaming",    _ts:p.paid_at})) :
    tab==="canteen"    ? canteenSales.map(s=>  ({...s,_type:"canteen",   _ts:s.sold_at})) :
    tab==="withdrawal" ? periodWithdrawals.map(w=>({...w,_type:"withdrawal",_ts:w.withdrawn_at})) :
    combinedFeed;

  // Canteen breakdown by item
  const canteenByItem = useMemo(()=>{
    const map={};
    canteenSales.forEach(s=>{
      if(!map[s.item_name]) map[s.item_name]={name:s.item_name,qty:0,total:0};
      map[s.item_name].qty   += s.quantity||1;
      map[s.item_name].total += s.total||0;
    });
    return Object.values(map).sort((a,b)=>b.total-a.total);
  },[canteenSales]);

  if (!unlocked) return <PasswordGate onUnlock={()=>setUnlocked(true)} />;

  const cash  = ledger.cash_balance  || 0;
  const bank  = ledger.bank_balance  || 0;
  const total = cash + bank;
  const todayStr = new Date().toISOString().slice(0,10);
  const handleLock = () => { lockAdmin(); setUnlocked(false); };

  return (
    <div className="sr-page">
      {/* ── Modals ── */}
      {modal==="bank"&&(
        <TransferModal title="💵 Counter → Bank" fromLabel="Counter Cash" fromColor="var(--green)" fromAmt={cash}
          toLabel="Bank" toColor="var(--blue)" toAmt={bank} confirmLabel="🏦 Transfer"
          onClose={()=>setModal(null)}
          onConfirm={async(n,w,r)=>{ await transferToBank(n,w,r); toast.success(`✅ ${fmtM(n)} sent to bank`); }} />
      )}
      {modal==="return"&&(
        <TransferModal title="🏦 Bank → Counter" fromLabel="Bank" fromColor="var(--blue)" fromAmt={bank}
          toLabel="Counter Cash" toColor="var(--green)" toAmt={cash} confirmLabel="↩ Return to Counter"
          onClose={()=>setModal(null)}
          onConfirm={async(n,w,r)=>{ await returnToCounter(n,w,r); toast.success(`✅ ${fmtM(n)} back to counter`); }} />
      )}
      {modal&&modal.type==="withdraw"&&(
        <WithdrawPartnerModal
          cash={cash} bank={bank}
          shareEach={Math.round(total/3)}
          partnerIdx={modal.idx}
          partnerName={modal.name}
          onClose={()=>setModal(null)}
          onConfirm={async(n,source,r)=>{
            await withdrawCash(n, modal.name, r||"Partner withdrawal", modal.idx);
            const {ref:fbRef,get:fbGet,update:fbUpdate} = await import("firebase/database");
            const snap = await fbGet(fbRef(db,`partner_withdrawals/${modal.idx}`));
            const prev = snap.val()||0;
            await fbUpdate(fbRef(db,"partner_withdrawals"),{[modal.idx]:prev+n});
            toast.success(`💵 ${fmtM(n)} withdrawn by ${modal.name}`);
          }} />
      )}
      {modal==="manual"&&<ManualBalanceModal cash={cash} bank={bank} onClose={()=>setModal(null)} />}

      {/* ── Admin bar ── */}
      <div className="sr-admin-bar">
        <div className="sr-admin-left">
          <span className="sr-admin-badge">🔓 Admin</span>
          <span className="sr-admin-updated">
            {ledger.last_updated ? `Updated ${fmtShort(ledger.last_updated)}` : ""}
          </span>
        </div>
        <div className="sr-admin-actions">
          <button className="sr-admin-btn" onClick={()=>setShowAudit(v=>!v)}>
            {showAudit?"✕ Audit":"🔍 Audit"}
          </button>
          <button className="sr-admin-btn" onClick={()=>setModal("manual")}>⚙️ Set Bal</button>
          <button className="sr-admin-btn sr-admin-btn-lock" onClick={handleLock}>🔒 Lock</button>
        </div>
      </div>

      {/* ── Balance cards ── */}
      <div className="sr-balance-row">
        <BalanceCard icon="💵" label="Counter Cash" value={fmtM(cash)} color="var(--green)"
          sub="Physical cash at counter"
          actions={
            <div className="sr-bc-btn-row">
              <button className="btn btn-start sr-bc-btn" onClick={()=>setModal("bank")}>🏦 → Bank</button>
            </div>
          }
        />
        <BalanceCard icon="🏦" label="Bank Balance" value={fmtM(bank)} color="var(--blue)"
          sub="UPI & bank deposits"
          actions={
            <button className="btn btn-secondary sr-bc-btn" style={{width:"100%"}} onClick={()=>setModal("return")}>
              ↩ Return to Counter
            </button>
          }
        />
        <BalanceCard icon="💰" label="Total Assets" value={fmtM(total)} color="var(--accent)"
          sub="Counter + Bank"
          actions={
            <div className="sr-total-meta">
              {bankTransferred>0&&<div className="sr-total-meta-row"><span>🏦 Transferred</span><span>{fmtM(bankTransferred)}</span></div>}
              {totalWithdrawn >0&&<div className="sr-total-meta-row"><span>💸 Withdrawn</span> <span>{fmtM(totalWithdrawn)}</span></div>}
              {returnedToCounter>0&&<div className="sr-total-meta-row"><span>↩ Returned</span><span>{fmtM(returnedToCounter)}</span></div>}
            </div>
          }
        />
      </div>

      {/* ── Audit log ── */}
      {showAudit&&<AuditLogPanel logs={auditLog} inPeriod={inPeriod} />}

      {/* ── Mario Cafe Card ── */}
      <MarioCafeCard
        totalAssets={total}
        cash={cash}
        bank={bank}
        cafeStatus={cafeStatus}
        onMarkCleared={async()=>{
          await setCafeShareStatus(monthKey, "cleared");
          await recordMonthlySnapshot(monthKey, {
            total_assets: total, cafe_status: "cleared",
            partner_withdrawals: partnerWith,
          });
          toast.success("✅ Month cleared — partners can now withdraw!");
        }}
        onMarkPending={async()=>{
          await setCafeShareStatus(monthKey, "pending");
          toast.info("⏳ Marked as pending");
        }}
      />

      {/* ── Partner Shares ── */}
      <PartnerSection
        totalAssets={total}
        partnerWith={partnerWith}
        onWithdraw={(idx,name,shareEach)=>setModal({type:"withdraw",idx,name,shareEach})}
      />

      <MonthlyReportPanel reports={monthlyReports} />

      {/* ── Period filter ── */}
      <div className="sr-filter-bar">
        <div className="sr-period-pills">
          {[["today","Today"],["week","Week"],["month","Month"],["all","All Time"]].map(([v,l])=>(
            <button key={v}
              className={`sr-pill ${period===v&&!customFrom&&!customTo?"active":""}`}
              onClick={()=>{setPeriod(v);setCustomFrom("");setCustomTo("");}}>
              {l}
            </button>
          ))}
        </div>
        <div className="sr-date-range">
          <input type="date" className="input-name sr-date-input"
            value={customFrom} max={customTo||todayStr}
            onChange={e=>setCustomFrom(e.target.value)}
            title="From date" />
          <span className="sr-date-sep">→</span>
          <input type="date" className="input-name sr-date-input"
            value={customTo} min={customFrom} max={todayStr}
            onChange={e=>setCustomTo(e.target.value)}
            title="To date" />
          {(customFrom||customTo)&&(
            <button className="btn btn-secondary" style={{fontSize:11,padding:"4px 8px"}}
              onClick={()=>{setCustomFrom("");setCustomTo("");}}>✕</button>
          )}
        </div>
      </div>

      {/* ── Stats grid ── */}
      <div className="sr-stats-grid">
        <Stat icon="💰" label="Gross Revenue"  value={fmtM(grossTotal)}     color="var(--accent)"  />
        <Stat icon="🖥" label="Gaming"         value={fmtM(gamingTotal)}    color="var(--blue)"    sub={`${gamingPayments.length} sessions`} />
        <Stat icon="🛒" label="Canteen"        value={fmtM(canteenTotal)}   color="var(--yellow)"  sub={`${canteenSales.length} items`} />
        <Stat icon="💵" label="Cash Received"  value={fmtM(cashRevenue)}    color="var(--green)"   />
        <Stat icon="📱" label="UPI Received"   value={fmtM(upiRevenue)}     color="var(--blue)"    />
        <Stat icon="🏦" label="→ Bank"         value={fmtM(bankTransferred)} color="var(--blue)"   sub="transferred" />
        <Stat icon="💸" label="Withdrawn"      value={fmtM(totalWithdrawn)} color="var(--red)"     />
        <Stat icon="📊" label="Net (Period)"   value={fmtM(netBalance)}     color={netBalance>=0?"var(--green)":"var(--red)"} />
      </div>

      {/* ── Revenue bar ── */}
      {grossTotal>0&&(
        <div className="sr-rev-bar-wrap">
          <div className="sr-rev-bar">
            <div className="sr-rev-seg gaming"   style={{width:`${(gamingTotal/grossTotal*100).toFixed(1)}%`}}    title={`Gaming ${fmtM(gamingTotal)}`}/>
            <div className="sr-rev-seg canteen"  style={{width:`${(canteenTotal/grossTotal*100).toFixed(1)}%`}}   title={`Canteen ${fmtM(canteenTotal)}`}/>
          </div>
          <div className="sr-rev-legend">
            <span className="sr-leg gaming">🖥 Gaming {fmtM(gamingTotal)} ({grossTotal>0?(gamingTotal/grossTotal*100).toFixed(0):0}%)</span>
            <span className="sr-leg canteen">🛒 Canteen {fmtM(canteenTotal)} ({grossTotal>0?(canteenTotal/grossTotal*100).toFixed(0):0}%)</span>
            <span className="sr-leg cash">💵 Cash {fmtM(cashRevenue)}</span>
            <span className="sr-leg upi">📱 UPI {fmtM(upiRevenue)}</span>
            {bankTransferred>0&&<span className="sr-leg bank">🏦 Banked {fmtM(bankTransferred)}</span>}
            {totalWithdrawn >0&&<span className="sr-leg wd">💸 W/D {fmtM(totalWithdrawn)}</span>}
          </div>
        </div>
      )}

      {/* ── Canteen breakdown (when canteen tab or combined) ── */}
      {canteenByItem.length>0&&(tab==="all"||tab==="canteen")&&(
        <div className="sr-canteen-breakdown">
          <div className="sr-section-title">🛒 Canteen Breakdown</div>
          <div className="sr-canteen-grid">
            {canteenByItem.map(item=>(
              <div key={item.name} className="sr-canteen-item">
                <div className="sr-ci-name">{item.name}</div>
                <div className="sr-ci-meta">
                  <span className="sr-ci-qty">×{item.qty}</span>
                  <span className="sr-ci-total">{fmtM(item.total)}</span>
                </div>
                <div className="sr-ci-bar">
                  <div className="sr-ci-bar-fill" style={{width:`${Math.min(100,(item.total/canteenTotal*100))}%`}}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Transaction tabs ── */}
      <div className="sr-tabs">
        {[["all","All"],["gaming","🖥 Gaming"],["canteen","🛒 Canteen"],["withdrawal","💸 Moves"]].map(([v,l])=>(
          <button key={v} className={`sr-tab ${tab===v?"active":""}`} onClick={()=>setTab(v)}>
            {l}
            <span className="sr-tab-count">
              {v==="all"?combinedFeed.length:v==="gaming"?gamingPayments.length:v==="canteen"?canteenSales.length:periodWithdrawals.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Transaction list ── */}
      <div className="sr-tx-list">
        {/* Header */}
        <div className="sr-tx-header">
          <div className="sr-tx-time">Time</div>
          <div className="sr-tx-type">Type</div>
          <div className="sr-tx-desc">Description</div>
          <div className="sr-tx-device">Device</div>
          <div className="sr-tx-mode">Mode / By</div>
          <div className="sr-tx-amount">Amount</div>
        </div>

        {displayFeed.length===0 ? (
          <div className="sr-tx-empty">
            <div style={{fontSize:36,marginBottom:8}}>📭</div>
            No transactions in this period
          </div>
        ) : (
          displayFeed.slice(0,300).map((item,i)=><TxRow key={item.key||i} item={item} onDelete={deleteEntry} />)
        )}
      </div>
    </div>
  );
}