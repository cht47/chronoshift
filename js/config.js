// App-wide constants: version, storage keys, default settings.

// Increase together with VERSION in service-worker.js and the version in README.md on every release
export const APP_VERSION = "1.1.1";
export const FIRST_YEAR = 2025;

// Version of the stored data format (localStorage and backup files).
// Increase it when stored field names or structures change and add a conversion step in migrate.js.
export const DATA_VERSION = 2;

// All keys share one prefix because apps on the same origin (e.g. GitHub Pages) share one localStorage
export const TASKS_KEY = "chronoshift.tasks";
export const TIMER_STATE_KEY = "chronoshift.timer";
export const WORKTIME_KEY = "chronoshift.worktime";
export const SETTINGS_KEY = "chronoshift.settings";
export const ABSENCES_KEY = "chronoshift.absences";
export const LAST_BACKUP_KEY = "chronoshift.lastBackup";
export const LAST_CLOUD_BACKUP_KEY = "chronoshift.lastCloudBackup";
export const NEXT_REMINDER_KEY = "chronoshift.nextBackupReminder";
export const DATA_VERSION_KEY = "chronoshift.dataVersion";
export const ALL_KEYS = [
  TASKS_KEY,
  TIMER_STATE_KEY,
  WORKTIME_KEY,
  ABSENCES_KEY,
  SETTINGS_KEY,
  LAST_BACKUP_KEY,
  LAST_CLOUD_BACKUP_KEY,
  NEXT_REMINDER_KEY,
  DATA_VERSION_KEY,
];

export const DAY_MS = 24 * 60 * 60 * 1000;

// Available languages: one file locales/<code>.json each, named here in their own language
export const LANGUAGES = { de: "Deutsch", en: "English" };
export const FALLBACK_LANG = "en";

export const DEFAULT_SETTINGS = {
  weeklyHours: 40,
  // Work days as Date.getDay() values: 0 = Sunday, 1 = Monday … 6 = Saturday
  workDays: [1, 2, 3, 4, 5],
  restEnabled: true,
  restHours: 11,
  restBannerEnabled: true,
  // Time window for the rest period banner; equal values mean all day
  bannerFrom: "00:00",
  bannerTo: "00:00",
  autoBreakEnabled: true,
  // German Working Hours Act (§ 4 ArbZG): 30 min for more than 6 h, 45 min for more than 9 h.
  // Rules add up, so the second rule only adds the extra 15 minutes.
  breakRules: [
    { hours: 6, minutes: 30 },
    { hours: 9, minutes: 15 },
  ],
  theme: "system",
  language: "system",
  gdriveEnabled: false,
  // Overtime account: balance in minutes at the end of overtimeDate ("" = not set up yet)
  overtimeEnabled: false,
  overtimeDate: "",
  overtimeMin: 0,
  // Lists: earlier tasks shown below today's, and days of work time and absences (0 = all)
  taskListCount: 2,
  workListDays: 7,
};

// Choices for the list settings above
export const TASK_LIST_COUNTS = [2, 5, 10, 20];
export const WORK_LIST_DAYS = [7, 14, 30, 0];

// Kinds of absence; a half vacation day credits half the daily target, all others the full daily target
export const ABSENCE_TYPES = ["vacation", "vacationHalf", "sick", "holiday"];

// Weekdays in display order starting with Monday, as Date.getDay() values
export const WEEK_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0];

export const VIEWS = ["tasks", "worktime", "calendar", "settings"];
