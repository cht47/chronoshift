export const $ = (id) => document.getElementById(id);

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export const isTime = (v) => typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
export const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

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

export function combineDateTime(iso, hhmm) {
  const [y, m, d] = iso.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).getTime();
}

// Uhrzeiten bewusst immer im 24-Stunden-Format, passend zu den gespeicherten "08:50"-Werten
export function clockOf(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtMin(min) {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(min);
  return `${sign}${Math.floor(abs / 60)}h ${pad2(abs % 60)}min`;
}

export function fmtDur(min) {
  return min < 60 ? `${min} min` : fmtMin(min);
}
