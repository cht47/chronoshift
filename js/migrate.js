// Converts stored data and backup files from older data formats to the current one (DATA_VERSION).
//
// Data format versions:
//   1  up to app version 1.0.14: German field names (datum, beginn, wochensollstunden, …)
//   2  since app version 1.1.0: English field names
//
// To change the format, increase DATA_VERSION in config.js and add a step to STEPS that converts the
// previous version. Steps run one after another, so data of any older version reaches the current one.
// A step receives { tasks, work, absences, settings }; parts that are undefined must stay undefined,
// and entries that are not objects are passed through unchanged.

import { ABSENCES_KEY, DATA_VERSION, DATA_VERSION_KEY, SETTINGS_KEY, TASKS_KEY, WEEK_FROM_MONDAY, WORKTIME_KEY } from "./config.js";
import { isPlainObject } from "./util.js";

// Renames the keys of an object and keeps their order; keys not listed stay unchanged
function renameKeys(obj, names) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [names[key] ?? key, value]));
}

function mapObjects(list, fn) {
  return Array.isArray(list) ? list.map((item) => (isPlainObject(item) ? fn(item) : item)) : list;
}

function settingsToV2(settings) {
  const { arbeitstage, ...result } = renameKeys(settings, {
    wochensollstunden: "weeklyHours",
    ruhezeitEnabled: "restEnabled",
    ruhezeitBannerEnabled: "restBannerEnabled",
    bannerVon: "bannerFrom",
    bannerBis: "bannerTo",
    pauseAutoEnabled: "autoBreakEnabled",
    pauseRules: "breakRules",
  });
  result.breakRules = mapObjects(result.breakRules, (r) => renameKeys(r, { stunden: "hours", minuten: "minutes" }));
  // Up to 1.0.11 only the number of work days was stored; it counts from Monday (5 = Monday to Friday)
  if (!("workDays" in result) && Number.isInteger(arbeitstage) && arbeitstage >= 1 && arbeitstage <= 7) {
    result.workDays = WEEK_FROM_MONDAY.slice(0, arbeitstage);
  }
  return result;
}

// STEPS[n] converts data of version n to version n + 1
const STEPS = {
  1: ({ tasks, work, absences, settings }) => ({
    tasks,
    work: mapObjects(work, (e) =>
      renameKeys(e, { datum: "date", beginn: "start", ende: "end", pauseVon: "breakStart", pauseBis: "breakEnd" })
    ),
    absences: mapObjects(absences, (a) => renameKeys(a, { datum: "date", typ: "type" })),
    settings: isPlainObject(settings) ? settingsToV2(settings) : settings,
  }),
};

export function migrateData(data, fromVersion) {
  let result = data;
  for (let v = fromVersion; v < DATA_VERSION; v++) result = STEPS[v](result);
  return result;
}

const STORED_PARTS = { tasks: TASKS_KEY, work: WORKTIME_KEY, absences: ABSENCES_KEY, settings: SETTINGS_KEY };

// Unreadable values stay as they are; loading them later moves them aside as damaged (see readJson in storage.js)
function readStored(key) {
  const stored = localStorage.getItem(key);
  if (stored === null) return undefined;
  try {
    return JSON.parse(stored);
  } catch {
    return undefined;
  }
}

// Runs once at startup before anything is loaded. Stored data without a version number is version 1,
// an empty storage is a new installation and starts with the current version.
export function upgradeStoredData() {
  const parts = Object.entries(STORED_PARTS);
  const stored = Number(localStorage.getItem(DATA_VERSION_KEY));
  const hasData = parts.some(([, key]) => localStorage.getItem(key) !== null);
  const version = Number.isInteger(stored) && stored >= 1 ? stored : hasData ? 1 : DATA_VERSION;
  // Data written by a newer app version is left untouched
  if (version > DATA_VERSION) return;
  if (version < DATA_VERSION) {
    const data = Object.fromEntries(parts.map(([part, key]) => [part, readStored(key)]));
    const migrated = migrateData(data, version);
    for (const [part, key] of parts) {
      if (data[part] !== undefined) localStorage.setItem(key, JSON.stringify(migrated[part]));
    }
  }
  localStorage.setItem(DATA_VERSION_KEY, String(DATA_VERSION));
}
