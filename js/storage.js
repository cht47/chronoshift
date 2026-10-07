// Loading and saving app data in localStorage.
//
// Stored data (format version DATA_VERSION, see migrate.js for older formats):
//   tasks      [{ id, task, startMs, stopMs, durationMin }]           timestamps in ms, duration in whole minutes
//   worktime   [{ id, date, start, end, breakStart, breakEnd }]       "YYYY-MM-DD" and "HH:MM"; break times null for an automatic break,
//                                                                    end null while the end is still open
//   absences   [{ id, date, type }]                                   type: one of ABSENCE_TYPES
//   settings   see DEFAULT_SETTINGS in config.js
//   timer      { running, startTime, task } while a task is running
// IDs are Date.now() values at creation time.

import {
  ABSENCES_KEY,
  ALL_KEYS,
  DEFAULT_SETTINGS,
  LAST_BACKUP_KEY,
  LAST_CLOUD_BACKUP_KEY,
  NEXT_REMINDER_KEY,
  SETTINGS_KEY,
  TASK_LIST_COUNTS,
  TASKS_KEY,
  TIMER_STATE_KEY,
  WORK_LIST_DAYS,
  WORKTIME_KEY,
} from "./config.js";
import { state } from "./state.js";
import { isDate, isPlainObject, isTime } from "./util.js";

// Keys whose stored value was damaged at startup (see readJson)
export const damagedKeys = [];

// Reads a stored JSON value. A damaged value is kept under "<key>.damaged" and the app starts without it
// instead of failing to load at all.
function readJson(key, isValid, fallback) {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  try {
    const value = JSON.parse(stored);
    if (isValid(value)) return value;
  } catch {
    // handled like an invalid value below
  }
  localStorage.setItem(`${key}.damaged`, stored);
  localStorage.removeItem(key);
  damagedKeys.push(key);
  return fallback;
}

export function loadTasks() {
  state.tasks = readJson(TASKS_KEY, Array.isArray, []);
}

export function saveTasks() {
  localStorage.setItem(TASKS_KEY, JSON.stringify(state.tasks));
}

export function loadWork() {
  state.work = readJson(WORKTIME_KEY, Array.isArray, []);
}

export function saveWork() {
  localStorage.setItem(WORKTIME_KEY, JSON.stringify(state.work));
}

export function loadAbsences() {
  state.absences = readJson(ABSENCES_KEY, Array.isArray, []);
}

export function saveAbsences() {
  localStorage.setItem(ABSENCES_KEY, JSON.stringify(state.absences));
}

// Stored settings get the same checks as settings from a backup (see sanitizeSettings)
export function loadSettings() {
  state.settings = sanitizeSettings(readJson(SETTINGS_KEY, isPlainObject, {}));
}

export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

export function loadTimer() {
  return readJson(TIMER_STATE_KEY, isPlainObject, null);
}

export function saveTimer(timer) {
  if (timer) localStorage.setItem(TIMER_STATE_KEY, JSON.stringify(timer));
  else localStorage.removeItem(TIMER_STATE_KEY);
}

export function loadLastBackup() {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

export function saveLastBackup(isoTimestamp) {
  localStorage.setItem(LAST_BACKUP_KEY, isoTimestamp);
}

export function loadLastCloudBackup() {
  return localStorage.getItem(LAST_CLOUD_BACKUP_KEY);
}

export function saveLastCloudBackup(isoTimestamp) {
  localStorage.setItem(LAST_CLOUD_BACKUP_KEY, isoTimestamp);
}

export function loadNextReminder() {
  return localStorage.getItem(NEXT_REMINDER_KEY);
}

export function saveNextReminder(isoTimestamp) {
  localStorage.setItem(NEXT_REMINDER_KEY, isoTimestamp);
}

// Extra checks for settings where the type alone is not enough
const SETTING_CHECKS = {
  bannerFrom: isTime,
  bannerTo: isTime,
  theme: (v) => ["system", "light", "dark"].includes(v),
  breakRules: (v) => v.every((r) => Number.isFinite(r?.hours) && Number.isFinite(r?.minutes)),
  overtimeDate: (v) => v === "" || isDate(v),
  overtimeMin: Number.isInteger,
  workDays: (v) => v.length > 0 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(v).size === v.length,
  taskListCount: (v) => TASK_LIST_COUNTS.includes(v),
  workListDays: (v) => WORK_LIST_DAYS.includes(v),
};

function isValidSetting(key, value) {
  const def = DEFAULT_SETTINGS[key];
  const sameType = Array.isArray(def)
    ? Array.isArray(value)
    : typeof value === typeof def && (typeof def !== "number" || Number.isFinite(value));
  return sameType && (!SETTING_CHECKS[key] || SETTING_CHECKS[key](value));
}

// Keeps only known settings with a valid value and uses the default for everything else.
// This way data from versions with more or fewer settings still loads.
function sanitizeSettings(stored) {
  const merged = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in stored && isValidSetting(key, stored[key])) merged[key] = stored[key];
  }
  return merged;
}

// Replaces tasks, work time, absences and settings. A running task is not part of a backup and keeps running.
export function restoreData(tasks, work, absences, settings) {
  state.tasks = tasks;
  state.work = work;
  state.absences = absences;
  state.settings = sanitizeSettings(settings);
  saveTasks();
  saveWork();
  saveAbsences();
  saveSettings();
}

// Approximate storage use; browsers limit localStorage to about 5 million characters
export function storageChars() {
  return ALL_KEYS.reduce((sum, k) => sum + k.length + (localStorage.getItem(k) || "").length, 0);
}

export function clearAllData() {
  ALL_KEYS.forEach((k) => {
    localStorage.removeItem(k);
    localStorage.removeItem(`${k}.damaged`);
  });
}
