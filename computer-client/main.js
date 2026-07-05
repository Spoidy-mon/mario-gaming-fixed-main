"use strict";
const { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, dialog } = require("electron");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────
const DEVICE_ID       = 9;   // ← CHANGE THIS per PC (1, 2, 3 …)
const FIREBASE_DB_URL = `https://mario-gaming-cafe-default-rtdb.asia-southeast1.firebasedatabase.app`;
const FIREBASE_API_KEY         = "AIzaSyD9yPXFS3bKUvnabbxnOHAaXz8lc9venUg";
const FIREBASE_AUTH_DOMAIN     = "mario-gaming-cafe.firebaseapp.com";
const FIREBASE_PROJECT_ID      = "mario-gaming-cafe";
const FIREBASE_STORAGE_BUCKET  = "mario-gaming-cafe.firebasestorage.app";
const FIREBASE_MESSAGING_ID    = "655135892566";
const FIREBASE_APP_ID          = "1:655135892566:web:21c88f6d05c67383d607f7";
const FIREBASE_MEASUREMENT_ID  = "G-32WWGZMSM5";
const POLL_INTERVAL   = 1500;

// ── State ─────────────────────────────────────────────────────────────────────
let tray            = null;
let screensaverWin  = null;
let warningWin      = null;
let shutdownWin     = null;
let welcomeWin      = null;
let shutdownTicker  = null;
let lastStatus      = null;
let lastTimeLeft    = null;
let lastShutdownCmd = null;
let shutdownFired   = false;  // prevents epoch-expired from re-triggering every poll
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
// Server time offset — eliminates clock skew between manager and client machines
// Firebase .info/serverTimeOffset = Firebase server time - local time (ms)
let _serverOffset = 0;

function startServerOffsetSync() {
  // Poll the offset every 30s to stay accurate
  function sync() {
    fetch(`${FIREBASE_DB_URL}/.info/serverTimeOffset.json`)
      .then(r => r.json())
      .then(v => { if (typeof v === "number") _serverOffset = v; })
      .catch(() => {});
  }
  sync();
  setInterval(sync, 30000);
}

function serverNow() { return Date.now() + _serverOffset; }
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

// ── Screensaver ───────────────────────────────────────────────────────────────
const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@400;600;700&display=swap');
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
:root{--blue:#3b82f6;--green:#10b981;--gold:#f59e0b;--red:#ef4444;--bg:#050a14;--muted:rgba(255,255,255,.35)}
body{background:var(--bg);color:#fff;font-family:'Rajdhani',sans-serif;overflow:hidden;width:100vw;height:100vh;display:flex;align-items:center;justify-content:center}
`;

function showScreensaver() {
  if (screensaverWin && !screensaverWin.isDestroyed()) return;

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

// ── Countdown Overlay — bottom-right white timer ──────────────────────────────
let countdownOverlay = null;

function buildCountdownOverlayHTML(timeLeft, isPaused, sessionEndTime = 0) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;background:transparent;overflow:hidden;
  -webkit-app-region:no-drag;user-select:none;
  display:flex;align-items:flex-end;justify-content:flex-end;}
#wrap{padding:14px 20px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;}
#label{font-family:'Orbitron',monospace;font-size:11px;font-weight:700;
  letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.28);transition:color .4s;}
#timer{font-family:'Share Tech Mono',monospace;font-size:52px;font-weight:700;
  color:rgba(255,255,255,0.85);text-shadow:0 0 30px rgba(255,255,255,0.15);
  line-height:1;letter-spacing:2px;transition:color .4s,text-shadow .4s;}
#timer.low{color:#ef4444!important;
  text-shadow:0 0 20px rgba(239,68,68,0.7),0 0 60px rgba(239,68,68,0.3)!important;
  animation:pulse 1s ease-in-out infinite;}
#timer.paused{color:rgba(245,158,11,0.8)!important;
  text-shadow:0 0 20px rgba(245,158,11,0.4)!important;animation:none;}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.55}}
#dots{display:flex;gap:5px;margin-top:2px;}
.dot{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,0.18);}
.dot.on{background:rgba(255,255,255,0.6)}.dot.red{background:#ef4444}
</style></head><body>
<div id="wrap">
  <div id="label">TIME LEFT</div>
  <div id="timer">--:--:--</div>
  <div id="dots"><div class="dot" id="d0"></div><div class="dot" id="d1"></div><div class="dot" id="d2"></div></div>
</div>
<script>
let paused=${isPaused?"true":"false"};
let serverEnd=${sessionEndTime||0};
let fallback=${timeLeft};
let serverOffset=${_serverOffset||0};  // clock skew correction
const LOW=120;
const timerEl=document.getElementById("timer");
const labelEl=document.getElementById("label");
const dots=[document.getElementById("d0"),document.getElementById("d1"),document.getElementById("d2")];
let dot=0;
function sNow(){return Date.now()+serverOffset;}
function calcT(){
  if(serverEnd>0&&serverEnd>sNow()){
    const epochT=Math.round((serverEnd-sNow())/1000);
    // Trust epoch only if within 5 min of Firebase time_remaining
    if(Math.abs(epochT-fallback)<300)return Math.max(0,epochT);
  }
  return Math.max(0,fallback);
}
function fmt(s){if(!s||s<=0)return"00:00:00";return[Math.floor(s/3600),Math.floor((s%3600)/60),s%60].map(v=>String(v).padStart(2,"0")).join(":");}
function tick(){
  const t=calcT();const low=t>0&&t<=LOW;
  timerEl.textContent=fmt(t);
  timerEl.className=paused?"paused":low?"low":"";
  labelEl.textContent=paused?"PAUSED":low?"⚠ 2 MIN LEFT":"TIME LEFT";
  labelEl.style.color=paused?"rgba(245,158,11,0.5)":low?"rgba(239,68,68,0.6)":"rgba(255,255,255,0.28)";
  dot=(dot+1)%3;dots.forEach((d,i)=>{d.className="dot"+(i===dot?(low?" red":" on"):"");});
}
if(window.barApi){
  window.barApi.onUpdate(data=>{
    if(data.sessionEndTime)serverEnd=data.sessionEndTime;
    if(data.serverOffset!==undefined)serverOffset=data.serverOffset;
    fallback=data.timeLeft;paused=data.isPaused;
    tick();
  });
}
setInterval(()=>{if(!paused){fallback=Math.max(0,fallback-1);tick();}},1000);
tick();
</script></body></html>`;
}

function showCountdownOverlay(timeLeft, isPaused, sessionEndTime = 0) {
  if (countdownOverlay && !countdownOverlay.isDestroyed()) {
    countdownOverlay.webContents.send("update", {
      timeLeft, isPaused, sessionEndTime: sessionEndTime || 0,
      sessionDuration: 0, customerName: "", warningAt: 120,
    });
    return;
  }
  const d = getDisplay();
  const W = 340, H = 120;
  countdownOverlay = new BrowserWindow({
    width: W, height: H,
    x: d.x + d.w - W,
    y: d.y + d.h - H - 48,
    frame: false, transparent: true,
    alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false,
    focusable: false, hasShadow: false,
    webPreferences: {
      nodeIntegration: false, contextIsolation: true,
      preload: path.join(__dirname, "bar-preload.js"),
    },
  });
  countdownOverlay.setIgnoreMouseEvents(true, { forward: true });
  countdownOverlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buildCountdownOverlayHTML(timeLeft, isPaused, sessionEndTime))}`);
  keepOnTop(countdownOverlay);
  setInterval(() => { if (countdownOverlay && !countdownOverlay.isDestroyed()) keepOnTop(countdownOverlay); }, 2000);
}

function hideCountdownOverlay() {
  if (countdownOverlay && !countdownOverlay.isDestroyed()) countdownOverlay.close();
  countdownOverlay = null;
}

// ── Session Over overlay (Mario Gaming — no white flash, no countdown) ────────
// Called when manager ends session manually. Just shows the overlay, NO shutdown.
// Actual shutdown is ONLY triggered by timer expiry in pollStatus.
function showSessionOver(pc) {
  if (shutdownWin && !shutdownWin.isDestroyed()) return;
  destroyWarning();
  hideCountdownOverlay();

  const customerName = pc.customer_name || "";
  const marioHtml = () => `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
${BASE_CSS}
body{background:rgba(4,4,12,.98);animation:fadein .5s ease}
@keyframes fadein{from{opacity:0}to{opacity:1}}
.wrap{text-align:center;padding:60px 40px}
.logo{font-size:80px;margin-bottom:20px;animation:float 2.5s ease-in-out infinite}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
.title{font-family:'Orbitron',monospace;font-size:44px;font-weight:900;
  background:linear-gradient(135deg,#ef4444,#f59e0b);-webkit-background-clip:text;
  -webkit-text-fill-color:transparent;margin-bottom:8px}
.cafe{font-family:'Rajdhani',sans-serif;font-size:22px;color:rgba(255,255,255,.38);
  letter-spacing:3px;margin-bottom:28px}
.name{font-family:'Orbitron',monospace;font-size:28px;font-weight:700;color:#10b981;
  text-shadow:0 0 24px rgba(16,185,129,.6);margin-bottom:12px}
.ty{font-size:17px;color:rgba(255,255,255,.28);letter-spacing:.5px}
canvas{position:fixed;inset:0;pointer-events:none;z-index:-1}
</style></head><body>
<canvas id="c"></canvas>
<div class="wrap">
  <div class="logo">🎮</div>
  <div class="title">SESSION OVER</div>
  <div class="cafe">MARIO GAMING CAFÉ</div>
  ${customerName ? `<div class="name">${customerName.toUpperCase()}</div>` : ""}
  <div class="ty">Thanks for playing! See you again 👋</div>
</div>
<script>
const c=document.getElementById("c"),ctx=c.getContext("2d");
c.width=window.innerWidth;c.height=window.innerHeight;
const stars=Array.from({length:150},()=>({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.6+.3,o:Math.random(),s:Math.random()*.004+.001}));
function draw(){ctx.clearRect(0,0,c.width,c.height);stars.forEach(s=>{s.o+=s.s;if(s.o>1||s.o<0)s.s*=-1;ctx.globalAlpha=s.o;ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();});ctx.globalAlpha=1;requestAnimationFrame(draw);}
draw();
</script></body></html>`;

  shutdownWin = makeFullWin({ focusable: false });
  shutdownWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(marioHtml())}`);
  shutdownWin.on("close", e => e.preventDefault());
  keepOnTop(shutdownWin);
  // Refresh every 3s so star animation stays alive
  setInterval(() => {
    if (shutdownWin && !shutdownWin.isDestroyed()) keepOnTop(shutdownWin);
  }, 2000);
}

// Alias for legacy calls — shows overlay only, no shutdown
function showShutdownWindow(pc) { showSessionOver(pc); }

// ── Register ──────────────────────────────────────────────────────────────────
async function register() {
  const pc = await fbGet(`pcs/${DEVICE_ID}`);
  if (pc) {
    // Only reset to "online" if there is no active session running.
    // Overwriting an active session's status here causes pollStatus() to
    // immediately see lastStatus="active" + status="online" and trigger
    // the shutdown countdown on every client startup.
    if (pc.status !== "active") {
      await fbPatch(`pcs/${DEVICE_ID}`, { status: "online", shutdown_command: null });
    } else {
      // Still clear any stale shutdown command but leave status alone.
      await fbPatch(`pcs/${DEVICE_ID}`, { shutdown_command: null });
    }
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
    // Update countdown overlay (bottom-right white timer)
    showCountdownOverlay(timeLeft, isPaused, pc.session_end_time || 0);
    // Dismiss warning if time was extended
    if (warningShown && timeLeft > WARNING_AT) {
      warningShown = false;
      destroyWarning();
    }
  }

  // ── Idle / Offline ─────────────────────────────────────────────────────────
  // Don't show screensaver if the session-over overlay is active
  const sessionOverShowing = shutdownWin && !shutdownWin.isDestroyed();
  if ((status === "online" || status === "offline") && lastStatus !== null && lastStatus !== "active" && !sessionOverShowing) {
    if (!screensaverWin || screensaverWin.isDestroyed()) {
      setTimeout(() => showScreensaver(), 600);
    }
  }

  // ── Low-time warning ────────────────────────────────────────────────────────
  if (status === "active" && !isPaused && !warningShown && timeLeft > 0 && timeLeft <= WARNING_AT) {
    warningShown = true;
    showWarningWindow(timeLeft);
  }

  const endedByManager = pc.ended_by === "manager";

  // ── Session ended by manager — show overlay, NO shutdown ─────────────────
  if (lastStatus === "active" && status !== "active" && !shutdownFired && endedByManager) {
    hideCountdownOverlay();
    showSessionOver(pc);
    lastStatus = status; lastTimeLeft = timeLeft;
    return;
  }

  // ── Timer expired — show overlay AND shutdown ─────────────────────────────
    if (timerExpired) {
    shutdownFired = true;
    hideCountdownOverlay();
    const saved = { ...pc };
    await fbPatch(`pcs/${DEVICE_ID}`, {
      status: "online", time_remaining: 0,
      session_start: null, session_end_time: null,
      is_paused: false, customer_name: "",
    });
    showSessionOver(saved); // Mario overlay
    // Silently shutdown after delay — no extra overlay, no flash
    const delay = settings.shutdownDelay || 30;
    setTimeout(() => {
      try { require("child_process").execSync("shutdown /s /t 0"); } catch(e) {}
    }, delay * 1000);
  }

  // ── New session started ─────────────────────────────────────────────────────
  if (status === "active" && timeLeft > 0 && lastStatus !== "active") {
    warningShown = false; lastShutdownCmd = null; shutdownFired = false;
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
  startServerOffsetSync(); // sync clock offset with Firebase server immediately

  // ── Show screensaver IMMEDIATELY — no blank screen while Firebase loads ────
  // The screensaver is shown first so the customer always sees the lock screen
  // from the very first frame, even before Firebase has responded.
  // It will be hidden below if we find an already-active session.
  showScreensaver();

  await register();

  // ── Initial screen decision (boot-time lock) ────────────────────────────────
  // Re-read Firebase fresh after register() so we have the latest status.
  // If an active session is running, swap screensaver → countdown bar.
  // Otherwise the screensaver stays (it's already visible).
  const initPc = await fbGet(`pcs/${DEVICE_ID}`);
  if (initPc && initPc.status === "active") {
    hideScreensaver();
    showCountdownOverlay(
      Math.floor(initPc.time_remaining || 0),
      !!initPc.is_paused,
      initPc.session_end_time || 0,
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
  if (!isQuitting) { e.preventDefault(); return; }
});