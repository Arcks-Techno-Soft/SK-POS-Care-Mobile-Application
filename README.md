# SK-POS Support — Mobile App

Internal Android app for SK-POS Support staff — the mobile companion to the
ArcksCare web app. It is **not** customer-facing: customers still raise tickets
on the web. This app is for the team that works those tickets.

Built with Expo Router (SDK 54) + React Native + TypeScript.

## Roles

The app mirrors the three staff roles from the backend:

| Role | In app | Can do |
| --- | --- | --- |
| `OWNER` | Owner | Everything — plus Analytics, staff accounts, and the sub-engineer roster |
| `MANAGER` | Admin | Triage, assign, manage installations, charges, warranty |
| `ENGINEER` | Engineer | Their assigned tickets/installations — accept, work notes, resolve, sign-off |

Tabs adapt to the role: **Analytics** and the **Workspace** settings only appear for Owners.

## Passcode login

Because the FastAPI backend only knows username/password, passcode login is a
client-side convenience layer:

1. Sign in once with your staff username + password.
2. Set a 4-digit passcode (and optionally enable fingerprint/face unlock).
3. On later launches, the passcode (or biometric) unlocks credentials cached in
   the Android Keystore (`expo-secure-store`) and the app re-authenticates
   silently.

The app auto-locks after being backgrounded for 90s. "Sign out" wipes the
account from the device. One account per device — switching users means signing
out and back in.

## Getting started

```bash
npm install
npx expo start
```

Then press `a` to open the Android emulator, or scan the QR code with
[Expo Go](https://expo.dev/go) on a physical phone.

### Pointing the app at the backend

The backend URL is **editable in the app** — tap *Backend server* on the login
screen. No rebuild is needed to change it.

| Running the app on… | Use this server URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:8000` (the default; `10.0.2.2` is the emulator's alias for your computer's `localhost`) |
| A physical phone (same Wi-Fi) | `http://<your-computer-LAN-IP>:8000`, e.g. `http://192.168.1.5:8000` |
| Production | the deployed API URL |

Start the backend first (`uvicorn app.main:app --reload --port 8000` in
`ArcksCare/backend`). CORS does not apply to native apps, so no backend change
is needed.

## Project layout

```
app/
  _layout.tsx            Root — AuthProvider + status-driven routing
  index.tsx              Startup splash
  login.tsx              Username/password sign-in + server URL
  lock.tsx               Passcode / biometric unlock
  set-passcode.tsx       Create or change the passcode
  (tabs)/
    _layout.tsx          Bottom tabs (role-aware)
    tickets/             List + detail (full workflow)
    installations/       List + create + detail
    analytics/           Owner dashboard
    more/                Account, security, staff accounts, roster
components/              Shared UI (ui kit, Screen, States, SignaturePad, …)
lib/
  api.ts                 Typed API client
  auth.tsx               Auth provider — session, passcode, biometrics
  storage.ts             SecureStore + AsyncStorage
  types.ts               API data shapes
  theme.ts               Design tokens
  hooks.ts, format.ts, options.ts, images.ts, signature.ts
```

## Building an APK

For a shareable internal build, use [EAS Build](https://docs.expo.dev/build/setup/):

```bash
npm install -g eas-cli
eas build --platform android --profile preview
```

(Passcode unlock and biometrics need a real build or development build — they
are not available in the web preview.)
