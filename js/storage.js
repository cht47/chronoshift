import { ABSENCES_KEY, ALL_KEYS, DEFAULT_SETTINGS, LAST_BACKUP_KEY, LAST_CLOUD_BACKUP_KEY, NEXT_REMINDER_KEY, SETTINGS_KEY, TASKS_KEY, TIMER_STATE_KEY, WEEK_FROM_MONDAY, WORKTIME_KEY } from "./config.js";
import { state } from "./state.js";
import { isTime } from "./util.js";

// Schlüssel, deren gespeicherter Inhalt beim Laden beschädigt war (siehe readJson)
export const damagedKeys = [];

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// Liest einen gespeicherten JSON-Wert. Ist er beschädigt, bleibt er unter "<Schlüssel>.damaged" erhalten
// und die App startet ohne ihn, statt gar nicht mehr zu laden.
function readJson(key, isValid, fallback) {
  const stored = localStorage.getItem(key);
  if (stored === null) return fallback;
  try {
    const value = JSON.parse(stored);
    if (isValid(value)) return value;
  } catch {
    // unten wie ein ungültiger Wert behandelt
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

// Gespeicherte Einstellungen durchlaufen dieselbe Prüfung wie ein Backup (siehe sanitizeSettings)
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

// Zusätzliche Prüfungen für Einstellungen, bei denen der Typ allein nicht reicht
const SETTING_CHECKS = {
  bannerVon: isTime,
  bannerBis: isTime,
  theme: (v) => ["system", "light", "dark"].includes(v),
  pauseRules: (v) => v.every((r) => Number.isFinite(r?.stunden) && Number.isFinite(r?.minuten)),
  workDays: (v) => v.length > 0 && v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) && new Set(v).size === v.length,
};

// Bis 1.0.11 gab es nur die Anzahl "arbeitstage"; daraus werden die Wochentage ab Montag (5 = Mo–Fr)

function migrateWorkDays(settings) {
  const count = settings.arbeitstage;
  if ("workDays" in settings || !Number.isInteger(count) || count < 1 || count > 7) return settings;
  return { ...settings, workDays: WEEK_FROM_MONDAY.slice(0, count) };
}

function isValidSetting(key, value) {
  const def = DEFAULT_SETTINGS[key];
  const sameType = Array.isArray(def)
    ? Array.isArray(value)
    : typeof value === typeof def && (typeof def !== "number" || Number.isFinite(value));
  return sameType && (!SETTING_CHECKS[key] || SETTING_CHECKS[key](value));
}

// Übernimmt nur bekannte Einstellungen mit gültigem Wert, alles andere bleibt beim Standard.
// So passen auch Daten und Backups älterer oder neuerer Versionen mit mehr oder weniger Einstellungen.
function sanitizeSettings(stored) {
  const settings = migrateWorkDays(stored);
  const merged = structuredClone(DEFAULT_SETTINGS);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in settings && isValidSetting(key, settings[key])) merged[key] = settings[key];
  }
  return merged;
}

// Ersetzt Tasks, Arbeitszeiten, Abwesenheiten und Einstellungen; der laufende Timer bleibt bewusst unberührt
export function restoreData(tasks, work, absences, settings) {
  const merged = sanitizeSettings(settings);
  state.tasks = tasks;
  state.work = work;
  state.absences = absences;
  state.settings = merged;
  saveTasks();
  saveWork();
  saveAbsences();
  saveSettings();
}

export function storageChars() {
  return ALL_KEYS.reduce((sum, k) => sum + k.length + (localStorage.getItem(k) || "").length, 0);
}

export function clearAllData() {
  ALL_KEYS.forEach((k) => {
    localStorage.removeItem(k);
    localStorage.removeItem(`${k}.damaged`);
  });
}
