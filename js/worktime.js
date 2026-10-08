// "Work time" tab: form for work time entries, the list of work time and absences, and the week card
// with weekly total and overtime account.

import { refreshAll, switchView } from "./app.js";
import { buildAbsenceRow, resetAbsenceForm } from "./absence.js";
import { fmtDate, fmtDateParts, fmtDateRange, t } from "./i18n.js";
import { icon } from "./icons.js";
import { BANNER_VIEWS } from "./rest.js";
import { state } from "./state.js";
import { saveWork } from "./storage.js";
import { confirmAction, renderList, showInfo } from "./ui.js";
import { $, combineDateTime, dateFromISO, esc, fmtDiff, fmtDur, fmtMin, isoOf, todayISO } from "./util.js";
import {
  absenceCreditMin,
  computeWorktimeStats,
  entrySortKey,
  hasError,
  isAbsence,
  isCounted,
  isOpen,
  overtimeBalance,
  workListContext,
  worktimeBreakRange,
  worktimeRange,
} from "./worktime-calc.js";

const weekRange = $("weekRange");
const weekActual = $("weekActual");
const weekTarget = $("weekTarget");
const weekDelta = $("weekDelta");
const weekBarWork = $("weekBarWork");
const weekBarAbsence = $("weekBarAbsence");
const balanceLine = $("balanceLine");
const worktimeForm = $("worktimeForm");
const wtFormTitle = $("wtFormTitle");
const wtDate = $("wtDate");
const wtStart = $("wtStart");
const wtEnd = $("wtEnd");
const wtBreakStart = $("wtBreakStart");
const wtBreakEnd = $("wtBreakEnd");
const wtSaveBtn = $("wtSaveBtn");
const wtCancelBtn = $("wtCancelBtn");
const worktimeContainer = $("worktimeContainer");
const workListHint = $("workListHint");
const openBanner = $("openBanner");
const entryModeSwitch = $("entryModeSwitch");
const absenceForm = $("absenceForm");

// Switch above the form: "work" shows the work time form, "absence" the absence form
export function setEntryMode(mode) {
  entryModeSwitch.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  worktimeForm.hidden = mode !== "work";
  absenceForm.hidden = mode !== "absence";
}

entryModeSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-mode]");
  if (!btn) return;
  resetWorktimeForm();
  resetAbsenceForm();
  setEntryMode(btn.dataset.mode);
});

export function updateWorktimeFormText() {
  const editing = state.editingWorkId !== null ? state.work.find((x) => x.id === state.editingWorkId) : null;
  wtFormTitle.textContent = editing ? t("worktime.editTitle", { date: fmtDate(editing.date) }) : t("worktime.formTitle");
  wtSaveBtn.textContent = t(editing ? "common.update" : "common.save");
  wtCancelBtn.hidden = !editing;
}

export function resetWorktimeForm() {
  worktimeForm.reset();
  wtDate.value = todayISO();
  state.editingWorkId = null;
  updateWorktimeFormText();
}

worktimeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  // A new entry may have an open end on the current day only; an entry that is already open may stay open,
  // e.g. a night shift after midnight
  const stored = state.work.find((x) => x.id === state.editingWorkId);
  if (!wtEnd.value && wtDate.value !== todayISO() && !(stored && isOpen(stored))) {
    showInfo(t("worktime.errorEndOpen"));
    return;
  }
  if (wtStart.value === wtEnd.value) {
    showInfo(t("worktime.errorSameStartEnd"));
    return;
  }
  if (!!wtBreakStart.value !== !!wtBreakEnd.value) {
    showInfo(t("worktime.errorBreakIncomplete"));
    return;
  }
  if (wtBreakStart.value && wtBreakStart.value === wtBreakEnd.value) {
    showInfo(t("worktime.errorBreakSame"));
    return;
  }
  const entry = {
    id: state.editingWorkId ?? Date.now(),
    date: wtDate.value,
    start: wtStart.value,
    end: wtEnd.value || null,
    breakStart: wtBreakStart.value || null,
    breakEnd: wtBreakEnd.value || null,
  };
  const manualBreak = worktimeBreakRange(entry);
  if (manualBreak) {
    // With an open end only the start can be checked; the rest is checked once the end is entered
    const { startMs, endMs } = isOpen(entry)
      ? { startMs: combineDateTime(entry.date, entry.start), endMs: Infinity }
      : worktimeRange(entry);
    if (manualBreak.startMs < startMs || manualBreak.endMs > endMs) {
      showInfo(t("worktime.errorBreakOutside"));
      return;
    }
  }

  const save = () => {
    const idx = state.work.findIndex((x) => x.id === entry.id);
    if (idx >= 0) state.work[idx] = entry;
    else state.work.push(entry);
    saveWork();
    resetWorktimeForm();
    refreshAll();
  };

  // An end before the start is most likely a typo unless it really is a night shift
  if (entry.end && entry.end < entry.start) {
    confirmAction(t("worktime.confirmNightShift", { end: entry.end, start: entry.start }), t("common.save"), save);
  } else {
    save();
  }
});

wtCancelBtn.addEventListener("click", resetWorktimeForm);

function editWorkEntry(id) {
  const entry = state.work.find((x) => x.id === id);
  if (!entry) return;
  setEntryMode("work");
  wtDate.value = entry.date;
  wtStart.value = entry.start;
  wtEnd.value = entry.end || "";
  wtBreakStart.value = entry.breakStart || "";
  wtBreakEnd.value = entry.breakEnd || "";
  state.editingWorkId = id;
  updateWorktimeFormText();
  worktimeForm.scrollIntoView({ behavior: "smooth", block: "start" });
  if (!entry.end) wtEnd.focus({ preventScroll: true });
}

function deleteWorkEntry(id) {
  state.work = state.work.filter((x) => x.id !== id);
  if (state.editingWorkId === id) resetWorktimeForm();
  saveWork();
  refreshAll();
}

// stats is null for an entry with an open end: its automatic break is not known yet
function breakText(entry, stats) {
  const manualBreak = worktimeBreakRange(entry);
  if (manualBreak) {
    const duration = fmtDur(Math.round((manualBreak.endMs - manualBreak.startMs) / 60000));
    return t("worktime.breakManual", { duration, from: entry.breakStart, to: entry.breakEnd });
  }
  if (!stats) return t(state.settings.autoBreakEnabled ? "worktime.breakAutoOpen" : "worktime.noBreak");
  if (stats.breakMin > 0) return t("worktime.breakAuto", { duration: fmtDur(stats.breakMin) });
  return t("worktime.noBreak");
}

// Keeps "Pause 45 min" and "(auto)" or "(12:00–12:30)" in one piece each, so a narrow row only wraps between them
function breakHtml(text) {
  const i = text.lastIndexOf(" (");
  const parts = i > 0 ? [text.slice(0, i), text.slice(i + 1)] : [text];
  return parts.map((part) => `<span class="nowrap">${esc(part)}</span>`).join(" ");
}

// ctx: result of workListContext, calculated once per list
function buildWorkRow(entry, ctx) {
  const open = isOpen(entry);
  const stats = open ? null : computeWorktimeStats(entry);
  const errorText = open ? t("worktime.endOpen") : ctx.overlaps.has(entry.id) ? t("worktime.overlapNote") : "";
  const dayDiff = ctx.dayDiffs.get(entry);
  const diffNote =
    dayDiff === undefined ? "" : `<small class="value-diff ${dayDiff >= 0 ? "ok" : "warn"}">${fmtDiff(dayDiff)}</small>`;
  const errorNote = errorText ? `<div class="list-row-meta error-note">${esc(errorText)}</div>` : "";
  const end = open ? t("worktime.open") : entry.end;
  const title = fmtDateParts(dateFromISO(entry.date), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const row = document.createElement("div");
  row.className = errorText ? "list-row error" : "list-row";
  row.innerHTML = `
    <span class="row-accent work"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta">${esc(entry.start)}–${esc(end)} · ${breakHtml(breakText(entry, stats))}</div>
      ${errorNote}
    </div>
    <span class="list-row-value">${open ? "–" : fmtDur(stats.netMin)}${diffNote}</span>
    <button type="button" class="icon-btn" aria-label="${esc(t("worktime.editAria"))}">${icon("pencil")}</button>
    <button type="button" class="icon-btn danger-icon" aria-label="${esc(t("worktime.deleteAria"))}">${icon("trash")}</button>
  `;
  const [editBtn, deleteBtn] = row.querySelectorAll(".icon-btn");
  editBtn.addEventListener("click", () => {
    switchView("worktime");
    editWorkEntry(entry.id);
  });
  deleteBtn.addEventListener("click", () =>
    confirmAction(
      t("worktime.confirmDelete", { date: fmtDate(entry.date), from: entry.start, to: end }),
      t("common.delete"),
      () => deleteWorkEntry(entry.id)
    )
  );
  return row;
}

// Row for either a work time entry or an absence
export function buildEntryRow(entry, ctx) {
  return isAbsence(entry) ? buildAbsenceRow(entry, ctx) : buildWorkRow(entry, ctx);
}

// Entries of the last days set under Settings → Lists; planned entries and entries with an error always stay
// visible. Everything else is in the calendar.
function visibleWorkEntries(sorted, overlaps) {
  const days = state.settings.workListDays;
  if (!days) return sorted;
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromISO = isoOf(from);
  return sorted.filter((e) => e.date >= fromISO || hasError(e, overlaps));
}

export function renderWorkEntries() {
  const sorted = [...state.work, ...state.absences].sort((a, b) => entrySortKey(b).localeCompare(entrySortKey(a)));
  const ctx = workListContext(state.work, state.absences);
  const visible = visibleWorkEntries(sorted, ctx.overlaps);
  const hidden = sorted.length - visible.length;
  workListHint.textContent = hidden > 0 ? t("common.moreInCalendar", { count: hidden }) : "";
  const emptyText = sorted.length ? t("worktime.emptyRange", { count: state.settings.workListDays }) : t("worktime.empty");
  renderList(worktimeContainer, visible, (e) => buildEntryRow(e, ctx), emptyText);
  renderWeekSummary(ctx.overlaps);
}

// Current week from Monday to Sunday: work time plus absence credits compared to the weekly hours
function renderWeekSummary(overlaps) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayISO = isoOf(monday);
  const sundayISO = isoOf(sunday);

  const inWeek = (e) => e.date >= mondayISO && e.date <= sundayISO;
  const workMin = state.work
    .filter((e) => inWeek(e) && isCounted(e, overlaps))
    .reduce((sum, e) => sum + computeWorktimeStats(e).netMin, 0);
  const absenceMin = state.absences.filter(inWeek).reduce((sum, a) => sum + absenceCreditMin(a), 0);
  const totalMin = workMin + absenceMin;
  const targetMin = Math.round(state.settings.weeklyHours * 60);
  const diff = totalMin - targetMin;

  weekRange.textContent = fmtDateRange(monday, sunday, { day: "2-digit", month: "2-digit", year: "numeric" });
  weekActual.textContent = fmtMin(totalMin);
  weekTarget.textContent = t("worktime.ofTarget", { target: fmtMin(targetMin) });
  weekDelta.textContent = fmtDiff(diff);
  weekDelta.className = "chip " + (diff >= 0 ? "chip-ok" : "chip-warn");
  // Shares of the weekly target, together at most 100 %
  const percent = (min) => Math.min(100, (min / Math.max(1, targetMin)) * 100);
  const workPercent = percent(workMin);
  weekBarWork.style.width = `${workPercent}%`;
  weekBarAbsence.style.width = `${Math.min(100 - workPercent, percent(absenceMin))}%`;
  renderBalance(overlaps);
}

// Overtime account below the week bar; the forecast only if future days are entered
function renderBalance(overlaps) {
  const balance = overtimeBalance(state.work, state.absences, overlaps);
  balanceLine.hidden = !balance;
  if (!balance) return;
  const row = (label, min, cls) =>
    `<div class="balance-row ${cls}"><span>${esc(t(label))}</span><span class="${min >= 0 ? "ok" : "warn"}">${fmtDiff(min)}</span></div>`;
  const forecast = balance.forecast === null ? "" : row("worktime.forecast", balance.forecast, "forecast");
  balanceLine.innerHTML = `${icon("scale")}<div class="balance-rows">${row("worktime.balance", balance.current, "current")}${forecast}</div>`;
}

// Banner below the title while a work time entry has an open end; a tap opens the newest one for editing
export function updateOpenBanner() {
  const open = state.work.filter(isOpen).sort((a, b) => entrySortKey(b).localeCompare(entrySortKey(a)))[0];
  openBanner.hidden = !open || !BANNER_VIEWS.includes(state.currentView);
  if (openBanner.hidden) return;
  const text =
    open.date === todayISO()
      ? t("worktime.openSince", { time: open.start })
      : t("worktime.openOn", { date: fmtDateParts(dateFromISO(open.date), { weekday: "short", day: "2-digit", month: "2-digit" }) });
  openBanner.dataset.id = open.id;
  openBanner.innerHTML = `${icon("alert")}<span>${esc(text)}</span><span class="open-banner-action">${esc(t("worktime.enterEnd"))}${icon("chevronRight")}</span>`;
}

openBanner.addEventListener("click", () => {
  switchView("worktime");
  editWorkEntry(Number(openBanner.dataset.id));
});
