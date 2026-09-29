# ChronoShift

A fast, private time tracker for your phone. Track tasks with one tap, log your working hours and keep an eye on your legal rest period – all stored locally on your device, no account, no cloud.

Built as a Progressive Web App (PWA): open it in the browser, install it to your home screen and use it offline like a native app.

**Version:** 1.0.0-beta

👉 **Use it now:** https://cht47.github.io/chronoshift/

<p align="center">
  <img src="screenshots/track-time.jpg" alt="Track time with a running task" width="200">
  <img src="screenshots/work-time.jpg" alt="Work time with weekly overview" width="200">
  <img src="screenshots/calendar.jpg" alt="Calendar with day details" width="200">
  <img src="screenshots/settings.jpg" alt="Settings" width="200">
</p>

## ✨ Features

### ⏱️ Track time
- Start a task with one tap (or press Enter on the keyboard)
- Live timer while a task is running – it keeps running even if you close the app
- Shows today's tasks and at least the two most recent ones; older entries are in the calendar
- Made for quick use, e.g. logging on-call jobs or project time

### 💼 Work time
- Log start and end of your working day, editable at any time
- Breaks either entered manually (exact from–to times) or deducted automatically
- Configurable automatic break rules that add up (default: 15 min after 4 h, 30 min after 6 h, 15 min after 9 h)
- Night shifts across midnight are supported
- Weekly overview with progress bar: actual hours vs. weekly target and the difference

### 😴 Rest period
- Shows when your minimum rest period ends, based on the latest task or working day
- Duration is configurable (e.g. 11 h in Germany/EU, UK, Switzerland; 8 h in Canada) or can be turned off completely
- Optional banner at the top, limited to a time window (e.g. only outside regular working hours)
- Work time entered in advance only counts once it has started

### 📅 Calendar
- Monthly overview with markers for tasks and work time
- Tap a day to see its entries, delete them or edit work time

### ⚙️ Settings
- Light, dark or system theme
- German and English, following the device language by default
- Weekly hours and work days (daily target is calculated)
- CSV export for tasks and work time (separately)
- Delete today's tasks, all tasks, work time older than 90 days, or reset everything (with a 5-second safety countdown)

## 📱 Installation

1. Open https://cht47.github.io/chronoshift/ in your browser.
2. Install it:
   - **Android (Chrome):** menu ⋮ → *Install app* / *Add to home screen*
   - **iPhone/iPad (Safari):** share button → *Add to Home Screen*
   - **Windows/macOS/Linux (Chrome, Edge):** install icon in the address bar
3. Done – the app now works offline.

## 🔒 Data & privacy

- All data is stored **only on your device** (browser `localStorage`). Nothing is sent to a server.
- The app loads no external resources: no CDN, no fonts, no tracking.
- Storage is limited by the browser to about 5 MB – enough for many years of entries. Current usage is shown under *Settings*.
- **Clearing your browser data deletes all entries.** Use the CSV export as a backup.
- Data is stored per browser and device and is not synced between devices.

## 🛠️ Development

The app is plain HTML, CSS and JavaScript – no framework, no build step.

Serve the folder with any static web server, for example:

```bash
npx serve .
```

Then open the URL shown in the terminal (e.g. http://localhost:3000).

> **Note:** Opening `index.html` directly from disk (`file://`) is not supported. This is a browser security restriction, not a bug: browsers block loading local files such as the language files in `locales/`, and offline mode and installation only work over `http(s)://`.

### Project structure

| File | Purpose |
|---|---|
| `index.html` | The whole app: markup, styles and JavaScript |
| `locales/*.json` | UI texts per language |
| `pico.min.css` | [Pico CSS](https://picocss.com) v2.0.6, bundled locally |
| `service-worker.js` | Offline support (network first, cache as fallback) |
| `manifest.json`, `icon-*.png` | PWA manifest and app icons |

### Releasing a new version
- Update `APP_VERSION` in `index.html` (shown in the settings).
- If you add, rename or remove files that must work offline, update `FILES_TO_CACHE` and increase `CACHE_NAME` in `service-worker.js`.

## 🌍 Languages

The app ships with German and English. By default it follows the device language and falls back to English if that language is not available. It can be changed under *Settings*.

To add a language:
1. Copy `locales/en.json` to `locales/<code>.json` (e.g. `fr.json`) and translate the values. Keep the keys and `{placeholders}` unchanged.
2. Add the language to `LANGUAGES` in `index.html`, e.g. `fr: "Français"`.
3. Add the file to `FILES_TO_CACHE` in `service-worker.js` so it is available offline.

Texts missing from a translation automatically fall back to English.

## ✅ Compatibility

Current versions of Chrome, Edge, Firefox and Safari on desktop and mobile.

## 📄 License

ChronoShift is source-available under the MIT License with the Commons Clause (see [`LICENSE`](LICENSE)).

- ✅ Free to use, modify and share – privately and within companies
- ❌ Selling the software, or paid services based on it (e.g. hosting, customization, support), is not permitted

For commercial licensing or custom versions, please contact the author.

Third-party components (Pico CSS, Lucide icons) keep their own licenses, see [`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md).

## 🤝 Contributing

Contributions are welcome. By submitting a contribution, you agree that it may be used by the author under any license, including commercial licenses.

© 2025–2026 Daniel Herbst
