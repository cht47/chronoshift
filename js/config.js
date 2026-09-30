// Bei jedem Release zusammen mit VERSION in service-worker.js erhöhen
export const APP_VERSION = "1.0.8-beta";
export const FIRST_YEAR = 2025;

// Präfix, weil sich alle Apps unter derselben Domain (z. B. GitHub Pages) den localStorage teilen
export const STORAGE_KEY = "chronoshift.tasks";
export const TIMER_STATE_KEY = "chronoshift.timer";
export const WORKTIME_KEY = "chronoshift.worktime";
export const SETTINGS_KEY = "chronoshift.settings";
export const LAST_BACKUP_KEY = "chronoshift.lastBackup";
export const ALL_KEYS = [STORAGE_KEY, TIMER_STATE_KEY, WORKTIME_KEY, SETTINGS_KEY, LAST_BACKUP_KEY];

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WORKTIME_RETENTION_DAYS = 90;

// Verfügbare Sprachen: Datei locales/<code>.json + Eintrag hier (Name in der jeweiligen Sprache)
export const LANGUAGES = { de: "Deutsch", en: "English" };
export const FALLBACK_LANG = "en";

export const DEFAULT_SETTINGS = {
  wochensollstunden: 38,
  arbeitstage: 5,
  ruhezeitEnabled: true,
  restHours: 11,
  ruhezeitBannerEnabled: true,
  bannerVon: "00:00",
  bannerBis: "00:00",
  pauseAutoEnabled: true,
  pauseRules: [
    { stunden: 4, minuten: 15 },
    { stunden: 6, minuten: 30 },
    { stunden: 9, minuten: 15 },
  ],
  theme: "system",
  language: "system",
};

export const VIEWS = ["tasks", "worktime", "calendar", "settings"];
