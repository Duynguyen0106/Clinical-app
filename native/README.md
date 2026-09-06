# Treow native shells

Installable **desktop** (Electron) and **mobile** (Capacitor) apps that open your deployed Treow Clinic website.

Full guide: [`docs/NATIVE_APP.md`](../docs/NATIVE_APP.md)

## Quick start

```bash
# 1) Deploy web first — note the HTTPS URL

# 2) Desktop installer
cd desktop
npm install
TREOW_APP_URL="https://YOUR-APP.vercel.app" npm run dist

# 3) Android / iOS project
cd ..
npm install
TREOW_APP_URL="https://YOUR-APP.vercel.app" npm run sync
npm run open:android   # Android Studio
# on a Mac: npm run add:ios && npm run open:ios
```
