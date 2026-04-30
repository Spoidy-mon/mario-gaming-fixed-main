# 🎮 Mario Gaming Café — Building & Installing the EXE Files

## Overview
There are **two separate apps** to build and install:

| App | Who uses it | What it does |
|-----|-------------|--------------|
| **Manager** | Café owner/manager laptop | Full dashboard — sessions, sales, dues, canteen |
| **Client** | Every gaming PC | Runs hidden in background, shows countdown bar + overlays |

---

## Prerequisites (install these once)

1. **Node.js** — download from https://nodejs.org (LTS version)
2. **Git** — optional but useful

---

## STEP 1 — Build the Manager React app

The manager is a React web app that gets bundled inside Electron.

```bash
# In the manager/ folder:
cd manager
npm install
npm run build
```

This creates a `manager/build/` folder with the compiled app.

---

## STEP 2 — Build the Manager EXE

```bash
# In the manager-electron/ folder:
cd manager-electron
npm install
npm run build
```

Output: `manager-electron/dist/Mario Gaming Café Setup.exe`

**Install it** on the manager's laptop — double-click the Setup.exe, it installs normally and creates a **desktop shortcut**.

### How the Manager app works after install:
- Open it from the desktop shortcut anytime
- Closing the window **minimizes to system tray** (bottom-right of taskbar)
- Double-click the tray icon to reopen
- Right-click tray → Quit to fully exit

---

## STEP 3 — Set the PC ID for each client

Before building, **edit** `computer-client/main.js` line 6:

```js
const DEVICE_ID = 1;   // ← Change this for each PC
```

- PC-01 → `DEVICE_ID = 1`
- PC-02 → `DEVICE_ID = 2`
- etc.

Also update the Firebase URL on line 7 if needed.

---

## STEP 4 — Build the Client EXE

```bash
# In the computer-client/ folder:
cd computer-client
npm install
npm run build
```

Output: `computer-client/dist/Mario Gaming Client Setup.exe`

### Build one EXE per PC (different DEVICE_ID)
Repeat Step 3 + 4 for each PC, changing DEVICE_ID each time.

---

## STEP 5 — Install the Client on each gaming PC

1. Copy the `Mario Gaming Client Setup.exe` to the PC
2. **Run as Administrator** (right-click → Run as administrator)
3. It installs silently and **automatically starts**

### What happens after install:
- The client starts **automatically on every Windows login** (added to startup)
- It shows **no window, no taskbar entry** — just a tiny tray icon (bottom-right)
- When a session is active, a **slim countdown bar appears at the top of the screen**
- The bar shows: ⏱ time remaining + player name — it **passes through mouse clicks** so players can still click normally
- When time is low (< 5 min), a full-screen warning overlay appears
- When session ends, a shutdown countdown overlay appears

---

## STEP 6 — Quick verification

On the client PC, after install:
1. Look for the tray icon in the bottom-right taskbar area
2. Right-click it → shows PC-0X status
3. Start a session from the manager → countdown bar appears at top of screen instantly

---

## Folder structure reference

```
mario-gaming-fixed/
├── manager/              ← React source (npm run build here first)
├── manager-electron/     ← Electron wrapper for manager
│   └── dist/             ← Output EXE goes here after npm run build
└── computer-client/      ← Client app (one build per PC)
    └── dist/             ← Output EXE goes here after npm run build
```

---

## Changing the countdown bar position

By default the bar sits at the **top** of the screen. To move it to the **bottom**, edit `computer-client/main.js`:

Find this line (around line 115):
```js
y: d.y,   // top of screen
```

Change to:
```js
y: d.y + d.h - BAR_HEIGHT,   // bottom of screen
```

---

## Troubleshooting

**Client doesn't show countdown bar:**
- Check DEVICE_ID matches the PC number in Firebase
- Make sure the Firebase URL is correct

**Client doesn't auto-start on login:**
- Run the installer as Administrator
- Check Windows Startup folder: `Win+R` → `shell:startup`
- Or check: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Run`

**Manager can't find the React build:**
- Make sure you ran `npm run build` in the `manager/` folder first
- The `manager/build/` folder must exist before building the Electron EXE

**"Cannot find module" error on client:**
- Run `npm install` in `computer-client/` folder again

---

## Updating the app

1. Make code changes
2. Re-run `npm run build` in the relevant folder(s)
3. Re-run `npm run build` in the electron folder
4. Distribute the new Setup.exe — reinstall on each machine
