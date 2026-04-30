# Sofire-IT CRM — Desktop App Builder

## What this produces
- **Windows**: `Sofire-IT-CRM-Setup-1.0.0.exe` (installer) + portable `.exe`
- **Mac**: `Sofire-IT-CRM-1.0.0-x64.dmg` + Apple Silicon version
- **Linux**: `Sofire-IT-CRM-1.0.0.AppImage`

---

## Prerequisites
Install **Node.js** (version 18 or later):
- Windows/Mac: https://nodejs.org → Download LTS → Install
- Verify: open Terminal/Command Prompt → type `node --version`

---

## Step 1 — Set up the folder structure

Create a folder called `sofire-crm-desktop` and arrange files like this:

```
sofire-crm-desktop/
├── main.js          ← (from this package)
├── preload.js       ← (from this package)
├── package.json     ← (from this package)
├── app/
│   └── index.html   ← Copy your CRM index.html here
└── assets/
    ├── icon.png     ← 512×512 PNG app icon
    ├── icon.ico     ← Windows icon (convert from PNG)
    └── icon.icns    ← Mac icon (convert from PNG)
```

### Create the icon files

**Option A — Use an online converter:**
1. Take your Sofire-IT logo (or any 512×512 PNG)
2. Go to https://cloudconvert.com/png-to-ico → convert to `icon.ico` (Windows)
3. Go to https://cloudconvert.com/png-to-icns → convert to `icon.icns` (Mac)
4. Save both to the `assets/` folder

**Option B — Use the placeholder** (app will still build, just uses default icon):
- Create `assets/` folder, leave it empty — builder uses defaults

---

## Step 2 — Install dependencies

Open Terminal / Command Prompt in the `sofire-crm-desktop` folder:

```bash
npm install
```

This installs Electron (~100MB) and electron-builder. Takes 1-2 minutes.

---

## Step 3 — Test it locally first

```bash
npm start
```

The CRM opens as a desktop window. Check everything works — login, invoices, Supabase sync etc.

---

## Step 4 — Build the installer

### Windows (run on Windows):
```bash
npm run build:win
```
Produces in `dist/`:
- `Sofire-IT-CRM-Setup-1.0.0.exe` — full installer with Start Menu shortcut
- `Sofire-IT-CRM-1.0.0.exe` — portable (no install needed)

### Mac (run on Mac):
```bash
npm run build:mac
```
Produces in `dist/`:
- `Sofire-IT-CRM-1.0.0-x64.dmg` — Intel Mac
- `Sofire-IT-CRM-1.0.0-arm64.dmg` — Apple Silicon (M1/M2/M3)

### Both platforms:
```bash
npm run build:all
```

---

## Step 5 — Distribute

**For yourself:** Just run the installer on your machine.

**For clients (retainer portals):**
Send them the installer. When they open it, they see the login screen with their tenant URL pre-configured (same as the web version but as a desktop app).

---

## Updating the app

When you update `index.html` (new features, bug fixes):
1. Copy the new `index.html` into the `app/` folder (replacing the old one)
2. Bump the version in `package.json` (e.g. `"version": "1.0.1"`)
3. Run `npm run build:win` / `npm run build:mac` again
4. Distribute the new installer

The app auto-syncs data via Supabase — so updating the desktop app doesn't affect anyone's data.

---

## How the data works

- **localStorage** is persisted by Electron in a dedicated profile (`persist:sofire-crm`) stored at:
  - Windows: `%APPDATA%\Sofire-IT CRM\`
  - Mac: `~/Library/Application Support/Sofire-IT CRM/`
- **Supabase sync** works exactly the same as the web version — same `/.netlify/functions/db` endpoint
- Your data is safe even if the app is uninstalled (it's in the cloud via Supabase)

---

## Features added in desktop mode

| Feature | Web | Desktop |
|---|---|---|
| Works without browser | ❌ | ✅ |
| Native PDF save dialog | ❌ | ✅ |
| Desktop notifications | ❌ | ✅ |
| Keyboard shortcuts (Ctrl+N, etc.) | Partial | ✅ |
| App menu (File/Edit/View) | ❌ | ✅ |
| Taskbar / Dock icon | ❌ | ✅ |
| Offline mode | ✅ | ✅ |
| Supabase sync | ✅ | ✅ |

---

## Troubleshooting

**"npm is not recognized"** → Install Node.js from nodejs.org first

**App shows blank white screen** → Make sure `app/index.html` exists in the right place

**Windows: "Windows protected your PC" warning** → Click "More info" → "Run anyway"
(This happens because the app isn't code-signed — signing costs ~$400/yr from a certificate authority)

**Mac: "can't be opened because it is from an unidentified developer"** → Right-click the app → Open → Open
(Same reason — no Apple Developer certificate)

---

## Code signing (optional, removes security warnings)

For a professional distribution without security warnings:
- **Windows**: Buy a Code Signing Certificate from DigiCert (~$400/yr)
- **Mac**: Join Apple Developer Program ($99/yr) and get a Developer ID certificate

Both can be configured in `package.json` under the `build` section.
