import { ALL_KEYS, DEFAULT_SETTINGS, LAST_BACKUP_KEY, LAST_CLOUD_BACKUP_KEY, NEXT_REMINDER_KEY, SETTINGS_KEY, STORAGE_KEY, TIMER_STATE_KEY, WORKTIME_KEY } from "./config.js";
import { state } from "./state.js";
import { isTime } from "./util.js";

export function loadTasks() {
  const stored = localStorage.getItem(STORAGE_KEY);
  state.tasks = stored ? JSON.parse(stored) : [];
}

export function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

export function loadWork() {
  const stored = localStorage.getItem(WORKTIME_KEY);
  state.work = stored ? JSON.parse(stored) : [];
}

export function saveWork() {
  localStorage.setItem(WORKTIME_KEY, JSON.stringify(state.work));
}

export function loadSettings() {
  const stored = localStorage.getItem(SETTINGS_KEY);
  state.settings = structuredClone(DEFAULT_SETTINGS);
  if (stored) {
    Object.assign(state.settings, JSON.parse(stored));
    if (!Array.isArray(state.settings.pauseRules)) state.settings.pauseRules = structuredClone(DEFAULT_SETTINGS.pauseRules);
  }
}

export function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

export function loadTimer() {
  const stored = localStorage.getItem(TIMER_STATE_KEY);
  return stored ? JSON.parse(stored) : null;
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

// Zusätzliche Prüfungen für Einstellungen, bei denen der Typ allein nicht reicht
const SETTING_CHECKS = {
  bannerVon: isTime,
  bannerBis: isTime,
  theme: (v) => ["system", "light", "dark"].includes(v),
  pauseRules: (v) => v.every((r) => Number.isFinite(r?.stunden) && Number.isFinite(r?.minuten)),
};

function isValidSetting(key, value) {
  const def = DEFAULT_SETTINGS[key];
  const sameType = Array.isArray(def)
    ? Array.isArray(value)
    : typeof value === typeof def && (typeof def !== "number" || Number.isFinite(value));
  return sameType && (!SETTING_CHECKS[key] || SETTING_CHECKS[key](value));
}

// Übernimmt nur bekannte Einstellungen mit gültigem Wert, alles andere bleibt beim Standard.
// So passen auch Backups älterer oder neuerer Versionen mit mehr oder weniger Einstellungen.
function sanitizeSettings(settings) {
  const merged = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in settings && isValidSetting(key, settings[key])) merged[key] = settings[key];
  }
  return merged;
}

// Ersetzt Tasks, Arbeitszeiten und Einstellungen; der laufende Timer bleibt bewusst unberührt
export function restoreData(tasks, work, settings) {
  const merged = sanitizeSettings(settings);
  state.tasks = tasks;
  state.work = work;
  state.settings = merged;
  saveTasks();
  saveWork();
  saveSettings();
}

export function storageChars() {
  return ALL_KEYS.reduce((sum, k) => sum + k.length + (localStorage.getItem(k) || "").length, 0);
}

export function clearAllData() {
  ALL_KEYS.forEach((k) => localStorage.removeItem(k));
}
