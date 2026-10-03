// Bei jedem Release zusammen mit VERSION in service-worker.js erhöhen
export const APP_VERSION = "1.0.14-beta";
export const FIRST_YEAR = 2025;

// Präfix, weil sich alle Apps unter derselben Domain (z. B. GitHub Pages) den localStorage teilen
export const TASKS_KEY = "chronoshift.tasks";
export const TIMER_STATE_KEY = "chronoshift.timer";
export const WORKTIME_KEY = "chronoshift.worktime";
export const SETTINGS_KEY = "chronoshift.settings";
export const ABSENCES_KEY = "chronoshift.absences";
export const LAST_BACKUP_KEY = "chronoshift.lastBackup";
export const LAST_CLOUD_BACKUP_KEY = "chronoshift.lastCloudBackup";
export const NEXT_REMINDER_KEY = "chronoshift.nextBackupReminder";
export const ALL_KEYS = [
  TASKS_KEY,
  TIMER_STATE_KEY,
  WORKTIME_KEY,
  ABSENCES_KEY,
  SETTINGS_KEY,
  LAST_BACKUP_KEY,
  LAST_CLOUD_BACKUP_KEY,
  NEXT_REMINDER_KEY,
];

export const DAY_MS = 24 * 60 * 60 * 1000;

// Verfügbare Sprachen: Datei locales/<code>.json + Eintrag hier (Name in der jeweiligen Sprache)
export const LANGUAGES = { de: "Deutsch", en: "English" };
export const FALLBACK_LANG = "en";

export const DEFAULT_SETTINGS = {
  wochensollstunden: 40,
  // Arbeitstage als Wochentage wie bei Date.getDay(): 0 = So, 1 = Mo … 6 = Sa
  workDays: [1, 2, 3, 4, 5],
  ruhezeitEnabled: true,
  restHours: 11,
  ruhezeitBannerEnabled: true,
  bannerVon: "00:00",
  bannerBis: "00:00",
  pauseAutoEnabled: true,
  // § 4 ArbZG: 30 min bei mehr als 6 h, 45 min bei mehr als 9 h (die Regeln addieren sich)
  pauseRules: [
    { stunden: 6, minuten: 30 },
    { stunden: 9, minuten: 15 },
  ],
  theme: "system",
  language: "system",
  gdriveEnabled: false,
  // Stundenkonto: Saldo in Minuten am Ende von overtimeDate ("" = noch nicht eingerichtet), z. B. ein Monatsübertrag
  overtimeEnabled: false,
  overtimeDate: "",
  overtimeMin: 0,
};

// Arten von Abwesenheit; der halbe Urlaubstag schreibt das halbe Tagessoll gut
export const ABSENCE_TYPES = ["vacation", "vacationHalf", "sick", "holiday"];

// Wochentage in Anzeigereihenfolge ab Montag, als Date.getDay()-Werte
export const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0];

export const VIEWS = ["tasks", "worktime", "calendar", "settings"];
