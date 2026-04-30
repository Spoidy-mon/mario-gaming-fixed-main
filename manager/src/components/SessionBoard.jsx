import React, { useState, useEffect } from "react";

function formatTime(s) {
  if (!s || s <= 0) return "00:00:00";
  return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
    .map(v => String(v).padStart(2,"0")).join(":");
}

function payBadge(status) {
  if (status === "paid")    return <span className="pay-badge pay-done">✅ Paid</span>;
  if (status === "partial") return <span className="pay-badge pay-partial">⚡ Partial</span>;
  if (status === "pending") return <span className="pay-badge pay-pending">⏳ Pending</span>;
  return null;
}

function statusInfo(session, type) {
  const icon = type === "ps5" ? "🎮" : "🖥";
  if (session.status === "offline") return { label:"Offline", cls:"status-offline", icon };
  if (session.status === "active" && session.is_paused) return { label:"Paused", cls:"status-paused", icon };
  if (session.status === "active" && session.time_remaining <= 300 && session.time_remaining > 0)
    return { label:"Low Time", cls:"status-low", icon };
  if (session.status === "active") return { label:"Running", cls:"status-active", icon };
  return { label:"Online", cls:"status-online", icon };
}

const ADD_OPTS    = [{l:"+15m",v:15},{l:"+30m",v:30},{l:"+1h",v:60},{l:"+1.5h",v:90}];
const REDUCE_OPTS = [{l:"-5m",v:5},{l:"-15m",v:15},{l:"-30m",v:30}];

// ── Start Session Modal ────────────────────────────────────────────────────────
// Single-step: pick duration + player name → one Start button → session begins.
function StartSessionModal({ session, type, settings, onStart, onCancel }) {
  const pricing = settings?.pricing || {30:15,60:30,90:45,120:60};
  const DURATIONS = [
    {label:"30 min", value:30,  price:pricing[30]||15},
    {label:"1 hr",   value:60,  price:pricing[60]||30},
    {label:"1.5 hr", value:90,  price:pricing[90]||45},
    {label:"2 hr",   value:120, price:pricing[120]||60},
  ];

  const [dur,        setDur]        = useState(60);
  const [name,       setName]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedPrice = DURATIONS.find(d => d.value === dur)?.price || 0;

  const handleStart = async () => {
    if (submitting) return;
    setSubmitting(true);
    try { await onStart(name.trim(), dur); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{type==="ps5"?"🎮":"🖥"} Start Session — {session.name}</h3>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body" style={{padding:"16px 20px 20px"}}>
          {/* Duration picker */}
          <div className="modal-section">
            <div className="modal-section-title">⏱ Session Duration</div>
            <div className="duration-grid">
              {DURATIONS.map(o => (
                <button key={o.value}
                  className={`btn btn-duration ${dur===o.value?"selected":""}`}
                  onClick={()=>setDur(o.value)}>
                  <span>{o.label}</span>
                  <span className="duration-price">₹{o.price}</span>
                </button>
              ))}
            </div>
            <div style={{
              marginTop:10, padding:"8px 12px",
              background:"var(--bg-card)", border:"1px solid var(--border)",
              borderRadius:8, display:"flex", alignItems:"center", justifyContent:"space-between",
            }}>
              <span style={{fontSize:13,color:"var(--text-muted)"}}>Session charge</span>
              <span style={{fontWeight:700,fontSize:16,color:"var(--yellow)"}}>₹{selectedPrice}</span>
            </div>
          </div>

          {/* Player name */}
          <div className="modal-section">
            <div className="modal-section-title">👤 Player Name (optional)</div>
            <input
              className="input-name player-name-big"
              placeholder="Player Name"
              value={name}
              autoFocus
              onChange={e=>setName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&handleStart()}
            />
          </div>

          <div className="form-actions" style={{marginTop:14}}>
            <button
              className="btn btn-start"
              style={{flex:2, opacity: submitting ? 0.6 : 1}}
              disabled={submitting}
              onClick={handleStart}
            >
              {submitting ? "Starting..." : "▶ Start Session"}
            </button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Edit Details Modal ────────────────────────────────────────────────────────
// Only shows customer info, payment tracking, and shutdown delay.
// Duration/timing is intentionally excluded — use Add/Reduce Time buttons instead.
function EditDetailsModal({ session, type, settings, onSave, onCancel }) {
  const [phone, setPhone] = useState(session.customer_phone||"");
  const [addr,  setAddr]  = useState(session.customer_address||"");
  const [games, setGames] = useState(session.games_played||"");
  const [cash,  setCash]  = useState(session.payment_cash > 0 ? String(session.payment_cash) : "");
  const [upi,   setUpi]   = useState(session.payment_upi  > 0 ? String(session.payment_upi)  : "");
  const [shutD, setShutD] = useState(settings?.shutdownDelay||30);

  // Total due is fixed at session start — edit modal only tracks payment against it
  const totalDue  = session.payment_amount || 0;
  const cashN     = Number(cash||0);
  const upiN      = Number(upi||0);
  const totalPaid = cashN + upiN;
  const remaining = Math.max(0, totalDue - totalPaid);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-lg" onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3>{type==="ps5"?"🎮":"🖥"} Edit Details — {session.name}
            {session.customer_name ? ` · ${session.customer_name}` : ""}
          </h3>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="modal-body">
          {/* Customer Info */}
          <div className="modal-section">
            <div className="modal-section-title">👤 Customer Info</div>
            <div className="detail-fields-grid">
              <input className="input-name" placeholder="📞 Phone" value={phone}
                onChange={e=>setPhone(e.target.value)} type="tel"/>
              <input className="input-name" placeholder="🏠 Address" value={addr}
                onChange={e=>setAddr(e.target.value)}/>
            </div>
            <input className="input-name" placeholder="🎯 Games Played" value={games}
              onChange={e=>setGames(e.target.value)} style={{marginTop:8}}/>
          </div>

          {/* Payment */}
          <div className="modal-section">
            <div className="modal-section-title">
              💳 Payment
              {totalDue > 0 && (
                <span className="total-due-badge">Total Due: ₹{totalDue}</span>
              )}
            </div>
            <div className="split-pay-grid">
              <div className="split-pay-field">
                <label className="settings-label">💵 Cash Paid</label>
                <input className="input-name" type="number" min="0" placeholder="₹0"
                  value={cash} onChange={e=>setCash(e.target.value)}/>
              </div>
              <div className="split-pay-field">
                <label className="settings-label">📱 UPI Paid</label>
                <input className="input-name" type="number" min="0" placeholder="₹0"
                  value={upi} onChange={e=>setUpi(e.target.value)}/>
              </div>
            </div>
            <div className="split-pay-summary">
              <span>Paid: <strong style={{color:"var(--green)"}}>₹{totalPaid}</strong></span>
              {remaining > 0
                ? <span className="split-remaining">⚠ Due: <strong>₹{remaining}</strong></span>
                : totalPaid > 0
                  ? <span style={{color:"var(--green)",fontWeight:700}}>✅ Fully Paid</span>
                  : null}
            </div>
          </div>

          {/* Shutdown */}
          <div className="modal-section">
            <div className="modal-section-title">⏻ Auto-Shutdown after session</div>
            <div className="shutdown-presets">
              {[30,60,120,180,300].map(s=>(
                <button key={s}
                  className={`btn btn-shutdown-preset ${shutD===s?"selected":""}`}
                  onClick={()=>setShutD(s)}>
                  {s<60?`${s}s`:`${s/60}m`}
                </button>
              ))}
            </div>
          </div>

          <div className="form-actions">
            <button className="btn btn-start" style={{flex:2}} onClick={()=>onSave({
              // Duration fields passed through unchanged so firebaseService doesn't reset timing
              durationMinutes: Math.round((session.session_duration||0)/60),
              freeMinutes:     Math.round((session.free_seconds||0)/60),
              customerPhone:   phone,
              customerAddress: addr,
              gamesPlayed:     games,
              paymentCash:     cashN,
              paymentUpi:      upiN,
              shutdownDelay:   shutD,
            })}>💾 Save Details</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Session Card ──────────────────────────────────────────────────────────────
function SessionCard({ session, type, settings, handlers }) {
  const { onQuickStart, onEditDetails, onAddTime, onReduceTime,
          onPause, onEnd, onToggleOnline, onShutdown } = handlers;

  const [localTime,       setLocalTime]       = useState(session.time_remaining||0);
  const [showStart,       setShowStart]       = useState(false);
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [confirmEnd,      setConfirmEnd]      = useState(false);
  const [confirmShutdown, setConfirmShutdown] = useState(false);

  const si    = statusInfo(session, type);
  const isLow = session.status==="active" && localTime<=300 && localTime>0 && !session.is_paused;

  const needsDetails = session.status==="active" &&
    session.payment_status === "pending" &&
    !session.payment_cash && !session.payment_upi;

  // Server-anchored sync: snap only on significant external change (add/reduce time)
  const localTimeRef = React.useRef(session.time_remaining||0);
  const intervalRef  = React.useRef(null);

  useEffect(() => {
    if (session.status !== "active") {
      localTimeRef.current = session.time_remaining||0;
      setLocalTime(session.time_remaining||0);
      return;
    }
    if (session.session_end_time && session.session_end_time > Date.now()) {
      const serverT = Math.max(0, Math.round((session.session_end_time - Date.now()) / 1000));
      if (Math.abs(localTimeRef.current - serverT) > 8) {
        localTimeRef.current = serverT;
        setLocalTime(serverT);
      }
    } else if (Math.abs(localTimeRef.current - (session.time_remaining||0)) > 8) {
      localTimeRef.current = session.time_remaining||0;
      setLocalTime(session.time_remaining||0);
    }
  }, [session.time_remaining, session.session_end_time, session.status]);

  useEffect(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    if (session.status !== "active" || session.is_paused) return;
    intervalRef.current = setInterval(() => {
      let next;
      if (session.session_end_time && session.session_end_time > Date.now()) {
        next = Math.max(0, Math.round((session.session_end_time - Date.now()) / 1000));
      } else {
        next = Math.max(0, localTimeRef.current - 1);
      }
      localTimeRef.current = next;
      setLocalTime(next);
    }, 1000);
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [session.status, session.is_paused, session.session_end_time]); // eslint-disable-line

  const paidInfo = session.payment_mode && session.payment_mode !== "pending"
    ? session.payment_mode === "split"
      ? `💵₹${session.payment_cash||0} + 📱₹${session.payment_upi||0}`
      : session.payment_mode === "cash"
        ? `💵 Cash ₹${session.payment_amount||0}`
        : `📱 UPI ₹${session.payment_amount||0}`
    : null;

  const timerPct = session.session_duration > 0
    ? Math.min(100, (localTime / session.session_duration) * 100)
    : 0;

  return (
    <>
      {showStart && (
        <StartSessionModal session={session} type={type} settings={settings}
          onStart={async (name, dur) => {
            await onQuickStart(session.id, name, dur);
            setShowStart(false);
          }}
          onCancel={()=>setShowStart(false)} />
      )}
      {showEditModal && (
        <EditDetailsModal session={session} type={type} settings={settings}
          onSave={details=>{onEditDetails(session.id,details); setShowEditModal(false);}}
          onCancel={()=>setShowEditModal(false)} />
      )}

      <div className={`pc-card ${si.cls} ${isLow?"pc-card-pulse":""} ${type==="ps5"?"ps5-card":""} ${needsDetails?"card-needs-details":""}`}>
        {/* Header */}
        <div className="pc-card-header">
          <div className="pc-name-row">
            <span className="pc-icon">{si.icon}</span>
            <h3 className="pc-name">{session.name}</h3>
            <span className={`status-badge ${si.cls}`}>{si.label}</span>
            {session.status==="active" && payBadge(session.payment_status)}
          </div>
          <div className="pc-header-actions">
            {(session.status==="offline"||session.status==="online") && (
              <button className={`online-toggle ${session.status==="offline"?"btn-bring-online":"btn-take-offline"}`}
                onClick={()=>onToggleOnline(session.id, session.status)}>
                {session.status==="offline"?"⬆ Online":"⬇ Offline"}
              </button>
            )}
            {session.status!=="offline" && (
              confirmShutdown ? (
                <div className="shutdown-confirm-row">
                  <span className="shutdown-confirm-text">Shutdown?</span>
                  <button className="btn btn-shutdown-confirm"
                    onClick={()=>{onShutdown(session.id);setConfirmShutdown(false);}}>Yes</button>
                  <button className="btn btn-secondary" style={{padding:"3px 8px",fontSize:11}}
                    onClick={()=>setConfirmShutdown(false)}>No</button>
                </div>
              ) : (
                <button className="btn btn-shutdown" onClick={()=>setConfirmShutdown(true)}>⏻</button>
              )
            )}
          </div>
        </div>

        {/* Timer */}
        <div className={`pc-timer ${isLow?"timer-warning":""}`}>
          {session.status==="active" ? (
            <>
              <div className="timer-digits">{formatTime(localTime)}</div>
              {needsDetails && (
                <div className="quick-started-badge">⚡ Payment Pending — Fill Details</div>
              )}
              {session.customer_name && (
                <div className="customer-info-row">
                  <span className="customer-name">👤 {session.customer_name}</span>
                  {session.customer_phone&&<span className="customer-phone">📞 {session.customer_phone}</span>}
                </div>
              )}
              {session.games_played && (
                <div className="customer-phone">🎯 {session.games_played}</div>
              )}
              {paidInfo && (
                <div className="payment-tag">{paidInfo}</div>
              )}
              {session.canteen_charges > 0 && (
                <div className="canteen-charge-tag">
                  🛒 +₹{session.canteen_charges} canteen charged
                </div>
              )}
            </>
          ) : session.status==="online" ? (
            <div className="timer-idle">Ready</div>
          ) : (
            <div className="timer-idle">—</div>
          )}
        </div>

        {/* Progress bar */}
        {session.status==="active" && session.session_duration > 0 && (
          <div className="progress-track">
            <div className={`progress-fill ${isLow?"progress-low":""}`}
              style={{width:`${timerPct}%`}}/>
          </div>
        )}

        {/* Controls */}
        <div className="pc-controls">
          {/* Single start button — no Quick Start / Trial */}
          {session.status==="online" && (
            <button className="btn btn-start" onClick={()=>setShowStart(true)}>
              ▶ Start Session
            </button>
          )}

          {session.status==="active" && (
            <>
              {needsDetails && (
                <button className="btn btn-fill-details" style={{width:"100%",marginBottom:6}}
                  onClick={()=>setShowEditModal(true)}>
                  📝 Fill Details & Payment
                </button>
              )}

              <div className="add-time-row">
                {ADD_OPTS.map(o=>(
                  <button key={o.v} className="btn btn-addtime"
                    onClick={()=>onAddTime(session.id,o.v)}>{o.l}</button>
                ))}
              </div>

              <div className="reduce-time-row">
                <span className="reduce-time-label">Reduce:</span>
                {REDUCE_OPTS.map(o=>(
                  <button key={o.v} className="btn btn-reducetime"
                    onClick={()=>onReduceTime(session.id,o.v)}>{o.l}</button>
                ))}
              </div>

              <div className="session-actions">
                <button className={`btn ${session.is_paused?"btn-resume":"btn-pause"}`}
                  onClick={()=>onPause(session.id,session.is_paused)}>
                  {session.is_paused?"▶ Resume":"⏸ Pause"}
                </button>
                {confirmEnd ? (
                  <div className="end-confirm-row" style={{display:"flex",gap:4,alignItems:"center"}}>
                    <span style={{fontSize:11,color:"var(--red)"}}>End?</span>
                    <button className="btn btn-end" style={{padding:"3px 10px"}}
                      onClick={()=>{onEnd(session.id);setConfirmEnd(false);}}>Yes</button>
                    <button className="btn btn-secondary" style={{padding:"3px 8px",fontSize:11}}
                      onClick={()=>setConfirmEnd(false)}>No</button>
                  </div>
                ) : (
                  <button className="btn btn-end" onClick={()=>setConfirmEnd(true)}>⏹ End</button>
                )}
                <button className="btn btn-secondary" style={{fontSize:12}}
                  onClick={()=>setShowEditModal(true)}>✎</button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function StatsBar({ pcs, ps5Sessions, payments }) {
  const pcActive  = pcs.filter(p=>p.status==="active").length;
  const ps5Active = ps5Sessions.filter(p=>p.status==="active").length;
  const pcIdle    = pcs.filter(p=>p.status==="online").length;

  const todayTs  = new Date().setHours(0,0,0,0);
  const todayPay = payments.filter(p=>p.paid_at>=todayTs);
  const todayRev = todayPay.reduce((s,p)=>s+(p.amount||0),0);
  const cashRev  = todayPay.reduce((s,p)=>s+(p.cash_amount??p.cash??(p.mode==="cash"?p.amount:0)??0),0);
  const upiRev   = todayPay.reduce((s,p)=>s+(p.upi_amount??p.upi??(p.mode==="upi"?p.amount:0)??0),0);

  const pendingPay = [...pcs,...ps5Sessions].filter(s=>
    s.status==="active" && (s.payment_status==="pending"||s.payment_status==="partial")
  );

  return (
    <div className="stats-bar">
      <div className="stat-item stat-active">
        <span className="stat-num">{pcActive+ps5Active}</span>
        <span className="stat-label">🔥 Active</span>
      </div>
      <div className="stat-item" style={{borderColor:"rgba(59,130,246,.3)"}}>
        <span className="stat-num" style={{color:"#3b82f6"}}>{pcActive}</span>
        <span className="stat-label">🖥 PC</span>
      </div>
      <div className="stat-item" style={{borderColor:"rgba(139,92,246,.3)"}}>
        <span className="stat-num" style={{color:"#8b5cf6"}}>{ps5Active}</span>
        <span className="stat-label">🎮 PS5</span>
      </div>
      <div className="stat-item stat-online">
        <span className="stat-num">{pcIdle}</span>
        <span className="stat-label">💤 Idle</span>
      </div>
      <div className="stat-item">
        <span className="stat-num">{todayPay.length}</span>
        <span className="stat-label">Sessions Today</span>
      </div>
      <div className="stat-item stat-revenue">
        <span className="stat-num">₹{todayRev}</span>
        <span className="stat-label">Revenue Today</span>
      </div>
      <div className="stat-item">
        <span className="stat-num" style={{fontSize:12}}>
          <span style={{color:"var(--green)"}}>💵₹{Math.round(cashRev)}</span>
          {" "}<span style={{color:"var(--blue)"}}>📱₹{Math.round(upiRev)}</span>
        </span>
        <span className="stat-label">Cash · UPI</span>
      </div>
      {pendingPay.length>0&&(
        <div className="stat-item" style={{borderColor:"rgba(239,68,68,.3)"}}>
          <span className="stat-num" style={{color:"var(--red)"}}>{pendingPay.length}</span>
          <span className="stat-label">⏳ Unpaid</span>
        </div>
      )}
    </div>
  );
}

// ── Board ─────────────────────────────────────────────────────────────────────
export default function SessionBoard({
  pcs, ps5Sessions, payments, settings,
  pcHandlers, ps5Handlers,
}) {
  const [view, setView] = useState("all");

  return (
    <div className="dashboard">
      <StatsBar pcs={pcs} ps5Sessions={ps5Sessions} payments={payments} />

      <div className="board-view-tabs">
        {[["all","All Sessions"],["pc","🖥 PCs Only"],["ps5","🎮 PS5 Only"]].map(([v,l])=>(
          <button key={v} className={`sales-pc-tab ${view===v?"active":""}`}
            onClick={()=>setView(v)}>{l}</button>
        ))}
      </div>

      {(view==="all"||view==="pc") && (
        <>
          {view==="all" && <div className="board-section-label">🖥 Gaming PCs</div>}
          <div className="pc-grid">
            {pcs.map(pc=>(
              <SessionCard key={pc.id} session={pc} type="pc" settings={settings}
                handlers={pcHandlers} />
            ))}
          </div>
        </>
      )}

      {(view==="all"||view==="ps5") && ps5Sessions.length > 0 && (
        <>
          {view==="all" && <div className="board-section-label" style={{marginTop:20}}>🎮 PS5 Consoles</div>}
          <div className="pc-grid" style={{marginTop:8}}>
            {ps5Sessions.map(ps5=>(
              <SessionCard key={ps5.id} session={ps5} type="ps5" settings={settings}
                handlers={ps5Handlers} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}