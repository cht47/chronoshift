import { DAY_MS } from "./config.js";
import { state } from "./state.js";
import { combineDateTime } from "./util.js";

export function worktimeRange(entry) {
  const startMs = combineDateTime(entry.datum, entry.beginn);
  let endMs = combineDateTime(entry.datum, entry.ende);
  if (endMs <= startMs) endMs += DAY_MS; // Nachtschicht über Mitternacht
  return { startMs, endMs };
}

export function worktimePauseRange(entry) {
  if (!entry.pauseVon || !entry.pauseBis) return null;
  const { startMs } = worktimeRange(entry);
  let pVon = combineDateTime(entry.datum, entry.pauseVon);
  let pBis = combineDateTime(entry.datum, entry.pauseBis);
  if (pVon < startMs) pVon += DAY_MS;
  if (pBis <= pVon) pBis += DAY_MS;
  return { pVon, pBis };
}

function computeAutoPauseMinutes(bruttoMin) {
  const { pauseAutoEnabled, pauseRules } = state.settings;
  if (!pauseAutoEnabled) return 0;
  return pauseRules.reduce((sum, r) => (bruttoMin >= r.stunden * 60 ? sum + (Number(r.minuten) || 0) : sum), 0);
}

export function computeWorktimeStats(entry) {
  const { startMs, endMs } = worktimeRange(entry);
  const bruttoMin = Math.round((endMs - startMs) / 60000);
  const manualPause = worktimePauseRange(entry);
  const pauseManual = !!manualPause;
  const pauseMin = pauseManual
    ? Math.round((manualPause.pBis - manualPause.pVon) / 60000)
    : computeAutoPauseMinutes(bruttoMin);
  return { bruttoMin, pauseMin, pauseManual, nettoMin: Math.max(0, bruttoMin - pauseMin), startMs, endMs };
}

export function compareWorkAsc(a, b) {
  return (a.datum + a.beginn).localeCompare(b.datum + b.beginn);
}
