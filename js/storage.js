import { ALL_KEYS, DEFAULT_SETTINGS, SETTINGS_KEY, STORAGE_KEY, TIMER_STATE_KEY, WORKTIME_KEY } from "./config.js";
import { state } from "./state.js";

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

export function storageChars() {
  return ALL_KEYS.reduce((sum, k) => sum + k.length + (localStorage.getItem(k) || "").length, 0);
}

export function clearAllData() {
  ALL_KEYS.forEach((k) => localStorage.removeItem(k));
}
