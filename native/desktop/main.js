const { app, BrowserWindow, shell, session } = require("electron");
const path = require("path");

/**
 * Desktop shell for Treow Clinic.
 * Loads the hosted Next.js app (same product as the web / PWA).
 *
 * Override URL:
 *   TREOW_APP_URL=https://your-deploy.vercel.app npm run dev
 */
const APP_URL = (
  process.env.TREOW_APP_URL ||
  process.env.APP_BASE_URL ||
  "https://app.treow.clinic"
).replace(/\/$/, "");

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Treow Clinic",
    backgroundColor: "#EEF2EC",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(`${APP_URL}/login`);

  win.webContents.setWindowOpenHandler(({ url }) => {
    // External links (manage booking mailto, etc.) open in the OS browser
    try {
      const target = new URL(url);
      const appHost = new URL(APP_URL).host;
      if (target.host !== appHost) {
        void shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {
      void shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });
}

app.whenReady().then(() => {
  // Mic / media permission for visit recording
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      const allow = ["media", "mediaKeySystem", "notifications"].includes(
        permission,
      );
      callback(allow);
    },
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
