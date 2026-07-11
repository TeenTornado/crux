// Crux desktop shell — local-first by construction.
//
// Production: spawns the Next.js standalone server (bundled at build time)
// on a local port and points a BrowserWindow at it. All API routes run on
// the user's machine; extraction/reconciliation/experiment talk to Ollama at
// 127.0.0.1:11434. No API key is bundled: without one Crux runs in demo +
// on-device Local Mode; a user can add a key via the env file (see below).
//
// Dev: `ELECTRON_DEV=1 npx electron .` attaches to the running `next dev`.
const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("child_process");
const { existsSync, readFileSync } = require("fs");
const path = require("path");
const net = require("net");

const DEV = process.env.ELECTRON_DEV === "1";
const SMOKE = process.env.ELECTRON_SMOKE === "1"; // auto-quit test mode
const DEV_URL = "http://localhost:3000";
const PORT = 34117; // fixed local port for the bundled server

let serverProc = null;

/** Optional user config: ~/Library/Application Support/Crux/crux.env
 *  (KEY=value lines, e.g. GEMINI_API_KEY=... to enable the cloud tiers). */
function userEnv() {
  try {
    const p = path.join(app.getPath("userData"), "crux.env");
    if (!existsSync(p)) return {};
    return Object.fromEntries(
      readFileSync(p, "utf8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
    );
  } catch {
    return {};
  }
}

function waitForPort(port, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tryOnce = () => {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => {
        sock.destroy();
        resolve();
      });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - t0 > timeoutMs) reject(new Error("server start timeout"));
        else setTimeout(tryOnce, 250);
      });
    };
    tryOnce();
  });
}

function startServer() {
  // electron-builder ships the app dir unpacked (asar disabled) so the
  // standalone server can be executed directly.
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..");
  // Packaged: the standalone tree is staged at desktop-server/ (dot-dirs are
  // silently excluded by electron-builder file globs). Dev falls back to .next.
  const staged = path.join(appRoot, "desktop-server", "server.js");
  const serverJs = existsSync(staged)
    ? staged
    : path.join(appRoot, ".next", "standalone", "server.js");
  if (!existsSync(serverJs)) {
    throw new Error(
      `standalone server missing at ${serverJs} — run \`npm run electron:build\``
    );
  }
  // ELECTRON_RUN_AS_NODE turns the Electron binary into plain Node, so the
  // packaged app needs no system Node installed.
  serverProc = spawn(process.execPath, [serverJs], {
    env: {
      ...process.env,
      ...userEnv(),
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      HOSTNAME: "127.0.0.1",
      NODE_ENV: "production",
      // Desktop default: the on-device story. Cloud upgrades via crux.env.
      RECONCILE_BACKEND: process.env.RECONCILE_BACKEND || userEnv().RECONCILE_BACKEND || "local",
    },
    cwd: path.dirname(serverJs),
    stdio: "inherit",
  });
  serverProc.on("exit", (code) => {
    serverProc = null;
    if (code && code !== 0) console.error(`[crux] server exited ${code}`);
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#14181C", // ink — no white flash
    title: "Crux",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // External links (GitHub, arXiv) open in the system browser, not the shell.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const url = DEV ? DEV_URL : `http://127.0.0.1:${PORT}`;
  if (!DEV) {
    startServer();
    await waitForPort(PORT);
  }
  await win.loadURL(`${url}/app`);

  if (SMOKE) {
    console.log("[crux] smoke: window loaded OK");
    setTimeout(() => app.quit(), 1500);
  }
}

app.whenReady().then(createWindow).catch((err) => {
  console.error("[crux] fatal:", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" || SMOKE) app.quit();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("quit", () => {
  if (serverProc) serverProc.kill();
});
