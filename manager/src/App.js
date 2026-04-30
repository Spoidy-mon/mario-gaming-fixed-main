import React, { useState, useEffect, useRef, useCallback } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import SessionBoard      from "./components/SessionBoard";
import CanteenManagement from "./components/CanteenManagement";
import SessionHistory    from "./components/SessionHistory";
import Settings          from "./components/Settings";
import ConsolesPanel     from "./components/ConsolesPanel";
import PendingDues       from "./components/PendingDues";
import MetreTracker      from "./components/MetreTracker";
import SalesReport       from "./components/SalesReport";
import GameBackground    from "./components/GameBackground";
import { initFirebase }  from "./firebaseInit";
import {
  listenPCs, listenCanteen, listenSales, listenSessionHistory,
  listenPayments, listenSettings, listenPendingDues, listenMetreReadings,
  listenWithdrawals, listenConsoles, listenPS5Sessions,
  // PC
  quickStartSession, startSession, updateSessionDetails,
  addTime, reduceTime, pauseSession, endSession,
  toggleOnline, sendShutdownCommand, sendWelcomeOverlay,
  updateTimeRemaining, setSessionEnded, checkAndRecoverStaleSessions,
  // PS5
  ps5QuickStart, ps5StartSession, updatePS5TimeRemaining,
  ps5AddTime, ps5ReduceTime, ps5PauseSession, ps5EndSession,
  ps5ToggleOnline, setPS5SessionEnded,
  // Canteen
  sellItem, restockItem,
  // Dues
  addPendingDue, markDuePaid,
} from "./firebaseService";
import {
  announceSessionStarted, announceSessionEnded,
  announceSessionPaused, announceSessionResumed,
  announceTimeAdded, announceTimeReduced,
  announceItemSold, announceShutdown,
} from "./utils/speak";
import "./index.css";

const TABS = [
  { id: "dashboard", label: "🖥 Dashboard" },
  { id: "canteen",   label: "🛒 Canteen" },
  { id: "sales",     label: "📊 Sales" },
  { id: "history",   label: "📋 History" },
  { id: "dues",      label: "💸 Dues" },
  { id: "metre",     label: "⚡ Metre" },
  { id: "settings",  label: "⚙️ Settings" },
];

export default function App() {
  const [activeTab,     setActiveTab]     = useState("dashboard");
  const [theme,         setTheme]         = useState(() => localStorage.getItem("theme") || "dark");
  const [pcs,           setPcs]           = useState([]);
  const [ps5Sessions,   setPs5Sessions]   = useState([]);
  const [canteenItems,  setCanteenItems]  = useState([]);
  const [sales,         setSales]         = useState([]);
  const [history,       setHistory]       = useState([]);
  const [payments,      setPayments]      = useState([]);
  const [settings,      setSettings]      = useState({});
  const [pendingDues,   setPendingDues]   = useState([]);
  const [metreReadings, setMetreReadings] = useState([]);
  const [withdrawals,   setWithdrawals]   = useState([]);
  const [consoles,      setConsoles]      = useState({});
  const [ready,         setReady]         = useState(false);

  const timers       = useRef({});
  const ps5Timers    = useRef({});
  const pcsRef       = useRef([]); pcsRef.current = pcs;
  const ps5Ref       = useRef([]); ps5Ref.current = ps5Sessions;
  const canteenRef   = useRef([]); canteenRef.current = canteenItems;
  const settingsRef  = useRef({}); settingsRef.current = settings;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    initFirebase().then(() => setReady(true)).catch(e => {
      console.error("Firebase init:", e);
      toast.error("Firebase connection failed");
    });
    const u = [
      listenPCs(setPcs), listenPS5Sessions(setPs5Sessions),
      listenCanteen(setCanteenItems), listenSales(setSales),
      listenSessionHistory(setHistory), listenPayments(setPayments),
      listenSettings(setSettings), listenPendingDues(setPendingDues),
      listenMetreReadings(setMetreReadings), listenWithdrawals(setWithdrawals),
      listenConsoles(setConsoles),
    ];
    return () => u.forEach(fn => { try { fn(); } catch(e) {} });
  }, []);

  // PC timers — using a ref map for localTime so add/reduce time is never overwritten
  const pcLocalTime = useRef({}); // { [pcId]: seconds }
  const pcLastFBSync = useRef({}); // { [pcId]: { value, ts } } — tracks last Firebase value+time

  useEffect(() => {
    pcs.forEach(pc => {
      if (pc.status === "active" && !pc.is_paused && pc.session_duration > 0) {
        const existing   = pcLocalTime.current[pc.id];
        const lastSync   = pcLastFBSync.current[pc.id];
        const fbChanged  = !lastSync || lastSync.value !== pc.time_remaining;

        // Only trust Firebase value if:
        // 1) First time seeing this session, OR
        // 2) Firebase value changed AND the change is > 10s from what we'd expect by now
        //    (meaning an external add/reduce happened, not just our own 10s write-back)
        if (existing === undefined) {
          pcLocalTime.current[pc.id] = pc.time_remaining;
        } else if (fbChanged) {
          const elapsed = lastSync ? (Date.now() - lastSync.ts) / 1000 : 999;
          const expected = existing - elapsed;
          if (Math.abs(pc.time_remaining - expected) > 10) {
            // External change (add/reduce time or updateSessionDetails)
            pcLocalTime.current[pc.id] = pc.time_remaining;
          }
        }
        if (fbChanged) pcLastFBSync.current[pc.id] = { value: pc.time_remaining, ts: Date.now() };

        if (!timers.current[pc.id]) {
          timers.current[pc.id] = setInterval(async () => {
            const latest = pcsRef.current.find(p => p.id === pc.id);
            if (!latest || latest.status !== "active" || latest.is_paused) {
              clearInterval(timers.current[pc.id]); delete timers.current[pc.id]; return;
            }
            // Read from ref — always has the latest value after add/reduce
            pcLocalTime.current[pc.id] = Math.max(0, (pcLocalTime.current[pc.id] || 0) - 1);
            const t = pcLocalTime.current[pc.id];

            if (t <= 0) {
              clearInterval(timers.current[pc.id]); delete timers.current[pc.id];
              try {
                await setSessionEnded(latest.id, latest);
                announceSessionEnded(latest.name, latest.customer_name || "");
                toast.warning(`⏰ Session ended on ${latest.name}!`);
              } catch(e) { console.error(e); }
            } else {
              // Write back to Firebase every 10s (not 5) to reduce write conflicts
              if (t % 10 === 0) updateTimeRemaining(latest.id, t).catch(console.error);
              setPcs(prev => prev.map(p => p.id === latest.id ? { ...p, time_remaining: t } : p));
            }
          }, 1000);
        }
      } else {
        if (timers.current[pc.id]) {
          clearInterval(timers.current[pc.id]);
          delete timers.current[pc.id];
          delete pcLocalTime.current[pc.id];
        }
      }
    });
    Object.keys(timers.current).forEach(id => {
      const pc = pcs.find(p => p.id === Number(id));
      if (!pc || pc.status !== "active" || pc.is_paused) {
        clearInterval(timers.current[id]); delete timers.current[id];
        delete pcLocalTime.current[Number(id)];
      }
    });
  }, [pcs]);

  // PS5 timers — ref-based to prevent stale closure overwriting added time
  const ps5LocalTime = useRef({});

  useEffect(() => {
    ps5Sessions.forEach(ps5 => {
      if (ps5.status === "active" && !ps5.is_paused && ps5.session_duration > 0) {
        const existing = ps5LocalTime.current[ps5.id];
        if (existing === undefined || Math.abs(existing - ps5.time_remaining) > 3) {
          ps5LocalTime.current[ps5.id] = ps5.time_remaining;
        }

        if (!ps5Timers.current[ps5.id]) {
          ps5Timers.current[ps5.id] = setInterval(async () => {
            const latest = ps5Ref.current.find(p => p.id === ps5.id);
            if (!latest || latest.status !== "active" || latest.is_paused) {
              clearInterval(ps5Timers.current[ps5.id]); delete ps5Timers.current[ps5.id]; return;
            }
            ps5LocalTime.current[ps5.id] = Math.max(0, (ps5LocalTime.current[ps5.id] || 0) - 1);
            const t = ps5LocalTime.current[ps5.id];

            if (t <= 0) {
              clearInterval(ps5Timers.current[ps5.id]); delete ps5Timers.current[ps5.id];
              try {
                await setPS5SessionEnded(latest.id, latest);
                announceSessionEnded(latest.name, latest.customer_name || "");
                toast.warning(`⏰ PS5 session ended on ${latest.name}!`);
              } catch(e) { console.error(e); }
            } else {
              if (t % 10 === 0) updatePS5TimeRemaining(latest.id, t).catch(console.error);
              setPs5Sessions(prev => prev.map(p => p.id === latest.id ? { ...p, time_remaining: t } : p));
            }
          }, 1000);
        }
      } else {
        if (ps5Timers.current[ps5.id]) {
          clearInterval(ps5Timers.current[ps5.id]);
          delete ps5Timers.current[ps5.id];
          delete ps5LocalTime.current[ps5.id];
        }
      }
    });
    Object.keys(ps5Timers.current).forEach(id => {
      const ps5 = ps5Sessions.find(p => p.id === id);
      if (!ps5 || ps5.status !== "active" || ps5.is_paused) { clearInterval(ps5Timers.current[id]); delete ps5Timers.current[id]; }
    });
  }, [ps5Sessions]);

  useEffect(() => () => {
    Object.values(timers.current).forEach(clearInterval);
    Object.values(ps5Timers.current).forEach(clearInterval);
  }, []);

  // Recovery
  useEffect(() => {
    const iv = setInterval(() => {
      if (pcsRef.current.length > 0) checkAndRecoverStaleSessions(pcsRef.current).catch(console.error);
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── PC Handlers ────────────────────────────────────────────────────────────
  const pcHandlers = {
    onQuickStart: useCallback(async (pcId, name, durationMinutes = 60) => {
      try {
        // Pass settingsRef.current so priceForSeconds uses the actual configured pricing
        await quickStartSession(pcId, name, durationMinutes, settingsRef.current);
        await sendWelcomeOverlay(pcId, name || "", durationMinutes).catch(() => {});
        announceSessionStarted(`PC ${pcId}`, name, durationMinutes);
        toast.success(`▶ Session started — PC-0${pcId} · ${name || "Guest"} · ${durationMinutes}min`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onFullStart: useCallback(async (pcId, name, durationMinutes = 60) => {
      try {
        await quickStartSession(pcId, name, durationMinutes, settingsRef.current);
        await sendWelcomeOverlay(pcId, name || "", durationMinutes).catch(() => {});
        toast.info(`PC-0${pcId} started. Fill extra details below.`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onEditDetails: useCallback(async (pcId, details) => {
      try {
        await updateSessionDetails(pcId, details, settings);
        // BUG FIX: force-sync local timer ref so countdown matches new duration
        const totalSec = ((details.durationMinutes||0) + (details.freeMinutes||0)) * 60;
        if (totalSec > 0) {
          pcLocalTime.current[pcId] = totalSec;
          pcLastFBSync.current[pcId] = { value: totalSec, ts: Date.now() };
        }
        const pc = pcsRef.current.find(p => p.id === pcId);
        if (details.durationMinutes) {
          await sendWelcomeOverlay(pcId, pc?.customer_name || "", details.durationMinutes + (details.freeMinutes||0)).catch(()=>{});
          announceSessionStarted(`PC ${pcId}`, pc?.customer_name || "", details.durationMinutes);
        }
        toast.success(`Details saved for PC-0${pcId}`);
      } catch(e) { toast.error(e.message); }
    }, [settings]),

    onAddTime: useCallback(async (pcId, minutes) => {
      try {
        // Immediately update the ref so the countdown uses the new value right away
        if (pcLocalTime.current[pcId] !== undefined) {
          pcLocalTime.current[pcId] += minutes * 60;
        }
        const result = await addTime(pcId, minutes * 60, settingsRef.current);
        const pc = pcsRef.current.find(p => p.id === pcId);
        announceTimeAdded(pc?.name || `PC-0${pcId}`, minutes);
        const charge = result?.chargeAdded?.toFixed(0) || 0;
        const due    = result?.newBalanceDue;
        toast.success(
          due > 0
            ? `+${minutes}min added · +₹${charge} · Due: ₹${due}`
            : `+${minutes}min added · +₹${charge}`
        );
      } catch(e) { toast.error(e.message); }
    }, []),

    onReduceTime: useCallback(async (pcId, minutes) => {
      try {
        if (pcLocalTime.current[pcId] !== undefined) {
          pcLocalTime.current[pcId] = Math.max(0, pcLocalTime.current[pcId] - minutes * 60);
        }
        const result = await reduceTime(pcId, minutes * 60, settingsRef.current);
        const pc = pcsRef.current.find(p => p.id === pcId);
        announceTimeReduced(pc?.name || `PC-0${pcId}`, minutes);
        const deducted = result?.chargeDeducted?.toFixed(0) || 0;
        const newDue   = result?.newBalanceDue;
        toast.info(
          newDue > 0
            ? `-${minutes}min removed · -₹${deducted} · Due: ₹${newDue}`
            : `-${minutes}min removed · -₹${deducted}`
        );
      } catch(e) { toast.error(e.message); }
    }, []),

    onPause: useCallback(async (pcId, isPaused) => {
      try {
        const pc = pcsRef.current.find(p => p.id === pcId);
        if (!pc) return;
        await updateTimeRemaining(pcId, pc.time_remaining);
        await pauseSession(pcId, isPaused);
        if (isPaused) announceSessionResumed(pc.name); else announceSessionPaused(pc.name);
        toast.info(isPaused ? `▶ PC-0${pcId} resumed` : `⏸ PC-0${pcId} paused`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onEnd: useCallback(async (pcId) => {
      try {
        const pc = pcsRef.current.find(p => p.id === pcId);
        await endSession(pcId, pcsRef.current);
        if (pc) announceSessionEnded(pc.name, pc.customer_name || "");
        toast.info(`⏹ Session ended — PC-0${pcId}`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onToggleOnline: useCallback(async (pcId, status) => {
      try {
        const newStatus = await toggleOnline(pcId, status);
        toast.info(`PC-0${pcId} → ${newStatus}`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onShutdown: useCallback(async (pcId) => {
      try {
        await sendShutdownCommand(pcId);
        const pc = pcsRef.current.find(p => p.id === pcId);
        announceShutdown(pc?.name || `PC-0${pcId}`);
        toast.warning(`⏻ Shutdown → PC-0${pcId}`);
      } catch(e) { toast.error(e.message); }
    }, []),
  };

  // ── PS5 Handlers ───────────────────────────────────────────────────────────
  const ps5Handlers = {
    onQuickStart: useCallback(async (ps5Id, name, durationMinutes = 60) => {
      try {
        await ps5QuickStart(ps5Id, name, durationMinutes, settingsRef.current);
        announceSessionStarted(ps5Id.replace("_","#"), name, durationMinutes);
        toast.success(`▶ Session started — ${ps5Id.replace("_","#")} · ${name || "Guest"} · ${durationMinutes}min`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onFullStart: useCallback(async (ps5Id, name, durationMinutes = 60) => {
      try {
        await ps5QuickStart(ps5Id, name, durationMinutes, settingsRef.current);
        toast.info(`PS5 started. Fill extra details below.`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onEditDetails: useCallback(async (ps5Id, details) => {
      try {
        const durationSec = (details.durationMinutes||0)*60;
        const freeSec     = (details.freeMinutes||0)*60;
        const totalSec    = durationSec + freeSec;
        const cashAmt     = Number(details.paymentCash||0);
        const upiAmt      = Number(details.paymentUpi||0);
        const totalPaid   = cashAmt + upiAmt;
        const totalDue    = settingsRef.current?.pricing?.[details.durationMinutes] || totalPaid || 0;
        const payStatus   = totalPaid>=totalDue?"paid":totalPaid>0?"partial":"pending";
        const payMode     = cashAmt>0&&upiAmt>0?"split":cashAmt>0?"cash":upiAmt>0?"upi":"pending";

        const {update, ref, push} = await import("firebase/database");
        const {db} = await import("./firebase");

        await update(ref(db,`ps5_sessions/${ps5Id}`), {
          time_remaining: totalSec, session_duration: totalSec,
          paid_seconds: durationSec, free_seconds: freeSec,
          customer_phone: details.customerPhone||"", customer_address: details.customerAddress||"",
          games_played: details.gamesPlayed||"",
          payment_cash: cashAmt, payment_upi: upiAmt, payment_amount: totalDue,
          payment_mode: payMode, payment_status: payStatus,
          timer_started_at: Date.now(),
        });

        // BUG FIX: sync local PS5 timer ref
        if (totalSec > 0) {
          ps5LocalTime.current[ps5Id] = totalSec;
        }

        // BUG FIX: write payment to payments collection so Sales tab shows it
        if (totalPaid > 0) {
          const ps5 = ps5Ref.current.find(p => p.id === ps5Id);
          await push(ref(db, "payments"), {
            pc_id: null, pc_name: ps5?.name || ps5Id,
            device_type: "ps5", ps5_id: ps5Id,
            customer_name: ps5?.customer_name || "",
            amount: totalPaid, cash: cashAmt, upi: upiAmt,
            cash_amount: cashAmt, upi_amount: upiAmt,
            mode: payMode,
            session_duration: durationSec,
            free_minutes: details.freeMinutes||0,
            paid_at: Date.now(),
          });
        }

        toast.success(`PS5 details saved`);
      } catch(e) { toast.error(e.message); }
    }, [settings]),

    onAddTime: useCallback(async (ps5Id, minutes) => {
      try {
        await ps5AddTime(ps5Id, minutes*60);
        toast.success(`+${minutes}min → ${ps5Id}`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onReduceTime: useCallback(async (ps5Id, minutes) => {
      try {
        await ps5ReduceTime(ps5Id, minutes*60);
        toast.info(`-${minutes}min from ${ps5Id}`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onPause: useCallback(async (ps5Id, isPaused) => {
      try {
        const ps5 = ps5Ref.current.find(p => p.id === ps5Id);
        if (ps5) await updatePS5TimeRemaining(ps5Id, ps5.time_remaining);
        await ps5PauseSession(ps5Id, isPaused);
        toast.info(isPaused ? `▶ PS5 resumed` : `⏸ PS5 paused`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onEnd: useCallback(async (ps5Id) => {
      try {
        await ps5EndSession(ps5Id, ps5Ref.current);
        toast.info(`⏹ PS5 session ended`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onToggleOnline: useCallback(async (ps5Id, status) => {
      try {
        await ps5ToggleOnline(ps5Id, status);
        toast.info(`${ps5Id} toggled`);
      } catch(e) { toast.error(e.message); }
    }, []),

    onShutdown: useCallback(async (ps5Id) => {
      toast.info(`PS5 shutdown signal sent`);
    }, []),
  };

  // ── Canteen ────────────────────────────────────────────────────────────────
  const handleSell = useCallback(async (itemId, quantity = 1, deviceId = null, paymentMode = "cash") => {
    try {
      const total = await sellItem(itemId, quantity, deviceId, pcsRef.current, ps5Ref.current, paymentMode);
      const item  = canteenRef.current.find(i => i.id === Number(itemId));
      const pc    = deviceId ? pcsRef.current.find(p => p.id === deviceId) : null;
      const ps5   = deviceId ? ps5Ref.current.find(p => p.id === deviceId) : null;
      if (item) announceItemSold(item.name, (pc||ps5)?.name || null);
      toast.success(`Sold ₹${total.toFixed(2)}`);
    } catch(e) { toast.error(e.message); }
  }, []);

  const handleRestock = useCallback(async (itemId, quantity) => {
    try { await restockItem(itemId, quantity); toast.success("Stock updated!"); }
    catch(e) { toast.error(e.message); }
  }, []);

  if (!ready) return (
    <div className="app-loading">
      <GameBackground />
      <div style={{position:"relative",zIndex:1,textAlign:"center"}}>
        <span style={{fontSize:56}}>🎮</span>
        <p style={{marginTop:16}}>Connecting to Firebase...</p>
      </div>
    </div>
  );

  const duesBadge = pendingDues.length > 0 ? pendingDues.length : null;

  return (
    <div className="app">
      <GameBackground />
      <header className="app-header">
        <div className="header-left">
          <span className="logo">🎮</span>
          <div>
            <h1 className="app-title">{settings.cafeeName || "Mario Gaming Café"}</h1>
            <p className="app-subtitle">Management System</p>
          </div>
        </div>
        <div className="header-right">
          <span className="conn-badge conn-on"><span className="conn-dot"></span>Firebase Live</span>
          <nav className="tab-nav">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn ${activeTab===t.id?"active":""}`}
                onClick={() => setActiveTab(t.id)}>
                {t.label}
                {t.id==="dues" && duesBadge && <span className="tab-badge">{duesBadge}</span>}
              </button>
            ))}
          </nav>
          <button className="theme-btn"
            onClick={() => setTheme(t => t==="dark"?"light":"dark")}>
            {theme==="dark"?"☀️":"🌙"}
          </button>
        </div>
      </header>

      <main className="app-main" style={{position:"relative",zIndex:1}}>
        {activeTab==="dashboard" && (
          <>
            <SessionBoard
              pcs={pcs} ps5Sessions={ps5Sessions}
              payments={payments} settings={settings}
              pcHandlers={pcHandlers} ps5Handlers={ps5Handlers}
            />
            <div style={{marginTop:24}}>
              <ConsolesPanel consoles={consoles} />
            </div>
          </>
        )}
        {activeTab==="canteen" && (
          <CanteenManagement items={canteenItems} sales={sales}
            pcs={pcs} ps5Sessions={ps5Sessions}
            onSell={handleSell} onRestock={handleRestock} />
        )}
        {activeTab==="sales" && (
          <SalesReport payments={payments} sales={sales} withdrawals={withdrawals} />
        )}
        {activeTab==="history" && (
          <SessionHistory history={history} sales={sales} pcs={pcs} payments={payments} />
        )}
        {activeTab==="dues" && (
          <PendingDues dues={pendingDues} pcs={pcs} ps5Sessions={ps5Sessions} />
        )}
        {activeTab==="metre" && (
          <MetreTracker readings={metreReadings} settings={settings} />
        )}
        {activeTab==="settings" && (
          <Settings settings={settings} onSave={setSettings} pcs={pcs} ps5Sessions={ps5Sessions} />
        )}
      </main>

      <ToastContainer position="bottom-right" autoClose={3000} theme={theme} pauseOnHover />
    </div>
  );
}