// "Work time" tab: form for work time entries, the list of work time and absences, and the week card
// with weekly total and overtime account.

import { refreshAll, switchView } from "./app.js";
import { buildAbsenceRow, resetAbsenceForm } from "./absence.js";
import { fmtDate, fmtDateParts, fmtDateRange, t } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { saveWork } from "./storage.js";
import { confirmAction, renderList, showInfo } from "./ui.js";
import { $, dateFromISO, esc, fmtDiff, fmtDur, fmtMin, isoOf, todayISO } from "./util.js";
import {
  absenceCreditMin,
  computeWorktimeStats,
  entrySortKey,
  isAbsence,
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
    end: wtEnd.value,
    breakStart: wtBreakStart.value || null,
    breakEnd: wtBreakEnd.value || null,
  };
  const manualBreak = worktimeBreakRange(entry);
  if (manualBreak) {
    const { startMs, endMs } = worktimeRange(entry);
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
  if (entry.end < entry.start) {
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
  wtEnd.value = entry.end;
  wtBreakStart.value = entry.breakStart || "";
  wtBreakEnd.value = entry.breakEnd || "";
  state.editingWorkId = id;
  updateWorktimeFormText();
  worktimeForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteWorkEntry(id) {
  state.work = state.work.filter((x) => x.id !== id);
  if (state.editingWorkId === id) resetWorktimeForm();
  saveWork();
  refreshAll();
}

function breakText(entry, stats) {
  if (stats.breakManual) return t("worktime.breakManual", { from: entry.breakStart, to: entry.breakEnd });
  if (stats.breakMin > 0) return t("worktime.breakAuto", { duration: fmtDur(stats.breakMin) });
  return t("worktime.noBreak");
}

// ctx: result of workListContext, calculated once per list
function buildWorkRow(entry, ctx) {
  const stats = computeWorktimeStats(entry);
  const overlap = ctx.overlaps.has(entry.id);
  const dayDiff = ctx.dayDiffs.get(entry);
  const diffNote =
    dayDiff === undefined ? "" : `<small class="value-diff ${dayDiff >= 0 ? "ok" : "warn"}">${fmtDiff(dayDiff)}</small>`;
  const overlapNote = overlap ? `<div class="list-row-meta overlap-note">${esc(t("worktime.overlapNote"))}</div>` : "";
  const title = fmtDateParts(dateFromISO(entry.date), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const row = document.createElement("div");
  row.className = overlap ? "list-row overlap" : "list-row";
  row.innerHTML = `
    <span class="row-accent work"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta">${esc(entry.start)}–${esc(entry.end)} · ${esc(breakText(entry, stats))}</div>
      ${overlapNote}
    </div>
    <span class="list-row-value">${fmtDur(stats.netMin)}${diffNote}</span>
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
      t("worktime.confirmDelete", { date: fmtDate(entry.date), from: entry.start, to: entry.end }),
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

export function renderWorkEntries() {
  const sorted = [...state.work, ...state.absences].sort((a, b) => entrySortKey(b).localeCompare(entrySortKey(a)));
  const ctx = workListContext(state.work, state.absences);
  renderList(worktimeContainer, sorted, (e) => buildEntryRow(e, ctx), t("worktime.empty"));
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
    .filter((e) => inWeek(e) && !overlaps.has(e.id))
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
