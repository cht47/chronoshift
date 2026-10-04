// Small helpers for DOM access, validation, dates and duration formatting.
// Dates are handled as local "YYYY-MM-DD" strings, times of day as "HH:MM".

export const $ = (id) => document.getElementById(id);

export function pad2(n) {
  return String(n).padStart(2, "0");
}

// Escapes text for use inside HTML templates
export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const isTime = (v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
export const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function isoOf(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() {
  return isoOf(new Date());
}

export function dateFromISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function prevDayISO(iso) {
  const d = dateFromISO(iso);
  d.setDate(d.getDate() - 1);
  return isoOf(d);
}

export function nextDayISO(iso) {
  const d = dateFromISO(iso);
  d.setDate(d.getDate() + 1);
  return isoOf(d);
}

export function combineDateTime(iso, hhmm) {
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

// Always 24-hour format, matching the stored "08:50" values
export function clockOf(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// "7h 05min", negative values with a minus sign
export function fmtMin(min) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h ${pad2(abs % 60)}min`;
}

// Difference with sign, e.g. "+1h 05min", "-0h 30min", "±0"
export function fmtDiff(min) {
  return min === 0 ? "±0" : `${min > 0 ? "+" : ""}${fmtMin(min)}`;
}

// Short durations in minutes only ("45 min"), longer ones like fmtMin
export function fmtDur(min) {
  return min < 60 ? `${min} min` : fmtMin(min);
}
