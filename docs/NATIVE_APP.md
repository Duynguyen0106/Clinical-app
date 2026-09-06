# Treow Clinic — native downloadable apps

People can **download and install** Treow via:

| Platform | Package | How users get it |
|----------|---------|------------------|
| **Windows / macOS / Linux** | Electron desktop shell (`native/desktop`) | `.exe` / `.dmg` / `.AppImage` from GitHub Releases |
| **Android** | Capacitor (`native/`) | Google Play (or sideload APK for pilot) |
| **iOS** | Capacitor (`native/`) | App Store (needs Apple Developer + Mac) |

There is **no separate clinical rewrite**. Native apps are thin shells around your deployed HTTPS Treow site (`APP_BASE_URL`). All clinic features (recording, notes, booking, money) stay in `web/`.

> Ship the web/PWA deploy first (`docs/DEPLOY.md`). Native binaries only work when that URL is live.

---

## 1. Desktop installer (fastest “download and install”)

From a laptop with Node 20+:

```bash
cd native/desktop
npm install

# Point at your deployed clinic
export TREOW_APP_URL="https://YOUR-APP.vercel.app"

# Dev window
npm run dev

# Build installers into native/desktop/release/
npm run dist          # current OS
npm run dist:win      # Windows NSIS .exe
npm run dist:mac      # macOS .dmg (Mac + signing for distribution)
npm run dist:linux    # AppImage + .deb
```

Give pilot clinics the file from `release/` (or attach to a GitHub Release).

**Microphone:** Electron requests media permission so Visit recording works.

**Signing (production):**
- macOS: Apple Developer ID + notarization (`electron-builder` env docs)
- Windows: code-signing certificate (optional for early pilots; SmartScreen warns if unsigned)

---

## 2. Android / iOS (store apps)

```bash
cd native
npm install
export TREOW_APP_URL="https://YOUR-APP.vercel.app"
npm run sync
```

### Android

Needs Android Studio + SDK on the build machine. This repo already includes `native/android/`.

```bash
npm run open:android   # Android Studio → Run / Generate Signed Bundle
```

Play Console: create app **Treow Clinic**, upload AAB, complete content rating + privacy policy URL (`/privacy` on your deploy).

### iOS

Needs a Mac with Xcode + Apple Developer Program ($99/yr).

```bash
npm run add:ios        # once, on a Mac
npm run open:ios       # Xcode → Archive → App Store Connect
```

Enable **Microphone** usage description in Xcode / `Info.plist` before TestFlight.

---

## 3. Environment

| Variable | Where | Purpose |
|----------|--------|---------|
| `TREOW_APP_URL` | Native build env | HTTPS origin of Treow web (no trailing slash) |
| `APP_BASE_URL` | Web deploy | Must match what the shell loads (cookies, links) |

Never point store builds at `localhost`. Use production or a stable staging URL.

---

## 4. What is still “web”

- Clinic logic, Prisma, AI organise, booking, RBAC — all in `web/`
- Updates to clinical features ship by **redeploying web**; most shell builds do not need a new store binary unless you change native permissions, icons, or splash
- PWA “Add to Home Screen” remains available for clinics that prefer no store install

---

## 5. Pilot recommendation

1. Deploy web to Vercel/Neon (`docs/DEPLOY.md`)
2. Build **desktop** installers for the owner’s Windows/Mac PC this week
3. Add **Android** internal testing track when you’re ready for phone install without Safari quirks
4. Schedule **iOS** when you have a Mac + Apple Developer account

Store review for medical-adjacent apps can ask for privacy disclosures — keep `/privacy` accurate and AI on `mock` until DPAs are signed (`docs/UK_COMPLIANCE.md`).
