# Veto Protocol

Independent VALORANT map veto companion developed by Le Sang Hiec, operating as Gdreed.

Veto Protocol application code is proprietary. Third-party dependencies and game-related names or assets remain subject to their respective licenses and ownership.

## Runtime

- Web/API: Render Web Service with PostgreSQL.
- Authentication: server-side username/password with bcrypt and JWT.
- Rooms: PostgreSQL snapshots and Socket.IO updates.
- Web client: Vite output served by the same Express service.
- Android: Capacitor 8; native builds use the Render API at `https://gdreed-draft-console.onrender.com`.
- Windows: Electron desktop wrapper; packaged `file://` builds use the same Render API.

The API host may be overridden at build time with `VITE_API_BASE_URL`. Never put database credentials, JWT secrets or other private keys in a `VITE_` variable; Vite embeds those values in client code.

## Development

Install Node.js, then run:

```powershell
npm ci
npm test
npm run dev:full
```

The API requires the variables in [.env.example](.env.example). Keep the real `.env` local and out of source control. For local API/database development, run the SQL in `database/` against PostgreSQL and use a private `DATABASE_URL` plus a random `JWT_SECRET` of at least 32 characters.

## Web Deployment

Render is configured by [render.yaml](render.yaml). The service runs `npm ci --include=dev && npm run build`, starts with `npm run start`, and exposes `/api/health` as its health check. Set secrets in Render Environment, not in this repository. The frontend and API are same-origin on Render.

## Windows Installer

```powershell
npm test
npm run build:desktop
```

Windows installer output: `installer\Veto-Protocol-1.0.0-x64-Setup.exe`.

To build both shareable installers together, run `npm run build:installers`. The outputs are:

- `installer\Veto-Protocol-1.0.0-x64-Setup.exe`
- `installer\Veto-Protocol-1.0.0-android-debug.apk`

This installer is unsigned. Windows SmartScreen may show a warning. A production-signed installer requires a code-signing certificate owned and controlled by the publisher.

## Android APK

Requirements: JDK 21, Android SDK Platform 36, Android Build Tools 36.0.0 and Platform Tools.

```powershell
npm test
npm run build
npx cap sync android
$env:JAVA_HOME = "$env:LOCALAPPDATA\Programs\Microsoft\OpenJDK\21.0.13.0.2"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
.\android\gradlew.bat -p .\android assembleDebug
```

Debug APK output: `android\app\build\outputs\apk\debug\app-debug.apk`; the build script also copies it to `installer\Veto-Protocol-1.0.0-android-debug.apk`. It is debug-signed for sideload/testing, not a Play Store release. A release APK/AAB needs a publisher-owned signing key; never commit that key or its password.

## Verification Notes

- `npm test` covers the rule engine, map dossier and local match archive.
- `npm run build` produces the web client.
- The Android debug APK has been installed and launched on an Android 16 Pixel 6 emulator.
- The emulator can reach Render `/api/health`; full sign-in/room realtime testing still requires a designated test account and a continuously running emulator.
- Google Login is intentionally not configured.
