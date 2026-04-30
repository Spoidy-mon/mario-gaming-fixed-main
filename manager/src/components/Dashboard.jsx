import React, { useState, useEffect } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(s) {
  if (!s || s <= 0) return "00:00:00";
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
    .map(v=>String(v).padStart(2,"0")).join(":");
}

function buildUpiUrl(upiId, name, amount) {
  const s = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR`;
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(s)}`;
}

function getStatusCls(dev) {
  if (dev.status==="offline") return "status-offline";
  if (dev.status==="active" && dev.is_paused) return "status-paused";
  if (dev.status==="active" && dev.time_remaining<=300) return "status-low";
  if (dev.status==="active") return "status-active";
  return "status-online";
}

function PaymentStatusBadge({ status }) {
  if (!status) return null;
  const map = {
    pending: { label:"💳 Payment Pending", cls:"pay-badge-pending" },
    partial: { label:"⚠️ Partial Payment",  cls:"pay-badge-partial" },
    done:    { label:"✅ Payment Done",      cls:"pay-badge-done"    },
  };
  const info = map[status];
  if (!info) return null;
  return <span className={`pay-status-badge ${info.cls}`}>{info.label}</span>;
}

// ── Quick Start (Trial) Modal ──────────────────────────────────────────────────
const TRIAL_DURATION_MIN = 10; // fixed trial: 10–15 min, use 10 as default
const TRIAL_COST_INR    = 30;

function QuickStartModal({ dev, devType, onConfirm, onCancel }) {
  const [name, setName] = useState("");
  const label = devType === "ps5" ? `PS5 #${dev.slot}` : dev.name;
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:380}}>
        {/* Trial badge */}
        <div style={{
          background:"linear-gradient(135deg,#f59e0b,#ef4444)",
          borderRadius:"10px 10px 0 0",
          padding:"8px 16px",
          display:"flex", alignItems:"center", gap:8,
          marginTop:-1,
        }}>
          <span style={{fontSize:18}}>⚡</span>
          <span style={{fontWeight:700,color:"#fff",fontSize:14,letterSpacing:0.5}}>
            TRIAL SESSION
          </span>
          <span style={{
            background:"rgba(255,255,255,0.25)", borderRadius:6,
            padding:"2px 8px", fontSize:12, color:"#fff", marginLeft:"auto",
          }}>
            10–15 min · ₹{TRIAL_COST_INR}
          </span>
        </div>

        <div style={{padding:"16px 20px 20px"}}>
          <h3 style={{margin:"0 0 4px"}}>⚡ Quick Start (Trial) — {label}</h3>
          <p style={{fontSize:13,color:"var(--text-muted)",margin:"6px 0 14px"}}>
            Fixed trial: <strong>10–15 minutes</strong> at a flat rate of{" "}
            <strong style={{color:"var(--yellow)"}}>₹{TRIAL_COST_INR}</strong>.
            Session starts instantly — no extra steps needed.
          </p>

          {/* Fixed duration display (disabled / informational) */}
          <div style={{
            background:"var(--bg-card)",
            border:"1px solid var(--border)",
            borderRadius:8, padding:"10px 14px",
            marginBottom:14,
            display:"flex", alignItems:"center", gap:10,
          }}>
            <span style={{fontSize:20}}>⏱</span>
            <div>
              <div style={{fontSize:13,color:"var(--text-muted)"}}>Duration (fixed)</div>
              <div style={{fontWeight:700,fontSize:15}}>10–15 minutes · ₹{TRIAL_COST_INR}</div>
            </div>
            <span style={{
              marginLeft:"auto", background:"var(--yellow)", color:"#000",
              borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700,
            }}>TRIAL</span>
          </div>

          <input
            className="input-name player-name-big"
            placeholder="Player Name (optional)"
            value={name}
            onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&onConfirm(name.trim()||"Guest")}
            autoFocus
          />

          <div className="form-actions" style={{marginTop:14}}>
            <button
              className="btn btn-start"
              style={{flex:1, background:"linear-gradient(135deg,#f59e0b,#ef4444)"}}
              onClick={()=>onConfirm(name.trim()||"Guest")}
            >
              ⚡ Start Trial Now
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Full Start Modal (3 steps) ────────────────────────────────────────────────
function FullStartModal({ dev, devType, settings, onConfirm, onCancel }) {
  const pricing       = settings?.pricing || {30:15,60:30,90:45,120:60};
  const freeOpt1      = settings?.freeOption1 ?? 5;
  const freeOpt2      = settings?.freeOption2 ?? 10;
  const upiId         = settings?.cafeeUpiId  || "";
  const upiName       = settings?.cafeeUpiName || settings?.cafeeName || "Mario Gaming";
  const defaultShutdown = settings?.shutdownDelay || 30;
  const label = devType==="ps5" ? `PS5 #${dev.slot}` : dev.name;

  const DURATIONS = [
    {label:"30 min",value:30,price:pricing[30]||15},
    {label:"1 hr",  value:60,price:pricing[60]||30},
    {label:"1.5 hr",value:90,price:pricing[90]||45},
    {label:"2 hr",  value:120,price:pricing[120]||60},
  ];
  const FREE_OPTS = [
    {label:"No Free",value:0},
    {label:`🎁 ${freeOpt1}m Free`,value:freeOpt1},
    {label:`🎁 ${freeOpt2}m Free`,value:freeOpt2},
  ];

  const [step,      setStep]      = useState(1);
  const [name,      setName]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [address,   setAddress]   = useState("");
  const [duration,  setDuration]  = useState(60);
  const [freeMin,   setFreeMin]   = useState(0);
  const [payMode,   setPayMode]   = useState("cash"); // cash | upi | split | later
  const [cashAmt,   setCashAmt]   = useState("");
  const [upiAmt,    setUpiAmt]    = useState("");
  const [upiConf,   setUpiConf]   = useState(false);
  const [shutdown,  setShutdown]  = useState(defaultShutdown);

  const selOpt    = DURATIONS.find(d=>d.value===duration);
  const basePrice = selOpt?.price || 0;
  const cashNum   = Number(cashAmt||0);
  const upiNum    = Number(upiAmt||0);
  const totalPaid = payMode==="split" ? cashNum+upiNum : payMode==="cash" ? (cashAmt?cashNum:basePrice) : payMode==="upi" ? (upiAmt?upiNum:basePrice) : 0;
  const balDue    = Math.max(0, basePrice - totalPaid);

  const handleConfirm = () => {
    const payment = {
      mode:         payMode==="later" ? "pending" : payMode,
      amount:       payMode==="later" ? 0 : totalPaid,
      cash_amount:  payMode==="cash"  ? totalPaid : payMode==="split" ? cashNum : 0,
      upi_amount:   payMode==="upi"   ? totalPaid : payMode==="split" ? upiNum  : 0,
    };
    onConfirm({
      customer:{name:name.trim(),phone:phone.trim(),address:address.trim()},
      durationMinutes:duration, freeMinutes:freeMin,
      payment, shutdownDelay:shutdown,
    });
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{devType==="ps5"?"🎮":"🖥"} Start Session — {label}</h3>
          <div className="modal-steps">
            {["1 Player","2 Session","3 Payment"].map((s,i)=>(
              <React.Fragment key={s}>
                {i>0&&<span className="modal-step-arrow">→</span>}
                <span className={`modal-step ${step>i?"active":""}`}>{s}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Step 1 */}
        {step===1&&<div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">👤 Player Details</div>
            <input className="input-name player-name-big" placeholder="Full Name *"
              value={name} onChange={e=>setName(e.target.value)} autoFocus />
            <input className="input-name" placeholder="📞 Phone (optional)" type="tel"
              value={phone} onChange={e=>setPhone(e.target.value)} />
            <input className="input-name" placeholder="🏠 Address (optional)"
              value={address} onChange={e=>setAddress(e.target.value)} />
          </div>
          <div className="form-actions">
            <button className="btn btn-start" onClick={()=>setStep(2)} disabled={!name.trim()}>Next →</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>}

        {/* Step 2 */}
        {step===2&&<div className="modal-body">
          <div className="modal-section">
            <div className="modal-section-title">🎁 Free / Gift Time</div>
            <div className="free-time-grid">
              {FREE_OPTS.map(o=>(
                <button key={o.value} className={`btn btn-free-time ${freeMin===o.value?"selected":""}`}
                  onClick={()=>setFreeMin(o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">⏱ Duration</div>
            <div className="duration-grid">
              {DURATIONS.map(o=>(
                <button key={o.value} className={`btn btn-duration ${duration===o.value?"selected":""}`}
                  onClick={()=>setDuration(o.value)}>
                  <span>{o.label}</span><span className="duration-price">₹{o.price}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-start" onClick={()=>setStep(3)}>Next → Payment</button>
            <button className="btn btn-secondary" onClick={()=>setStep(1)}>← Back</button>
          </div>
        </div>}

        {/* Step 3 — Payment with split option */}
        {step===3&&<div className="modal-body">
          <div className="payment-summary">
            <div className="pay-sum-row"><span>Player</span><strong>{name}</strong></div>
            <div className="pay-sum-row"><span>Duration</span><strong>{duration}min{freeMin>0?` + ${freeMin}min free`:""}</strong></div>
            <div className="pay-sum-divider"/>
            <div className="pay-sum-row amount"><span>Amount Due</span><strong>₹{basePrice}</strong></div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">💳 Payment Mode</div>
            <div className="payment-mode-grid" style={{gridTemplateColumns:"repeat(4,1fr)"}}>
              {[["cash","💵","Cash"],["upi","📱","UPI"],["split","⚡","Split"],["later","⏳","Pay Later"]].map(([v,icon,lbl])=>(
                <button key={v} className={`btn btn-pay-mode ${payMode===v?"selected":""}`}
                  onClick={()=>{setPayMode(v);setUpiConf(false);}}>
                  <span className="pay-icon">{icon}</span><span>{lbl}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cash only */}
          {payMode==="cash"&&<div className="modal-section">
            <div className="custom-amount-row">
              <span className="modal-section-title" style={{marginBottom:0}}>Custom Amount</span>
              <input className="input-name amount-input" type="number" placeholder={`₹${basePrice}`}
                value={cashAmt} onChange={e=>setCashAmt(e.target.value)} />
            </div>
          </div>}

          {/* UPI */}
          {payMode==="upi"&&<div className="modal-section">
            {upiId&&<div className="upi-qr-card">
              <div className="upi-qr-wrap">
                <img src={buildUpiUrl(upiId,upiName,basePrice)} alt="UPI QR" className="upi-qr-img"
                  onError={e=>e.target.style.display="none"} />
              </div>
              <div className="upi-qr-info">
                <div className="upi-payto">Pay to: <strong>{upiName}</strong></div>
                <div className="upi-id">{upiId}</div>
                <div className="upi-amount">₹{basePrice}</div>
                <label className="upi-confirm-row">
                  <input type="checkbox" checked={upiConf} onChange={e=>setUpiConf(e.target.checked)}/>
                  <span>Payment received ✓</span>
                </label>
              </div>
            </div>}
            {!upiId&&<div className="upi-no-id">⚠️ Set UPI ID in Settings first</div>}
          </div>}

          {/* Split */}
          {payMode==="split"&&<div className="modal-section">
            <div className="modal-section-title">Split Amount (Cash + UPI)</div>
            <div className="split-row">
              <div className="split-field">
                <label className="settings-label">💵 Cash Amount</label>
                <input className="input-name" type="number" placeholder="₹0"
                  value={cashAmt} onChange={e=>setCashAmt(e.target.value)} />
              </div>
              <div className="split-field">
                <label className="settings-label">📱 UPI Amount</label>
                <input className="input-name" type="number" placeholder="₹0"
                  value={upiAmt} onChange={e=>setUpiAmt(e.target.value)} />
              </div>
            </div>
            <div className="split-summary">
              <span>Total Paid: <strong style={{color:"var(--green)"}}>₹{totalPaid}</strong></span>
              {balDue>0&&<span className="split-due">Balance Due: <strong style={{color:"var(--red)"}}>₹{balDue}</strong></span>}
              {balDue<=0&&totalPaid>0&&<span style={{color:"var(--green)",fontWeight:700}}>✅ Fully Paid</span>}
            </div>
          </div>}

          {payMode==="later"&&<div className="upi-no-id" style={{background:"var(--yellow-dim)",borderColor:"rgba(245,158,11,.3)",color:"var(--yellow)"}}>
            ⏳ Payment will be recorded as Pending Due automatically
          </div>}

          <div className="form-actions">
            <button className="btn btn-start" onClick={handleConfirm}
              disabled={payMode==="upi"&&upiId&&!upiConf}>
              ▶ Start · ₹{payMode==="later"?0:totalPaid}
            </button>
            <button className="btn btn-secondary" onClick={()=>setStep(2)}>← Back</button>
          </div>
        </div>}
      </div>
    </div>
  );
}

// ── Payment Modal (for existing sessions) ─────────────────────────────────────
function PaymentModal({ dev, devType, settings, onConfirm, onCancel }) {
  const upiId   = settings?.cafeeUpiId  || "";
  const upiName = settings?.cafeeUpiName || "Mario Gaming";
  const label   = devType==="ps5" ? `PS5 #${dev.slot}` : dev.name;

  const [payMode, setPayMode] = useState("cash");
  const [cashAmt, setCashAmt] = useState("");
  const [upiAmt,  setUpiAmt]  = useState("");
  const [charge,  setCharge]  = useState(String(Math.round((dev.payment_amount||0) - (dev.payment_cash||0) - (dev.payment_upi||0)) || 0));
  const [upiConf, setUpiConf] = useState(false);

  const cashNum   = Number(cashAmt||0);
  const upiNum    = Number(upiAmt||0);
  const chargeNum = Number(charge||0);
  const totalPaid = payMode==="split" ? cashNum+upiNum : chargeNum;
  const balDue    = Math.max(0, chargeNum - totalPaid);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <h3>💳 Process Payment — {label}</h3>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>
          Customer: <strong>{dev.customer_name||"Guest"}</strong>
        </p>

        <div className="modal-section">
          <div className="modal-section-title">Total Charge (₹)</div>
          <input className="input-name" type="number" value={charge}
            onChange={e=>setCharge(e.target.value)} placeholder="Enter total amount" />
        </div>

        <div className="modal-section">
          <div className="modal-section-title">Payment Mode</div>
          <div className="payment-mode-grid" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
            {[["cash","💵","Cash"],["upi","📱","UPI"],["split","⚡","Split"]].map(([v,icon,lbl])=>(
              <button key={v} className={`btn btn-pay-mode ${payMode===v?"selected":""}`}
                onClick={()=>{setPayMode(v);setUpiConf(false);}}>
                <span className="pay-icon">{icon}</span><span>{lbl}</span>
              </button>
            ))}
          </div>
        </div>

        {payMode==="upi"&&upiId&&<div className="upi-qr-card" style={{marginBottom:10}}>
          <div className="upi-qr-wrap">
            <img src={buildUpiUrl(upiId,upiName,chargeNum)} alt="QR" className="upi-qr-img"
              onError={e=>e.target.style.display="none"} />
          </div>
          <div className="upi-qr-info">
            <div className="upi-amount">₹{chargeNum}</div>
            <label className="upi-confirm-row">
              <input type="checkbox" checked={upiConf} onChange={e=>setUpiConf(e.target.checked)}/>
              <span>Received ✓</span>
            </label>
          </div>
        </div>}

        {payMode==="split"&&<div className="modal-section">
          <div className="split-row">
            <div className="split-field">
              <label className="settings-label">💵 Cash</label>
              <input className="input-name" type="number" placeholder="₹0"
                value={cashAmt} onChange={e=>setCashAmt(e.target.value)} />
            </div>
            <div className="split-field">
              <label className="settings-label">📱 UPI</label>
              <input className="input-name" type="number" placeholder="₹0"
                value={upiAmt} onChange={e=>setUpiAmt(e.target.value)} />
            </div>
          </div>
          <div className="split-summary">
            <span>Paid: <strong style={{color:"var(--green)"}}>₹{totalPaid}</strong></span>
            {balDue>0&&<span className="split-due">Still Due: <strong style={{color:"var(--red)"}}>₹{balDue}</strong></span>}
          </div>
        </div>}

        <div className="form-actions" style={{marginTop:14}}>
          <button className="btn btn-start" onClick={()=>onConfirm({
            cash_amount: payMode==="cash"?chargeNum:payMode==="split"?cashNum:0,
            upi_amount:  payMode==="upi" ?chargeNum:payMode==="split"?upiNum :0,
            total_charge:chargeNum,
          })} disabled={payMode==="upi"&&upiId&&!upiConf}>
            ✅ Confirm Payment
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Details Modal ────────────────────────────────────────────────────────
function EditDetailsModal({ dev, devType, onSave, onCancel }) {
  const [phone,   setPhone]   = useState(dev.customer_phone   || "");
  const [address, setAddress] = useState(dev.customer_address || "");
  const [charge,  setCharge]  = useState(String(dev.payment_amount || ""));
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <h3>✎ Edit Session Details</h3>
        <p style={{fontSize:13,color:"var(--text-muted)",marginBottom:12}}>{dev.customer_name||"Guest"}</p>
        <div className="modal-section">
          <input className="input-name" placeholder="📞 Phone"
            value={phone} onChange={e=>setPhone(e.target.value)} />
          <input className="input-name" placeholder="🏠 Address"
            value={address} onChange={e=>setAddress(e.target.value)} style={{marginTop:8}} />
          <div style={{marginTop:8}}>
            <label className="settings-label" style={{marginBottom:4,display:"block"}}>Total Charge (₹)</label>
            <input className="input-name" type="number" placeholder="Set total amount"
              value={charge} onChange={e=>setCharge(e.target.value)} />
          </div>
        </div>
        <div className="form-actions" style={{marginTop:14}}>
          <button className="btn btn-start" onClick={()=>onSave({
            customer_phone:phone, customer_address:address,
            total_charge:Number(charge||0)
          })}>Save</button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Session Card (works for both PC and PS5) ──────────────────────────────────
const ADDTIME_OPT  = [{label:"+15m",value:15},{label:"+30m",value:30},{label:"+1h",value:60}];
const REDUCE_OPT   = [{label:"-10m",value:10},{label:"-30m",value:30},{label:"-1h",value:60}];

function SessionCard({ dev, devType, settings, onStart, onQuickStart, onAddTime, onReduceTime,
  onPause, onEnd, onToggleOnline, onShutdown, onPayment, onEditDetails }) {
  const [modal,      setModal]      = useState(null);
  const [localTime,  setLocalTime]  = useState(dev.time_remaining);
  const [confirmShut,setConfirmShut]= useState(false);
  const localTimeRef = React.useRef(dev.time_remaining);

  const statusCls = getStatusCls(dev);
  const isPS5     = devType === "ps5";
  const devId     = isPS5 ? dev.slot : dev.id;
  const label     = isPS5 ? `PS5 #${dev.slot}` : dev.name;
  const icon      = isPS5 ? "🎮" : "🖥";
  const color     = isPS5 ? "ps5-card" : "";

  // Sync from Firebase ONLY when the difference is more than 3s
  // (i.e. an external add/reduce, not our own countdown drift)
  useEffect(() => {
    const diff = Math.abs(localTimeRef.current - dev.time_remaining);
    if (diff > 3) {
      localTimeRef.current = dev.time_remaining;
      setLocalTime(dev.time_remaining);
    }
  }, [dev.time_remaining]);

  // Countdown — only restarts when status/paused changes, NOT on time_remaining
  useEffect(() => {
    if (dev.status !== "active" || dev.is_paused) return;
    const iv = setInterval(() => {
      localTimeRef.current = Math.max(0, localTimeRef.current - 1);
      setLocalTime(localTimeRef.current);
    }, 1000);
    return () => clearInterval(iv);
  }, [dev.status, dev.is_paused]); // eslint-disable-line

  const isLow  = dev.status==="active" && localTime<=300 && !dev.is_paused;
  const payPending = dev.payment_status === "pending" || dev.payment_status === "partial";

  return (
    <>
      {modal==="quick" && <QuickStartModal dev={dev} devType={devType}
        onConfirm={name=>{onQuickStart(devId,name,TRIAL_DURATION_MIN);setModal(null);}}
        onCancel={()=>setModal(null)} />}
      {modal==="full" && <FullStartModal dev={dev} devType={devType} settings={settings}
        onConfirm={d=>{onStart(devId,d);setModal(null);}}
        onCancel={()=>setModal(null)} />}
      {modal==="pay" && <PaymentModal dev={dev} devType={devType} settings={settings}
        onConfirm={d=>{onPayment(devType,devId,d);setModal(null);}}
        onCancel={()=>setModal(null)} />}
      {modal==="edit" && <EditDetailsModal dev={dev} devType={devType}
        onSave={d=>{onEditDetails(devType,devId,d);setModal(null);}}
        onCancel={()=>setModal(null)} />}

      <div className={`pc-card ${statusCls} ${isLow?"pc-card-pulse":""} ${color} ${payPending&&dev.status!=="active"?"card-pay-pending":""}`}>
        <div className="pc-card-header">
          <div className="pc-name-row">
            <span className="pc-icon">{icon}</span>
            <h3 className="pc-name">{label}</h3>
            <span className={`status-badge ${statusCls}`}>
              {dev.status==="offline"?"Offline":dev.status==="active"&&dev.is_paused?"Paused":
               dev.status==="active"&&localTime<=300?"Low Time":dev.status==="active"?"Active":"Online"}
            </span>
          </div>
          <div className="pc-header-actions">
            {(dev.status==="offline"||dev.status==="online")&&(
              <button className={`online-toggle ${dev.status==="offline"?"btn-bring-online":"btn-take-offline"}`}
                onClick={()=>onToggleOnline(devType,devId,dev.status)}>
                {dev.status==="offline"?"Online":"Offline"}
              </button>
            )}
            {dev.status!=="offline"&&(
              confirmShut ? (
                <div className="shutdown-confirm-row">
                  <span className="shutdown-confirm-text">Shutdown?</span>
                  <button className="btn btn-shutdown-confirm"
                    onClick={()=>{onShutdown(devType,devId);setConfirmShut(false);}}>Yes</button>
                  <button className="btn btn-secondary" style={{padding:"3px 8px",fontSize:11}}
                    onClick={()=>setConfirmShut(false)}>No</button>
                </div>
              ):(
                <button className="btn btn-shutdown" onClick={()=>setConfirmShut(true)}>⏻</button>
              )
            )}
          </div>
        </div>

        {/* Timer */}
        <div className={`pc-timer ${isLow?"timer-warning":""}`}>
          {dev.status==="active" ? (
            <>
              <div className="timer-digits">{formatTime(localTime)}</div>
              {dev.free_seconds>0&&localTime<=dev.free_seconds&&<div className="free-time-tag">🎁 Free</div>}
              {dev.customer_name&&<div className="customer-info-row">
                <span className="customer-name">👤 {dev.customer_name}</span>
                {dev.customer_phone&&<span className="customer-phone">📞 {dev.customer_phone}</span>}
              </div>}
              {dev.payment_amount>0&&<div className="payment-tag">
                {dev.payment_mode==="cash"?"💵":dev.payment_mode==="upi"?"📱":dev.payment_mode==="split"?"⚡":"💳"} ₹{dev.payment_amount}
                {(dev.payment_amount-(dev.payment_cash||0)-(dev.payment_upi||0))>0.5&&<span style={{color:"var(--red)",marginLeft:4}}>·due ₹{Math.round(dev.payment_amount-(dev.payment_cash||0)-(dev.payment_upi||0))}</span>}
              </div>}
            </>
          ) : dev.status==="online" ? (
            <div className="timer-idle">Ready</div>
          ) : (
            <div className="timer-idle">—</div>
          )}
        </div>

        {/* Payment status for ended/idle sessions */}
        {dev.status==="online"&&payPending&&dev.customer_name&&(
          <div style={{marginBottom:8}}>
            <PaymentStatusBadge status={dev.payment_status} />
            {(dev.payment_amount-(dev.payment_cash||0)-(dev.payment_upi||0))>0.5&&<span style={{fontSize:12,color:"var(--red)",marginLeft:6}}>₹{Math.round(dev.payment_amount-(dev.payment_cash||0)-(dev.payment_upi||0))} pending</span>}
          </div>
        )}

        {/* Progress */}
        {dev.status==="active"&&(
          <div className="progress-track">
            <div className={`progress-fill ${isLow?"progress-low":""}`}
              style={{width:`${Math.min(100,(localTime/(dev.session_duration||3600))*100)}%`}} />
          </div>
        )}

        {/* Controls */}
        <div className="pc-controls">
          {dev.status==="online"&&(
            <div className="start-btn-row">
              <button className="btn btn-start" style={{flex:1, background:"linear-gradient(135deg,#f59e0b,#ef4444)"}} onClick={()=>setModal("quick")}>⚡ Quick Start (Trial)</button>
              <button className="btn btn-secondary" style={{flex:1}} onClick={()=>setModal("full")}>📋 Full Start</button>
            </div>
          )}

          {dev.status==="active"&&(
            <>
              <div className="add-time-row">
                {ADDTIME_OPT.map(o=><button key={o.value} className="btn btn-addtime"
                  onClick={()=>onAddTime(devType,devId,o.value)}>{o.label}</button>)}
              </div>
              <div className="reduce-time-row">
                <span className="reduce-time-label">Reduce:</span>
                {REDUCE_OPT.map(o=><button key={o.value} className="btn btn-reducetime"
                  onClick={()=>onReduceTime(devType,devId,o.value)}>{o.label}</button>)}
              </div>
              <div className="session-actions">
                <button className="btn btn-secondary btn-sm" onClick={()=>setModal("edit")}>✎ Details</button>
                <button className={`btn ${dev.is_paused?"btn-resume":"btn-pause"}`}
                  onClick={()=>onPause(devType,devId,dev.is_paused)}>
                  {dev.is_paused?"▶ Resume":"⏸ Pause"}
                </button>
                <button className="btn btn-end" onClick={()=>onEnd(devType,devId)}>⏹ End</button>
              </div>
              {payPending&&<button className="btn btn-pay-now" onClick={()=>setModal("pay")}>💳 Pay Now</button>}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ pcs, ps5Sessions, payments, settings,
  onStart, onQuickStart, onAddTime, onReduceTime, onPause, onEnd,
  onToggleOnline, onShutdown, onPayment, onEditDetails }) {

  const [view, setView] = useState("all"); // all | pcs | ps5

  const pcsArr  = pcs      || [];
  const ps5Arr  = ps5Sessions || [];

  const activePC  = pcsArr.filter(p=>p.status==="active").length;
  const activePS5 = ps5Arr.filter(p=>p.status==="active").length;
  const totalActive = activePC + activePS5;

  const todayTs    = new Date().setHours(0,0,0,0);
  const todayPay   = (payments||[]).filter(p=>p.paid_at>=todayTs);
  const todayTotal = todayPay.reduce((s,p)=>s+(p.amount||0),0);
  const cashTotal  = todayPay.filter(p=>p.mode==="cash"||p.mode==="split").reduce((s,p)=>s+(p.cash_amount||0),0);
  const upiTotal   = todayPay.filter(p=>p.mode==="upi"||p.mode==="split").reduce((s,p)=>s+(p.upi_amount||0),0);

  const handleStart      = (devId, data, devType="pc") => onStart(devType, devId, data.customer, data.payment, data.freeMinutes, data.shutdownDelay, data.durationMinutes);
  const handleQuickStart = (devType, devId, name)      => onQuickStart(devType, devId, name);
  const handleToggle     = (devType, devId, status)    => onToggleOnline(devType, devId, status);
  const handleShutdown   = (devType, devId)             => onShutdown(devType, devId);

  return (
    <div className="dashboard">
      {/* Stats */}
      <div className="stats-bar">
        <div className="stat-item stat-active"><span className="stat-num">{totalActive}</span><span className="stat-label">Active</span></div>
        <div className="stat-item" style={{borderColor:"rgba(139,92,246,.4)"}}><span className="stat-num" style={{color:"#8b5cf6"}}>{activePS5}</span><span className="stat-label">PS5 Active</span></div>
        <div className="stat-item stat-online"><span className="stat-num">{pcsArr.filter(p=>p.status==="online").length}</span><span className="stat-label">PC Idle</span></div>
        <div className="stat-item"><span className="stat-num">{todayPay.length}</span><span className="stat-label">Users Today</span></div>
        <div className="stat-item stat-revenue"><span className="stat-num">₹{todayTotal}</span><span className="stat-label">Revenue</span></div>
        <div className="stat-item"><span className="stat-num" style={{fontSize:14}}>💵 ₹{cashTotal}</span><span className="stat-label">Cash</span></div>
        <div className="stat-item"><span className="stat-num" style={{fontSize:14}}>📱 ₹{upiTotal}</span><span className="stat-label">UPI</span></div>
      </div>

      {/* View tabs */}
      <div className="dashboard-view-tabs">
        {[["all","All Devices"],["pcs","🖥 PCs Only"],["ps5","🎮 PS5 Only"]].map(([v,l])=>(
          <button key={v} className={`dash-view-tab ${view===v?"active":""}`} onClick={()=>setView(v)}>{l}</button>
        ))}
      </div>

      {/* PC Grid */}
      {(view==="all"||view==="pcs")&&(
        <div className="session-board-wrap session-board-pc">
          <div className="session-board-label">
            <span>🖥 PC Sessions</span>
            <span className="board-active-count">{pcsArr.filter(p=>p.status==="active").length} active</span>
          </div>
          <div className="pc-grid pc-grid-compact">
            {pcsArr.map(pc=>(
              <SessionCard key={`pc-${pc.id}`} dev={pc} devType="pc" settings={settings}
                onStart={(id,d)=>onStart("pc",id,d.customer,d.payment,d.freeMinutes,d.shutdownDelay,d.durationMinutes)}
                onQuickStart={(id,name)=>onQuickStart("pc",id,name)}
                onAddTime={onAddTime} onReduceTime={onReduceTime}
                onPause={onPause} onEnd={onEnd}
                onToggleOnline={handleToggle} onShutdown={handleShutdown}
                onPayment={onPayment} onEditDetails={onEditDetails} />
            ))}
          </div>
        </div>
      )}

      {/* PS5 Grid */}
      {(view==="all"||view==="ps5")&&ps5Arr.length>0&&(
        <div className="session-board-wrap session-board-ps5">
          <div className="session-board-label">
            <span>🎮 PS5 Sessions</span>
            <span className="board-active-count" style={{background:"rgba(139,92,246,.2)",color:"rgba(139,92,246,1)"}}>
              {ps5Arr.filter(p=>p.status==="active").length} active
            </span>
          </div>
          <div className="pc-grid pc-grid-compact">
            {ps5Arr.map(s=>(
              <SessionCard key={`ps5-${s.slot}`} dev={s} devType="ps5" settings={settings}
                onStart={(id,d)=>onStart("ps5",id,d.customer,d.payment,d.freeMinutes,null,d.durationMinutes)}
                onQuickStart={(id,name)=>onQuickStart("ps5",id,name)}
                onAddTime={onAddTime} onReduceTime={onReduceTime}
                onPause={onPause} onEnd={onEnd}
                onToggleOnline={handleToggle} onShutdown={handleShutdown}
                onPayment={onPayment} onEditDetails={onEditDetails} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}