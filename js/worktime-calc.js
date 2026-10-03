import { state } from "./state.js";
import { combineDateTime, dateFromISO, nextDayISO } from "./util.js";

// Zeiten über Mitternacht liegen am Folgetag. Bewusst als echtes Datum statt "+24 Stunden",
// damit Nächte mit Zeitumstellung (23 oder 25 Stunden) richtig zählen.
export function worktimeRange(entry) {
  const endDay = entry.ende <= entry.beginn ? nextDayISO(entry.datum) : entry.datum;
  return { startMs: combineDateTime(entry.datum, entry.beginn), endMs: combineDateTime(endDay, entry.ende) };
}

export function worktimePauseRange(entry) {
  if (!entry.pauseVon || !entry.pauseBis) return null;
  const vonDay = entry.pauseVon < entry.beginn ? nextDayISO(entry.datum) : entry.datum;
  const bisDay = entry.pauseBis <= entry.pauseVon ? nextDayISO(vonDay) : vonDay;
  return { pVon: combineDateTime(vonDay, entry.pauseVon), pBis: combineDateTime(bisDay, entry.pauseBis) };
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
  return { pauseMin, pauseManual, nettoMin: Math.max(0, bruttoMin - pauseMin) };
}

// IDs der Einträge, die sich mit einem früher beginnenden überschneiden (z. B. versehentlich doppelt erfasst).
// Sie zählen nicht zur Wochensumme, damit keine Zeit doppelt gerechnet wird.
function overlappingWorkIds(entries) {
  const ids = new Set();
  let countedEnd = -Infinity;
  const ranges = entries.map((e) => ({ id: e.id, ...worktimeRange(e) }));
  ranges.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
  for (const r of ranges) {
    if (r.startMs < countedEnd) ids.add(r.id);
    else countedEnd = r.endMs;
  }
  return ids;
}

// Tagessoll in Minuten: Wochenstunden verteilt auf die gewählten Arbeitstage
export function dailyTargetMin() {
  const { wochensollstunden, workDays } = state.settings;
  return Math.round((wochensollstunden * 60) / workDays.length);
}

// Nicht gewählte Wochentage sind frei, Arbeit dort zählt komplett als Plus
function dayTargetMin(iso) {
  return state.settings.workDays.includes(dateFromISO(iso).getDay()) ? dailyTargetMin() : 0;
}

// Überschneidungen und Abweichung vom Tagessoll für eine Liste von Arbeitszeiten.
// Die Abweichung gilt für den ganzen Tag und steht am zeitlich letzten gültigen Eintrag (Map: ID -> Minuten).
export function workListContext(entries) {
  const overlaps = overlappingWorkIds(entries);
  const lastOfDay = new Map();
  const netOfDay = new Map();
  for (const e of entries.filter((x) => !overlaps.has(x.id)).sort(compareWorkAsc)) {
    lastOfDay.set(e.datum, e.id);
    netOfDay.set(e.datum, (netOfDay.get(e.datum) || 0) + computeWorktimeStats(e).nettoMin);
  }
  const dayDiffs = new Map();
  for (const [datum, id] of lastOfDay) dayDiffs.set(id, netOfDay.get(datum) - dayTargetMin(datum));
  return { overlaps, dayDiffs };
}

export function compareWorkAsc(a, b) {
  return (a.datum + a.beginn).localeCompare(b.datum + b.beginn);
}
