const { app, BrowserWindow, Menu, shell, dialog, Tray, nativeImage } = require("electron");
const path = require("path");

// ── Config ─────────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development" || process.argv.includes("--dev");
const WIDTH  = 1380;
const HEIGHT = 860;

let mainWindow = null;
let tray       = null;

// ── Window ─────────────────────────────────────────────────────────────────────
function createWindow() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");

  mainWindow = new BrowserWindow({
    width:    WIDTH,
    height:   HEIGHT,
    minWidth: 960,
    minHeight: 640,
    title:    "Mario Gaming Café — Manager",
    icon:     iconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      webSecurity: false,
    },
    backgroundColor: "#0a0e1a",
    show: false,
    titleBarStyle: "default",
  });

  // Allow Firebase + Google Fonts network requests in Electron
  mainWindow.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, cb) => cb(true));

  // In production, load the bundled React app
  // The build is placed at ../manager/build by electron-builder extraFiles
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    // Try packed path first, then dev path
    // When installed via NSIS: manager-build sits next to the exe (extraFiles -> app root)
    // __dirname inside asar = app.asar, so we go up to the actual install folder
    const exeDir    = path.dirname(process.execPath);
    const p1 = path.join(exeDir, "manager-build", "index.html");              // installed EXE
    const p2 = path.join(process.resourcesPath, "manager-build", "index.html"); // packed asar fallback
    const p3 = path.join(__dirname, "..", "manager", "build", "index.html");    // dev fallback

    const loadPath = [p1, p2, p3].find(p => require("fs").existsSync(p));

    if (!loadPath) {
      // Show a helpful error instead of blank screen
      mainWindow.loadURL("data:text/html,<h2 style='font-family:sans-serif;color:#ff6b6b;padding:40px'>" +
        "Build not found!<br><small>Run: npm run build in the manager/ folder first, then rebuild the EXE.</small></h2>");
    } else {
      mainWindow.loadFile(loadPath);
    }
  }

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Minimize to tray instead of closing
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          iconType: "info",
          title:    "Mario Gaming Café",
          content:  "Manager is still running in the system tray.",
        });
      }
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ── Tray ───────────────────────────────────────────────────────────────────────
function createTray() {
  const iconPath = path.join(__dirname, "assets", "icon.ico");
  tray = new Tray(iconPath);
  tray.setToolTip("Mario Gaming Café — Manager");

  const menu = Menu.buildFromTemplate([
    { label: "🎮 Mario Gaming Café", enabled: false },
    { type: "separator" },
    {
      label: "Open Manager",
      click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
        else createWindow();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("double-click", () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

// ── Menu ───────────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: "App",
      submenu: [
        { label: "🎮 Mario Gaming Café", enabled: false },
        { type: "separator" },
        { label: "Reload",           accelerator: "CmdOrCtrl+R",    click: () => mainWindow?.reload() },
        { label: "Toggle Fullscreen",accelerator: "F11",             click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen()) },
        { type: "separator" },
        { label: "Minimize to Tray",  click: () => mainWindow?.hide() },
        { type: "separator" },
        { label: "Quit",             accelerator: "CmdOrCtrl+Q",
          click: () => { app.isQuitting = true; app.quit(); } },
      ],
    },
    {
      label: "View",
      submenu: [
        { label: "Dashboard",        accelerator: "CmdOrCtrl+1", click: () => mainWindow?.webContents.executeJavaScript("window.__setTab&&window.__setTab('dashboard')") },
        { label: "Canteen",          accelerator: "CmdOrCtrl+2", click: () => mainWindow?.webContents.executeJavaScript("window.__setTab&&window.__setTab('canteen')") },
        { label: "Sales",            accelerator: "CmdOrCtrl+3", click: () => mainWindow?.webContents.executeJavaScript("window.__setTab&&window.__setTab('sales')") },
        { label: "Session History",  accelerator: "CmdOrCtrl+4", click: () => mainWindow?.webContents.executeJavaScript("window.__setTab&&window.__setTab('history')") },
        { label: "Dues",             accelerator: "CmdOrCtrl+5", click: () => mainWindow?.webContents.executeJavaScript("window.__setTab&&window.__setTab('dues')") },
        { type: "separator" },
        { label: "Zoom In",  accelerator: "CmdOrCtrl+Plus", click: () => { const z=mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor(Math.min(z+.1,2)); }},
        { label: "Zoom Out", accelerator: "CmdOrCtrl+-",    click: () => { const z=mainWindow?.webContents.getZoomFactor(); mainWindow?.webContents.setZoomFactor(Math.max(z-.1,.5)); }},
        { label: "Reset Zoom",accelerator:"CmdOrCtrl+0",    click: () => mainWindow?.webContents.setZoomFactor(1) },
      ],
    },
    {
      label: "Help",
      submenu: [
        { label: "About", click: () => {
          dialog.showMessageBox(mainWindow, {
            type: "info", title: "Mario Gaming Café",
            message: "Mario Gaming Café — Manager v1.0",
            detail: "Built with Electron + React + Firebase\nPC & PS5 Session Management",
            buttons: ["OK"],
          });
        }},
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App lifecycle ──────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  app.setAppUserModelId("com.mariogaming.manager");
  createWindow();
  createTray();
  buildMenu();
});

app.on("window-all-closed", () => {
  // Don't quit — keep running in tray
});

app.on("activate", () => {
  if (mainWindow) mainWindow.show();
  else createWindow();
});

app.on("web-contents-created", (_, contents) => {
  contents.on("will-navigate", (e, url) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("file://")) e.preventDefault();
  });
});