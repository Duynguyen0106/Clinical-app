import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = (process.env.TREOW_APP_URL ?? "https://app.treow.clinic").replace(
  /\/$/,
  "",
);

const config = {
  appId: "clinic.treow.app",
  appName: "Treow Clinic",
  webDir: "www",
  server: {
    url: appUrl,
    allowNavigation: [
      appUrl.replace(/^https?:\/\//, ""),
      "localhost",
      "*.vercel.app",
      "*.treow.clinic",
    ],
    cleartext: appUrl.startsWith("http://"),
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#EEF2EC",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#1E3F37",
    },
  },
  android: { backgroundColor: "#EEF2EC" },
  ios: {
    contentInset: "automatic",
    backgroundColor: "#EEF2EC",
    scheme: "Treow Clinic",
  },
};

writeFileSync(join(root, "capacitor.config.json"), JSON.stringify(config, null, 2) + "\n");
console.log(`Wrote capacitor.config.json → ${appUrl}`);
