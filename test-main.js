"use strict";
const electron = require("electron");
const path = require("path");
const url = require("url");
const child_process = require("child_process");
const initSqlJs = require("sql.js");
const fs = require("fs");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
let db = null;
let dbPath = "";
function saveToFile() {
  if (!db || !dbPath) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}
async function initDatabase() {
  if (db) return db;
  dbPath = path.join(electron.app.getPath("userData"), "app.db");
  console.log("[Database] Initializing database at:", dbPath);
  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
  db.run("PRAGMA foreign_keys = ON");
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  db.run(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
    ["app_version", "0.0.0"]
  );
  db.run(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
    ["theme", "light"]
  );
  saveToFile();
  console.log("[Database] Initialization complete");
  return db;
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDatabase() first.");
  }
  return db;
}
function closeDatabase() {
  if (db) {
    saveToFile();
    db.close();
    db = null;
    console.log("[Database] Connection closed");
  }
}
function getSetting(key) {
  const database = getDb();
  const stmt = database.prepare("SELECT value FROM settings WHERE key = ?");
  stmt.bind([key]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.value;
  }
  stmt.free();
  return void 0;
}
function setSetting(key, value) {
  const database = getDb();
  database.run(
    "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
    [key, value]
  );
  saveToFile();
}
function deleteSetting(key) {
  const database = getDb();
  database.run("DELETE FROM settings WHERE key = ?", [key]);
  const changes = database.getRowsModified();
  saveToFile();
  return changes > 0;
}
function getAllSettings() {
  const database = getDb();
  const results = database.exec("SELECT key, value FROM settings");
  const settings = {};
  if (results.length > 0) {
    const { columns, values } = results[0];
    const keyIdx = columns.indexOf("key");
    const valueIdx = columns.indexOf("value");
    for (const row of values) {
      settings[row[keyIdx]] = row[valueIdx];
    }
  }
  return settings;
}
const __dirname$1 = path.dirname(url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href));
const VITE_DEV_PORT = process.env.VITE_DEV_SERVER_PORT || "5173";
const BACKEND_PORT = process.env.PORT || "3001";
const VITE_DEV_URL = `http://localhost:${VITE_DEV_PORT}`;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
let mainWindow = null;
const floatingWindows = /* @__PURE__ */ new Map();
let backendProcess = null;
function isDev() {
  return !electron.app.isPackaged;
}
function getProjectRoot() {
  if (isDev()) {
    return path.resolve(__dirname$1, "..");
  }
  return electron.app.getAppPath();
}
function startBackend() {
  var _a, _b;
  const projectRoot = getProjectRoot();
  if (isDev()) {
    const backendDir = path.join(projectRoot, "agent-backend");
    console.log("[Main] 寮€鍙戞ā寮忓惎鍔ㄥ悗绔?", backendDir);
    backendProcess = child_process.spawn("npx", ["tsx", "src/index.ts"], {
      cwd: backendDir,
      shell: true,
      stdio: "pipe"
    });
  } else {
    const backendDir = path.join(process.resourcesPath, "agent-backend");
    console.log("[Main] 鐢熶骇妯″紡鍚姩鍚庣:", backendDir);
    backendProcess = child_process.spawn(process.execPath, [path.join(backendDir, "dist", "index.js")], {
      cwd: backendDir,
      stdio: "pipe",
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    });
  }
  (_a = backendProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
    console.log(`[Backend] ${data.toString().trim()}`);
  });
  (_b = backendProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
    console.error(`[Backend] ${data.toString().trim()}`);
  });
  backendProcess.on("exit", (code) => {
    console.log(`[Main] 鍚庣杩涚▼閫€鍑? code=${code}`);
    backendProcess = null;
  });
}
function stopBackend() {
  if (backendProcess) {
    console.log("[Main] 姝ｅ湪鍏抽棴鍚庣...");
    backendProcess.kill("SIGTERM");
    backendProcess = null;
  }
}
function createMainWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: "Agent UI",
    show: false
    // 鍏堥殣钘忥紝ready-to-show 鏃跺啀鏄剧ず
  });
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  mainWindow.on("focus", () => {
    mainWindow == null ? void 0 : mainWindow.webContents.send("main-window:focus");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  if (isDev()) {
    mainWindow.loadURL(VITE_DEV_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
}
function registerIpcHandlers() {
  electron.ipcMain.handle("settings:get", (_event, key) => {
    return getSetting(key);
  });
  electron.ipcMain.handle("settings:set", (_event, key, value) => {
    setSetting(key, value);
  });
  electron.ipcMain.handle("settings:delete", (_event, key) => {
    return deleteSetting(key);
  });
  electron.ipcMain.handle("settings:getAll", () => {
    return getAllSettings();
  });
  electron.ipcMain.handle("floating:open", (_event, specName) => {
    const existing = floatingWindows.get(specName);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return;
    }
    const url2 = isDev() ? `${VITE_DEV_URL}?floating=${encodeURIComponent(specName)}` : `file://${path.join(__dirname$1, "../dist/index.html")}?floating=${encodeURIComponent(specName)}`;
    const win = new electron.BrowserWindow({
      width: 420,
      height: 360,
      minWidth: 260,
      minHeight: 200,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: true,
      alwaysOnTop: false,
      webPreferences: {
        preload: path.join(__dirname$1, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      },
      title: specName
    });
    win.loadURL(url2);
    win.on("closed", () => {
      floatingWindows.delete(specName);
      mainWindow == null ? void 0 : mainWindow.webContents.send("floating:closed", specName);
    });
    floatingWindows.set(specName, win);
  });
  electron.ipcMain.on("floating:close-self", (event) => {
    const win = electron.BrowserWindow.fromWebContents(event.sender);
    win == null ? void 0 : win.close();
  });
  electron.ipcMain.on("app:quit", async () => {
    try {
      await fetch(`${BACKEND_URL}/api/shutdown`, { method: "POST" });
    } catch {
    }
    electron.app.quit();
  });
  electron.ipcMain.on("window:minimize", () => {
    mainWindow == null ? void 0 : mainWindow.minimize();
  });
  electron.ipcMain.on("window:maximize-toggle", () => {
    if (mainWindow == null ? void 0 : mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
  });
  electron.ipcMain.on("window:move-by", (_event, deltaX, deltaY) => {
    const win = electron.BrowserWindow.fromWebContents(_event.sender);
    if (win) {
      const [x, y] = win.getPosition();
      win.setPosition(x + deltaX, y + deltaY);
    }
  });
  electron.ipcMain.handle("window:is-maximized", () => {
    return (mainWindow == null ? void 0 : mainWindow.isMaximized()) ?? false;
  });
}
console.log('electron type:', typeof electron); console.log(Object.keys(electron).slice(0,5).join(', ')); electron.app.whenReady().then(async () => {
  await initDatabase();
  startBackend();
  registerIpcHandlers();
  createMainWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  closeDatabase();
  stopBackend();
});

