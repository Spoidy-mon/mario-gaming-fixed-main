"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, dialog } = require("electron");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const DEVICE_ID       = 1;   // ← CHANGE THIS per PC (1, 2, 3 …)
const FIREBASE_DB_URL = `https://mario-gaming-cafe-default-rtdb.asia-southeast1.firebasedatabase.app`;
const POLL_INTERVAL   = 1500;
const BAR_HEIGHT      = 44;   // kept for legacy reference
const BAR_WIDTH       = 56;   // vertical bar width (collapsed peek)
const BAR_WIDTH_OPEN  = 200;  // vertical bar width (expanded)
const WARN_SECS       = 600;  // 10 minutes — force-show + highlight

// ── State ─────────────────────────────────────────────────────────────────────
let tray            = null;
let countdownBar    = null;
let screensaverWin  = null;
let warningWin      = null;
let shutdownWin     = null;
let welcomeWin      = null;
let shutdownTicker  = null;
let lastStatus      = null;
let lastTimeLeft    = null;
let lastShutdownCmd = null;
let warningShown    = false;
let currentPCData   = null;
let settings        = { shutdownDelay: 30, warningAt: 300 };

// ── Controlled-quit flag ──────────────────────────────────────────────────────
// Set to true before any intentional app.quit() / app.relaunch() so the
// before-quit guard lets the process actually exit.  This keeps the app
// unkillable by accident (e.g. last window closed) while still allowing
// admin-triggered shutdown / relaunch to work cleanly.
let isQuitting = false;

// ── Firebase helpers ──────────────────────────────────────────────────────────
async function fbGet(path) {
  try {
    const r = await fetch(`${FIREBASE_DB_URL}/${path}.json`);
    return r.ok ? r.json() : null;
  } catch (e) { console.error("fbGet:", e.message); return null; }
}
async function fbPatch(path, data) {
  try {
    await fetch(`${FIREBASE_DB_URL}/${path}.json`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch (e) { console.error("fbPatch:", e.message); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getDisplay() {
  const d = screen.getPrimaryDisplay();
  return { w: d.bounds.width, h: d.bounds.height, x: d.bounds.x, y: d.bounds.y };
}
function keepOnTop(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, "screen-saver", 1);
  win.moveTop();
}
function destroyWin(w) {
  if (w && !w.isDestroyed()) {
    w.removeAllListeners("close");
    w.removeAllListeners("blur");
    w.destroy();
  }
}
function makeFullWin(extra = {}) {
  const d = getDisplay();
  return new BrowserWindow({
    width: d.w, height: d.h, x: d.x, y: d.y,
    frame: false, fullscreen: true, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    ...extra,
  });
}

// ── Tray ──────────────────────────────────────────────────────────────────────
function makeTrayIcon() {
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAQ0lEQVQ4y2NgGAXDE/wnIJ5hYGD4z0A6YBgFgxUAAAAAAElFTkSuQmCC"
  );
  return img.isEmpty() ? nativeImage.createEmpty() : img;
}
function buildTrayMenu(status, timeLeft) {
  const fmt = s => s <= 0 ? "00:00" : `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  const statusLine = status === "active"
    ? `🟢 Active — ${fmt(timeLeft)} left`
    : status === "online" ? "💤 Idle" : "⚫ Offline";
  return Menu.buildFromTemplate([
    { label: `🎮 PC-0${DEVICE_ID}`, enabled: false },
    { type: "separator" },
    { label: statusLine, enabled: false },
    { type: "separator" },
    { label: "🔄 Restart", click: () => { isQuitting = true; app.relaunch(); app.exit(0); } },
  ]);
}
function setupTray() {
  tray = new Tray(makeTrayIcon());
  tray.setToolTip(`Mario Gaming — PC-0${DEVICE_ID}`);
  tray.setContextMenu(buildTrayMenu("online", 0));
}
function updateTray(status, timeLeft) {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(buildTrayMenu(status, timeLeft));
}

// ── Countdown Bar ─────────────────────────────────────────────────────────────
// The bar has its own internal 1s countdown driven by JS.
// When add/reduce time happens from the manager, pollStatus gets the NEW
// time_remaining from Firebase and calls updateCountdownBar() which sends
// the corrected value directly into the bar's running script via IPC.
// This is the FIX for Bug 1 — the bar was never receiving the updated value.

function buildCountdownBarHTML(timeLeft, isPaused, customerName, sessionDuration, warningAt, sessionEndTime = 0) {
  const dur = sessionDuration || Math.max(timeLeft, 3600);
  const fmt = s => {
    if (!s || s <= 0) return "00:00:00";
    return [Math.floor(s/3600), Math.floor((s%3600)/60), s%60]
      .map(v => String(v).padStart(2,"0")).join(":");
  };
  const pct      = Math.min(100, Math.max(0, (timeLeft / dur) * 100));
  const isLow    = timeLeft > 0 && timeLeft <= (warningAt || 300);
  const isWarn10 = timeLeft > 0 && timeLeft <= WARN_SECS; // ≤10 min warning
  const timeStr  = fmt(timeLeft);
  const name     = customerName ? customerName : "";
  const label    = isPaused ? "PAUSED" : isLow ? "LOW TIME" : "SESSION";
  const barColor = isPaused ? "#f59e0b" : (isWarn10 || isLow) ? "#ef4444" : "#10b981";

  // The bar is a narrow vertical strip on the LEFT edge.
  // It auto-hides (slides off-screen to the left) after 4 seconds of inactivity.
  // Mouse movement near the left edge (mousemove on document) slides it back in.
  // When ≤10 min, it force-shows itself and glows orange/red.
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@600;700&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{
    width:${BAR_WIDTH_OPEN}px;height:100vh;
    background:transparent;overflow:hidden;
    -webkit-app-region:no-drag;user-select:none;
  }
  /* Outer wrapper handles the slide transform */
  #slider{
    position:fixed;top:0;left:0;
    width:${BAR_WIDTH_OPEN}px;height:100vh;
    transform:translateX(calc(-${BAR_WIDTH_OPEN}px + ${BAR_WIDTH}px));
    transition:transform .35s cubic-bezier(.4,0,.2,1);
    z-index:9999;
  }
  #slider.visible{ transform:translateX(0); }
  .bar{
    width:100%;height:100%;
    background:rgba(5,10,20,0.93);
    backdrop-filter:blur(18px);
    border-right:1px solid rgba(255,255,255,0.07);
    box-shadow:4px 0 32px rgba(0,0,0,.6);
    display:flex;flex-direction:column;align-items:center;
    padding:20px 0 16px;gap:0;
    position:relative;overflow:hidden;
  }
  /* Accent glow strip on the right edge */
  .bar::after{
    content:'';position:absolute;top:0;right:0;width:2px;height:100%;
    background:var(--bc,#10b981);
    box-shadow:0 0 12px var(--gc,rgba(16,185,129,.5));
    transition:background .4s,box-shadow .4s;
  }
  /* Progress fill from top */
  #progress{
    position:absolute;top:0;left:0;width:100%;
    background:var(--bc,#10b981);opacity:.12;
    transition:height 1s linear,background .4s;
    pointer-events:none;
  }
  .dot{
    width:10px;height:10px;border-radius:50%;
    background:var(--bc,#10b981);
    box-shadow:0 0 10px var(--gc,rgba(16,185,129,.5));
    flex-shrink:0;margin-bottom:10px;
  }
  .dot.pulse{animation:pulse 2s infinite}
  @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.7)}}
  .label{
    font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:700;
    color:var(--bc,#10b981);letter-spacing:1.8px;text-transform:uppercase;
    writing-mode:vertical-lr;transform:rotate(180deg);
    opacity:.85;margin-bottom:14px;flex-shrink:0;
  }
  .time{
    font-family:'Share Tech Mono',monospace;font-size:13px;font-weight:700;
    color:#fff;letter-spacing:1px;line-height:1;
    writing-mode:vertical-lr;transform:rotate(180deg);
    transition:color .3s;flex-shrink:0;margin-bottom:12px;
  }
  .time.blink{animation:blink 1s step-start infinite}
  @keyframes blink{50%{opacity:.35}}
  .name{
    font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:600;
    color:rgba(255,255,255,.35);
    writing-mode:vertical-lr;transform:rotate(180deg);
    overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
    max-height:120px;flex-shrink:0;margin-bottom:12px;
  }
  .addtime-flash{
    font-family:'Rajdhani',sans-serif;font-size:10px;font-weight:700;
    color:#10b981;background:rgba(16,185,129,.15);
    border:1px solid rgba(16,185,129,.3);
    padding:4px 6px;border-radius:12px;
    writing-mode:vertical-lr;transform:rotate(180deg);
    animation:flashin .4s ease;display:none;
  }
  @keyframes flashin{from{opacity:0;transform:rotate(180deg) scale(.8)}to{opacity:1;transform:rotate(180deg) scale(1)}}
  .addtime-flash.show{display:block}
  .low-warn{
    font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:700;
    color:#ef4444;letter-spacing:.5px;
    writing-mode:vertical-lr;transform:rotate(180deg);
    animation:blink 1s step-start infinite;
    margin-bottom:8px;
  }
  .pcid{
    margin-top:auto;
    font-family:'Rajdhani',sans-serif;font-size:9px;font-weight:700;
    color:rgba(255,255,255,.12);letter-spacing:1px;flex-shrink:0;
    writing-mode:vertical-lr;transform:rotate(180deg);
  }
  /* Warning state — orange glow pulse on bar bg */
  #slider.warning .bar{
    background:rgba(20,6,4,0.95);
  }
  #slider.warning .bar::after{
    animation:warn-glow 1.4s ease-in-out infinite;
  }
  @keyframes warn-glow{
    0%,100%{box-shadow:0 0 8px rgba(239,68,68,.4)}
    50%{box-shadow:0 0 28px rgba(239,68,68,.95)}
  }
</style>
</head><body>
<div id="slider">
  <div class="bar">
    <div id="progress" style="height:${pct}%"></div>
    <div class="dot ${!isPaused && !isLow ? "pulse" : ""}" id="dot"></div>
    <div class="label" id="label">${label}</div>
    <div class="time ${isLow && !isPaused ? "blink" : ""}" id="time">${timeStr}</div>
    <div class="name" id="name">${name}</div>
    <div class="addtime-flash" id="flash"></div>
    ${isLow && !isPaused ? `<div class="low-warn">ADD TIME</div>` : `<div id="lowwarn" style="display:none" class="low-warn">ADD TIME</div>`}
    <div class="pcid">PC-0${DEVICE_ID}</div>
  </div>
</div>
<script>
  let t         = ${timeLeft};
  let paused    = ${isPaused ? "true" : "false"};
  let sessdur   = ${dur};
  let serverEndTime = ${sessionEndTime || 0};   // server-anchored epoch ms
  const WARN_AT   = ${warningAt || 300};   // low-time threshold (default 5 min)
  const FORCE_AT  = ${WARN_SECS};          // force-show + highlight at 10 min
  const HIDE_DELAY = 4000;                 // auto-hide after 4 s inactivity

  const slider  = document.getElementById("slider");
  let hideTimer = null;

  // ── Visibility helpers ────────────────────────────────────────────────────
  function showBar(temporary) {
    slider.classList.add("visible");
    if(temporary) scheduleHide();
  }
  function hideBar() {
    // Never hide when in warning/forced state
    if(slider.classList.contains("warning")) return;
    slider.classList.remove("visible");
  }
  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideBar, HIDE_DELAY);
  }

  // Show on load briefly, then hide
  showBar(true);

  // Mouse near left edge (within 60px) → slide in
  document.addEventListener("mousemove", e => {
    if(e.clientX < 60 || slider.classList.contains("visible")) {
      showBar(e.clientX >= 60); // if cursor leaves edge zone, start hide timer
    }
  });

  // ── State renderer ────────────────────────────────────────────────────────
  function fmt(s){
    if(!s||s<=0) return "00:00:00";
    return [Math.floor(s/3600),Math.floor((s%3600)/60),s%60]
      .map(v=>String(v).padStart(2,"0")).join(":");
  }

  function applyState(){
    const isLow    = t > 0 && t <= WARN_AT;
    const isWarn10 = t > 0 && t <= FORCE_AT;
    const bc  = paused ? "#f59e0b" : (isWarn10||isLow) ? "#ef4444" : "#10b981";
    const gc  = paused ? "rgba(245,158,11,.4)" : (isWarn10||isLow) ? "rgba(239,68,68,.6)" : "rgba(16,185,129,.4)";
    const pct = Math.min(100, Math.max(0, (t / sessdur) * 100));
    const lbl = paused ? "PAUSED" : isLow ? "LOW TIME" : "SESSION";

    document.documentElement.style.setProperty("--bc", bc);
    document.documentElement.style.setProperty("--gc", gc);
    document.getElementById("progress").style.height = pct + "%";
    document.getElementById("time").textContent = fmt(t);
    document.getElementById("time").style.color = (isWarn10||isLow) ? "#ef4444" : paused ? "#f59e0b" : "#fff";
    document.getElementById("time").classList.toggle("blink", (isWarn10||isLow) && !paused);
    document.getElementById("label").textContent = lbl;
    document.getElementById("label").style.color = bc;
    document.getElementById("dot").style.background = bc;
    document.getElementById("dot").style.boxShadow = "0 0 10px " + gc;

    const lw = document.getElementById("lowwarn");
    if(lw) lw.style.display = (isLow && !paused) ? "block" : "none";

    // Force-show + warning glow when ≤10 min
    if(isWarn10 && !paused){
      slider.classList.add("warning");
      showBar(false);            // show permanently (no auto-hide)
      clearTimeout(hideTimer);   // cancel any pending hide
    } else {
      slider.classList.remove("warning");
    }
  }

  // ── IPC from main process ─────────────────────────────────────────────────
  let tickInterval = null; // single interval reference — prevents duplication

  function startTick() {
    if (tickInterval) return; // already running — do not create another
    tickInterval = setInterval(() => {
      if (!paused) {
        // Use server-anchored end time if available for accuracy
        if (serverEndTime > 0) {
          t = Math.max(0, Math.round((serverEndTime - Date.now()) / 1000));
        } else if (t > 0) {
          t--;
        }
        applyState();
      }
    }, 1000);
  }

  function stopTick() {
    if (tickInterval) { clearInterval(tickInterval); tickInterval = null; }
  }

  if(window.barApi) {
    window.barApi.onUpdate(data => {
      const prevT   = t;
      const diff    = data.timeLeft - t;

      // Update server-anchored end time whenever we get a new value
      if (data.sessionEndTime) serverEndTime = data.sessionEndTime;

      // Only hard-reset the local counter on significant external changes (add/reduce time)
      // Small drifts (<= 5s) are ignored to prevent flickering
      if(Math.abs(diff) > 5) t = data.timeLeft;

      paused  = data.isPaused;
      sessdur = data.sessionDuration || sessdur;
      if(data.customerName !== undefined)
        document.getElementById("name").textContent = data.customerName;

      // Flash "+Xmin" / "-Xmin" badge on significant time changes
      if(Math.abs(diff) > 30) {
        const flash = document.getElementById("flash");
        flash.textContent = diff > 0 ? "+" + Math.round(diff/60) + "m ✓" : Math.round(diff/60) + "m";
        flash.style.color       = diff > 0 ? "#10b981" : "#ef4444";
        flash.style.borderColor = diff > 0 ? "rgba(16,185,129,.3)" : "rgba(239,68,68,.3)";
        flash.style.background  = diff > 0 ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)";
        flash.classList.add("show");
        showBar(true);
        setTimeout(() => flash.classList.remove("show"), 2500);
      }

      // Manage single tick interval based on pause state
      if (paused) { stopTick(); } else { startTick(); }
      applyState();
    });
  }

  // Start ticking on load
  startTick();
  applyState();
</script>
</body></html>`;
}

// Create or update the countdown bar
function showCountdownBar(timeLeft, isPaused, customerName, sessionDuration) {
  const d = getDisplay();
  const warningAt = settings.warningAt || 300;

  if (countdownBar && !countdownBar.isDestroyed()) {
    // Send an update to the bar every poll cycle.
    // TIMER FREEZE FIX: Firebase only writes back every 10s, so polling every
    // 1.5s returns a stale time_remaining — especially under 5 minutes.
    // We pass the Firebase value BUT the renderer only replaces its local
    // countdown `t` when the difference is > 5 seconds (external add/reduce).
    // All other polls just update pause/name/colors without resetting the clock.
    countdownBar.webContents.send("update", {
      timeLeft, isPaused, customerName, sessionDuration, warningAt,
      sessionEndTime: currentPCData?.session_end_time || 0,
    });
    return;
  }

  // Build and show fresh bar
  const html = buildCountdownBarHTML(timeLeft, isPaused, customerName, sessionDuration, warningAt, currentPCData?.session_end_time || 0);

  countdownBar = new BrowserWindow({
    width:       BAR_WIDTH_OPEN,   // wide enough for the expanded panel
    height:      d.h,              // full-screen height, left edge
    x:           d.x,              // flush to left edge
    y:           d.y,
    frame:       false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    movable:     false,
    focusable:   false,            // never steals focus
    hasShadow:   false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "bar-preload.js"),
    },
  });

  // Allow mouse events — the renderer handles hover-to-reveal;
  // pass-through is managed per-region inside the HTML.
  countdownBar.setIgnoreMouseEvents(false);
  countdownBar.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  keepOnTop(countdownBar);

  setInterval(() => {
    if (countdownBar && !countdownBar.isDestroyed()) keepOnTop(countdownBar);
  }, 2000);
}

function hideCountdownBar() {
  destroyWin(countdownBar);
  countdownBar = null;
}

// ── Screensaver ───────────────────────────────────────────────────────────────
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--blue:#3b82f6;--green:#10b981;--gold:#f59e0b;--red:#ef4444;--bg:#050a14;--muted:rgba(255,255,255,.35)}
body{background:var(--bg);color:#fff;font-family:'Rajdhani',sans-serif;overflow:hidden;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
`;

function showScreensaver() {
  if (screensaverWin && !screensaverWin.isDestroyed()) return;
  hideCountdownBar();

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
${BASE_CSS}
.wrap{text-align:center;padding:40px}
.logo{font-size:72px;margin-bottom:16px;animation:float 3s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
.title{font-family:'Orbitron',monospace;font-size:36px;font-weight:900;background:linear-gradient(135deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:8px}
.sub{font-size:18px;color:var(--muted);margin-bottom:32px;letter-spacing:1px}
.pcid{display:inline-block;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px 20px;font-family:'Orbitron',monospace;font-size:14px;color:rgba(255,255,255,.4);letter-spacing:2px}
canvas{position:fixed;inset:0;pointer-events:none;z-index:-1}
</style></head><body>
<canvas id="c"></canvas>
<div class="wrap">
  <div class="logo">🎮</div>
  <div class="title">MARIO GAMING</div>
  <div class="sub">CAFÉ</div>
  <div class="pcid">PC-0${DEVICE_ID}</div>
</div>
<script>
const c=document.getElementById("c"),ctx=c.getContext("2d");
c.width=window.innerWidth;c.height=window.innerHeight;
const stars=Array.from({length:120},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.5+.3,o:Math.random(),s:Math.random()*.003+.001}));
function draw(){ctx.clearRect(0,0,c.width,c.height);stars.forEach(s=>{s.o+=s.s;if(s.o>1||s.o<0)s.s*=-1;ctx.globalAlpha=s.o;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;requestAnimationFrame(draw);}
draw();
</script>
</body></html>`;

  screensaverWin = makeFullWin({ focusable: false });
  screensaverWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  screensaverWin.on("close", e => e.preventDefault());
  setInterval(() => { if (screensaverWin && !screensaverWin.isDestroyed()) keepOnTop(screensaverWin); }, 1500);
}

function hideScreensaver() {
  if (screensaverWin && !screensaverWin.isDestroyed()) {
    screensaverWin.removeAllListeners("close");
    screensaverWin.destroy(); screensaverWin = null;
  }
}

// ── Welcome overlay ───────────────────────────────────────────────────────────
function showWelcomeOverlay(customerName, totalMinutes, cafeName) {
  destroyWin(welcomeWin);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
${BASE_CSS}
.wrap{text-align:center;padding:50px 40px;animation:pop .5s cubic-bezier(.175,.885,.32,1.275)}
@keyframes pop{from{transform:scale(.85);opacity:0}to{transform:scale(1);opacity:1}}
.hi{font-size:20px;color:var(--muted);margin-bottom:4px;letter-spacing:.5px}
.name{font-family:'Orbitron',monospace;font-size:40px;font-weight:900;background:linear-gradient(135deg,#10b981,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:24px;max-width:700px;line-height:1.1}
.time-box{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:20px 40px;display:inline-block;margin-bottom:24px}
.time-val{font-family:'Orbitron',monospace;font-size:56px;font-weight:900;color:#10b981;text-shadow:0 0 30px rgba(16,185,129,.5)}
.time-lbl{font-size:14px;color:var(--muted);letter-spacing:2px;margin-top:4px;text-transform:uppercase}
.enjoy{font-size:18px;color:var(--muted)}
.cafe{margin-top:20px;font-size:13px;color:rgba(255,255,255,.2);letter-spacing:1px}
</style></head><body>
<div class="wrap">
  <div class="hi">Welcome</div>
  <div class="name">${customerName ? customerName.toUpperCase() : "PLAYER"}</div>
  <div class="time-box">
    <div class="time-val">${totalMinutes}</div>
    <div class="time-lbl">minutes</div>
  </div>
  <div class="enjoy">🎮 Have a great session!</div>
  <div class="cafe">${cafeName || "Mario Gaming Café"}</div>
</div>
<script>setTimeout(()=>window.close(),4500);</script>
</body></html>`;

  welcomeWin = makeFullWin({ focusable: false });
  welcomeWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  welcomeWin.on("close", e => e.preventDefault());
  setTimeout(() => destroyWin(welcomeWin), 5000);
}

// ── Warning overlay ───────────────────────────────────────────────────────────
function showWarningWindow(secondsLeft) {
  if (warningWin && !warningWin.isDestroyed()) return;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
${BASE_CSS}
body{background:rgba(12,4,4,.97)}
.wrap{text-align:center;padding:50px}
.icon{font-size:64px;margin-bottom:16px;animation:shake 1s infinite}
@keyframes shake{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}
.title{font-family:'Orbitron',monospace;font-size:32px;font-weight:900;color:#ef4444;text-shadow:0 0 30px rgba(239,68,68,.6);margin-bottom:8px;animation:pulse-text 1s infinite}
@keyframes pulse-text{0%,100%{opacity:1}50%{opacity:.65}}
.sub{font-size:18px;color:rgba(255,255,255,.45);margin-bottom:24px}
.timer{font-family:'Orbitron',monospace;font-size:64px;font-weight:900;color:#ef4444;text-shadow:0 0 40px rgba(239,68,68,.8);margin:16px 0}
.msg{font-size:16px;color:rgba(255,255,255,.3);letter-spacing:.5px}
.pcb{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);font-size:11px;color:rgba(255,255,255,.12);letter-spacing:1px}
</style></head><body>
<div class="wrap">
  <div class="icon">⚠️</div>
  <div class="title">TIME RUNNING OUT</div>
  <div class="sub">Your session is ending soon</div>
  <div class="timer" id="t">--:--</div>
  <div class="msg">Ask the manager to add more time</div>
</div>
<div class="pcb">PC-0${DEVICE_ID}</div>
<script>
let s=${secondsLeft};
function fmt(x){return[Math.floor(x/60),x%60].map(v=>String(v).padStart(2,"0")).join(":")}
document.getElementById("t").textContent=fmt(s);
setInterval(()=>{if(s>0){s--;document.getElementById("t").textContent=fmt(s);}},1000);
</script>
</body></html>`;

  warningWin = makeFullWin({ focusable: true });
  warningWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  warningWin.on("close", e => e.preventDefault());
  warningWin.on("blur", () => setTimeout(() => {
    if (warningWin && !warningWin.isDestroyed()) { warningWin.setAlwaysOnTop(true,"screen-saver",1); warningWin.focus(); }
  }, 100));
}
function destroyWarning() { destroyWin(warningWin); warningWin = null; }

// ── Shutdown overlay ──────────────────────────────────────────────────────────
function showShutdownWindow(pc) {
  if (shutdownWin && !shutdownWin.isDestroyed()) return;
  destroyWarning();
  hideCountdownBar();

  const delay = settings.shutdownDelay || 30;
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
${BASE_CSS}
body{background:rgba(4,4,12,.98)}
.wrap{text-align:center;padding:50px}
.icon{font-size:64px;margin-bottom:16px}
.title{font-family:'Orbitron',monospace;font-size:28px;font-weight:900;color:#3b82f6;margin-bottom:8px}
.sub{font-size:16px;color:rgba(255,255,255,.4);margin-bottom:24px}
.count{font-family:'Orbitron',monospace;font-size:56px;font-weight:900;color:#ef4444;text-shadow:0 0 30px rgba(239,68,68,.6)}
.label{font-size:13px;color:rgba(255,255,255,.22);margin-top:8px;letter-spacing:1px}
</style></head><body>
<div class="wrap">
  <div class="icon">⏻</div>
  <div class="title">SESSION ENDED</div>
  <div class="sub">${pc.customer_name ? `Thanks for playing, ${pc.customer_name}!` : "Thanks for playing!"}</div>
  <div class="count" id="c">${delay}</div>
  <div class="label">SHUTTING DOWN IN SECONDS</div>
</div>
<script>
let s=${delay};
const el=document.getElementById("c");
const iv=setInterval(()=>{s--;el.textContent=s;if(s<=0)clearInterval(iv);},1000);
</script>
</body></html>`;

  shutdownWin = makeFullWin({ focusable: false });
  shutdownWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  shutdownWin.on("close", e => e.preventDefault());
  keepOnTop(shutdownWin);

  if (delay > 0) {
    let count = delay;
    shutdownTicker = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(shutdownTicker); shutdownTicker = null;
        try { require("child_process").execSync("shutdown /s /t 0"); } catch(e) {}
      }
    }, 1000);
  }
}

// ── Register ──────────────────────────────────────────────────────────────────
async function register() {
  const pc = await fbGet(`pcs/${DEVICE_ID}`);
  if (pc) {
    await fbPatch(`pcs/${DEVICE_ID}`, { status: "online", shutdown_command: null });
    lastStatus = pc.status === "active" ? "active" : "online";
    currentPCData = pc;
    console.log(`✅ PC-0${DEVICE_ID} registered`);
  } else {
    console.error(`❌ PC-0${DEVICE_ID} not found in Firebase`);
  }
  const s = await fbGet("settings");
  if (s) settings = { ...settings, ...s };
}

// ── Poll loop — runs every 1.5s ───────────────────────────────────────────────
async function pollStatus() {
  const [pc, s] = await Promise.all([
    fbGet(`pcs/${DEVICE_ID}`),
    fbGet("settings"),
  ]);
  if (!pc) return;
  if (s) settings = { ...settings, ...s };
  currentPCData = pc;

  const status      = pc.status;
  const timeLeft    = Math.floor(pc.time_remaining || 0);
  const isPaused    = !!pc.is_paused;
  const shutdownCmd = pc.shutdown_command;
  const WARNING_AT  = settings.warningAt || 300;
  const sessDur     = pc.session_duration || 0;

  updateTray(status, timeLeft);

  // Manual shutdown command from manager
  if (shutdownCmd === "shutdown" && lastShutdownCmd !== "shutdown") {
    lastShutdownCmd = "shutdown";
    await fbPatch(`pcs/${DEVICE_ID}`, { shutdown_command: null });
    showShutdownWindow(pc);
    return;
  }

  // ── Active session ─────────────────────────────────────────────────────────
  if (status === "active" && timeLeft > 0) {
    hideScreensaver();

    // KEY FIX: always call showCountdownBar with the latest Firebase values.
    // If the bar already exists, this sends an IPC update with the corrected
    // time_remaining — so add/reduce time instantly shows on the bar.
    showCountdownBar(timeLeft, isPaused, pc.customer_name, sessDur);

    // Dismiss warning if time was extended
    if (warningShown && timeLeft > WARNING_AT) {
      warningShown = false;
      destroyWarning();
    }
  }

  // ── Idle / Offline ─────────────────────────────────────────────────────────
  if ((status === "online" || status === "offline") && lastStatus !== null && lastStatus !== "active") {
    if (!screensaverWin || screensaverWin.isDestroyed()) {
      setTimeout(() => showScreensaver(), 600);
    }
  }

  // ── Low-time warning ────────────────────────────────────────────────────────
  if (status === "active" && !isPaused && !warningShown && timeLeft > 0 && timeLeft <= WARNING_AT) {
    warningShown = true;
    showWarningWindow(timeLeft);
  }

  // ── Session ended by manager ────────────────────────────────────────────────
  if (lastStatus === "active" && status !== "active") {
    hideCountdownBar();
    showShutdownWindow(pc);
  }

  // ── Timer expired ───────────────────────────────────────────────────────────
  if (status === "active" && !isPaused && timeLeft <= 0 && lastTimeLeft > 0) {
    hideCountdownBar();
    const saved = { ...pc };
    await fbPatch(`pcs/${DEVICE_ID}`, {
      status: "online", time_remaining: 0,
      session_start: null, is_paused: false, customer_name: "",
    });
    showShutdownWindow(saved);
  }

  // ── New session started ─────────────────────────────────────────────────────
  if (status === "active" && timeLeft > 0 && lastStatus !== "active") {
    warningShown = false; lastShutdownCmd = null;
    destroyWarning();
    destroyWin(shutdownWin); shutdownWin = null;
    if (shutdownTicker) { clearInterval(shutdownTicker); shutdownTicker = null; }

    const cafeName = (s || settings).cafeeName || "Mario Gaming Café";
    const welcome  = pc.welcome_overlay;
    if (welcome && welcome.show) {
      showWelcomeOverlay(welcome.customer_name || "", welcome.total_minutes || 0, cafeName);
      await fbPatch(`pcs/${DEVICE_ID}`, { welcome_overlay: null });
    } else {
      showWelcomeOverlay(pc.customer_name || "", Math.max(1, Math.round(timeLeft / 60)), cafeName);
    }
  }

  lastStatus   = status;
  lastTimeLeft = timeLeft;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (process.platform === "win32") app.setAppUserModelId("com.mariogaming.client");

  // ── Auto-start on Windows login ────────────────────────────────────────────
  // Uses Electron's built-in registry method — works correctly with packaged EXEs.
  // openAsHidden: true launches minimised/backgrounded so the screensaver overlay
  // is the first thing the customer sees, not a flash of a normal window.
  if (process.platform === "win32") {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      path: process.execPath,         // always points to the packaged .exe
      args: [],
    });
  }

  setupTray();
  await register();

  // ── Initial screen decision (boot-time lock) ────────────────────────────────
  // Re-read Firebase fresh after register() so we have the latest status.
  // If the PC is not in an active paid session → block immediately with screensaver.
  // This means the customer sees the lock screen from the very first frame.
  const initPc = await fbGet(`pcs/${DEVICE_ID}`);
  if (!initPc || initPc.status !== "active") {
    showScreensaver();
  } else {
    showCountdownBar(
      Math.floor(initPc.time_remaining || 0),
      !!initPc.is_paused,
      initPc.customer_name,
      initPc.session_duration,
    );
  }

  // Start the polling loop — handles all status transitions from here on.
  setInterval(pollStatus, POLL_INTERVAL);
});

// Keep the app alive even if every BrowserWindow is closed/destroyed.
// This is safe because overlays prevent the customer from closing windows anyway.
app.on("window-all-closed", () => { /* intentionally empty — do not quit */ });

// Block accidental/OS-triggered quits (e.g. Task Scheduler end-task, Squirrel
// update signals, etc.).  Only allow quit when WE set isQuitting = true first.
app.on("before-quit", e => {
  if (!isQuitting) e.preventDefault();
});