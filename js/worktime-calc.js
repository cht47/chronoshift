// Work time calculations: duration and breaks of an entry, daily target, overlaps and the overtime account.
// All durations are in minutes. Entries with an open end are not counted anywhere until the end is entered.

import { state } from "./state.js";
import { combineDateTime, dateFromISO, nextDayISO, todayISO } from "./util.js";

// An end time at or before the start time is on the next day (night shift). The next day is a real
// calendar date instead of "+24 hours", so nights with a daylight saving time change count correctly.
export function worktimeRange(entry) {
  const endDay = entry.end <= entry.start ? nextDayISO(entry.date) : entry.date;
  return { startMs: combineDateTime(entry.date, entry.start), endMs: combineDateTime(endDay, entry.end) };
}

// Manual break as timestamps, or null for an automatic break. A break time before the work start
// belongs to the next day (break after midnight in a night shift).
export function worktimeBreakRange(entry) {
  if (!entry.breakStart || !entry.breakEnd) return null;
  const startDay = entry.breakStart < entry.start ? nextDayISO(entry.date) : entry.date;
  const endDay = entry.breakEnd <= entry.breakStart ? nextDayISO(startDay) : startDay;
  return { startMs: combineDateTime(startDay, entry.breakStart), endMs: combineDateTime(endDay, entry.breakEnd) };
}

// A rule applies to more than its hours (from 6:01, not at exactly 6:00), then with its full minutes.
// All matching rules add up.
function autoBreakMin(grossMin) {
  const { autoBreakEnabled, breakRules } = state.settings;
  if (!autoBreakEnabled) return 0;
  return breakRules.reduce((sum, r) => (grossMin > r.hours * 60 ? sum + (Number(r.minutes) || 0) : sum), 0);
}

// { breakMin, breakManual, netMin } of a work time entry
export function computeWorktimeStats(entry) {
  const { startMs, endMs } = worktimeRange(entry);
  const grossMin = Math.round((endMs - startMs) / 60000);
  const manualBreak = worktimeBreakRange(entry);
  const breakManual = !!manualBreak;
  const breakMin = breakManual ? Math.round((manualBreak.endMs - manualBreak.startMs) / 60000) : autoBreakMin(grossMin);
  return { breakMin, breakManual, netMin: Math.max(0, grossMin - breakMin) };
}

// IDs of entries that overlap an entry starting earlier (e.g. entered twice by mistake).
// They are not counted in any total, so no time is counted twice.
function overlappingWorkIds(entries) {
  const ids = new Set();
  let countedEnd = -Infinity;
  const ranges = entries.filter((e) => !isOpen(e)).map((e) => ({ id: e.id, ...worktimeRange(e) }));
  ranges.sort((a, b) => a.startMs - b.startMs || a.id - b.id);
  for (const r of ranges) {
    if (r.startMs < countedEnd) ids.add(r.id);
    else countedEnd = r.endMs;
  }
  return ids;
}

// Weekly hours spread evenly across the selected work days
export function dailyTargetMin() {
  const { weeklyHours, workDays } = state.settings;
  return Math.round((weeklyHours * 60) / workDays.length);
}

// Days that are not work days have no target, so work on them counts entirely as overtime
function dayTargetMin(iso) {
  return state.settings.workDays.includes(dateFromISO(iso).getDay()) ? dailyTargetMin() : 0;
}

// An absence credits the daily target of its day, a half vacation day half of it
export function absenceCreditMin(absence) {
  const target = dayTargetMin(absence.date);
  return absence.type === "vacationHalf" ? Math.round(target / 2) : target;
}

// Absences have a "type", work time entries do not
export const isAbsence = (entry) => "type" in entry;

// Work time saved without an end, because the end is not known yet
export const isOpen = (entry) => !isAbsence(entry) && !entry.end;

// Open and overlapping entries are left out of all totals
export const isCounted = (entry, overlaps) => !isOpen(entry) && !overlaps.has(entry.id);

// Shown in red and marked in the calendar
export const hasError = (entry, overlaps) => isOpen(entry) || (!isAbsence(entry) && overlaps.has(entry.id));

// Sort key for lists that mix work time and absences; absences come first on their day
export function entrySortKey(entry) {
  return isAbsence(entry) ? entry.date : entry.date + entry.start;
}

// Overlaps and the difference to the daily target for a list of work time and absences.
// The difference covers the whole day and belongs to its last counted entry.
// Returns { overlaps: Set of work IDs, dayDiffs: Map of entry -> minutes }.
export function workListContext(work, absences) {
  const overlaps = overlappingWorkIds(work);
  const items = [
    ...absences.map((a) => ({ entry: a, min: absenceCreditMin(a) })),
    ...work.filter((e) => isCounted(e, overlaps)).map((e) => ({ entry: e, min: computeWorktimeStats(e).netMin })),
  ].sort((a, b) => entrySortKey(a.entry).localeCompare(entrySortKey(b.entry)));
  const lastOfDay = new Map();
  const sumOfDay = new Map();
  for (const { entry, min } of items) {
    lastOfDay.set(entry.date, entry);
    sumOfDay.set(entry.date, (sumOfDay.get(entry.date) || 0) + min);
  }
  const dayDiffs = new Map();
  for (const [date, entry] of lastOfDay) dayDiffs.set(entry, sumOfDay.get(date) - dayTargetMin(date));
  return { overlaps, dayDiffs };
}

// Overtime account: the balance at the end of overtimeDate plus every following day
// (work + absences - daily target). Work days without an entry count as minus; today only counts
// once something is entered for it. The forecast also adds all future days with planned work time;
// other future days, including days with only an absence, are left out. Work time with an open end is
// not counted anywhere. Returns { current, forecast } (forecast null if the planned work time does not
// change the balance), or null if the account is off or not set up.
export function overtimeBalance(work, absences, overlaps) {
  const { overtimeEnabled, overtimeDate, overtimeMin } = state.settings;
  if (!overtimeEnabled || !overtimeDate) return null;
  const totals = new Map();
  const add = (date, min) => {
    if (date > overtimeDate) totals.set(date, (totals.get(date) || 0) + min);
  };
  const counted = work.filter((e) => isCounted(e, overlaps));
  counted.forEach((e) => add(e.date, computeWorktimeStats(e).netMin));
  absences.forEach((a) => add(a.date, absenceCreditMin(a)));
  const workDates = new Set(counted.map((e) => e.date));

  const today = todayISO();
  let current = overtimeMin;
  for (let d = nextDayISO(overtimeDate); d < today; d = nextDayISO(d)) current += (totals.get(d) || 0) - dayTargetMin(d);
  let forecast = current;
  for (const [date, min] of totals) {
    if (date < today || (date > today && !workDates.has(date))) continue;
    const diff = min - dayTargetMin(date);
    forecast += diff;
    if (date === today) current += diff;
  }
  return { current, forecast: forecast !== current ? forecast : null };
}
