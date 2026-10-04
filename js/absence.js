// Absences (vacation, half vacation day, sick leave, public holiday): form and list rows.
// An absence covers a whole day (or half a day) and credits the daily target, see absenceCreditMin.

import { refreshAll, switchView } from "./app.js";
import { ABSENCE_TYPES } from "./config.js";
import { fmtDate, fmtDateParts, t } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { saveAbsences } from "./storage.js";
import { confirmAction, showInfo, showToast } from "./ui.js";
import { $, dateFromISO, esc, fmtDiff, fmtDur, nextDayISO, todayISO } from "./util.js";
import { absenceCreditMin } from "./worktime-calc.js";
import { setEntryMode } from "./worktime.js";

// Longest date range that can be entered at once
const MAX_DAYS = 366;

const absenceForm = $("absenceForm");
const abFormTitle = $("abFormTitle");
const abType = $("abType");
const abFromLabel = $("abFromLabel");
const abFrom = $("abFrom");
const abToWrap = $("abToWrap");
const abTo = $("abTo");
const abSaveBtn = $("abSaveBtn");
const abCancelBtn = $("abCancelBtn");

const typeName = (type) => t(`absence.types.${type}`);

// Also called after a language change: rebuilds the type options and keeps the selected type
export function updateAbsenceFormText() {
  const selected = abType.value || ABSENCE_TYPES[0];
  abType.innerHTML = ABSENCE_TYPES.map((type) => `<option value="${type}">${esc(typeName(type))}</option>`).join("");
  abType.value = selected;
  const editing = state.editingAbsenceId !== null ? state.absences.find((a) => a.id === state.editingAbsenceId) : null;
  abFormTitle.textContent = editing ? t("absence.editTitle", { date: fmtDate(editing.date) }) : t("absence.formTitle");
  // Editing changes exactly one day; a date range is only available for new entries
  abFromLabel.textContent = t(editing ? "worktime.date" : "absence.from");
  abToWrap.hidden = !!editing;
  abSaveBtn.textContent = t(editing ? "common.update" : "common.save");
  abCancelBtn.hidden = !editing;
}

export function resetAbsenceForm() {
  absenceForm.reset();
  abFrom.value = todayISO();
  abTo.value = todayISO();
  state.editingAbsenceId = null;
  updateAbsenceFormText();
}

// The end date follows the start date so the range never ends before it starts
abFrom.addEventListener("change", () => {
  if (abFrom.value && (!abTo.value || abTo.value < abFrom.value)) abTo.value = abFrom.value;
});

function updateExisting(type) {
  const date = abFrom.value;
  if (state.absences.some((a) => a.date === date && a.id !== state.editingAbsenceId)) {
    showInfo(t("absence.errorExists"));
    return false;
  }
  const entry = state.absences.find((a) => a.id === state.editingAbsenceId);
  entry.date = date;
  entry.type = type;
  return true;
}

// Adds one entry per work day in the range; days off and days that already have an absence are skipped
function addRange(type) {
  const from = abFrom.value;
  const to = abTo.value || from;
  if (to < from) {
    showInfo(t("absence.errorRange"));
    return false;
  }
  const days = [];
  for (let d = from; d <= to && days.length <= MAX_DAYS; d = nextDayISO(d)) days.push(d);
  if (days.length > MAX_DAYS) {
    showInfo(t("absence.errorTooLong"));
    return false;
  }
  const taken = new Set(state.absences.map((a) => a.date));
  const newDays = days.filter((d) => state.settings.workDays.includes(dateFromISO(d).getDay()) && !taken.has(d));
  if (!newDays.length) {
    showInfo(t("absence.errorNoWorkDay"));
    return false;
  }
  const baseId = Date.now();
  newDays.forEach((date, i) => state.absences.push({ id: baseId + i, date, type }));
  if (newDays.length > 1) showToast(t("absence.savedDays", { count: newDays.length }));
  return true;
}

absenceForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const type = abType.value;
  const ok = state.editingAbsenceId !== null ? updateExisting(type) : addRange(type);
  if (!ok) return;
  saveAbsences();
  resetAbsenceForm();
  refreshAll();
});

abCancelBtn.addEventListener("click", resetAbsenceForm);

function editAbsence(id) {
  const entry = state.absences.find((a) => a.id === id);
  if (!entry) return;
  setEntryMode("absence");
  state.editingAbsenceId = id;
  abType.value = entry.type;
  abFrom.value = entry.date;
  abTo.value = entry.date;
  updateAbsenceFormText();
  absenceForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteAbsence(id) {
  state.absences = state.absences.filter((a) => a.id !== id);
  if (state.editingAbsenceId === id) resetAbsenceForm();
  saveAbsences();
  refreshAll();
}

// ctx: result of workListContext, calculated once per list
export function buildAbsenceRow(entry, ctx) {
  const dayDiff = ctx.dayDiffs.get(entry);
  const diffNote =
    dayDiff === undefined ? "" : `<small class="value-diff ${dayDiff >= 0 ? "ok" : "warn"}">${fmtDiff(dayDiff)}</small>`;
  const title = fmtDateParts(dateFromISO(entry.date), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  // The half vacation day already says "half day" in its name
  const meta = entry.type === "vacationHalf" ? "" : ` · ${esc(t("absence.fullDay"))}`;
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
    <span class="row-accent absence"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta"><span class="absence-type">${esc(typeName(entry.type))}</span>${meta}</div>
    </div>
    <span class="list-row-value">${fmtDur(absenceCreditMin(entry))}${diffNote}</span>
    <button type="button" class="icon-btn" aria-label="${esc(t("absence.editAria"))}">${icon("pencil")}</button>
    <button type="button" class="icon-btn danger-icon" aria-label="${esc(t("absence.deleteAria"))}">${icon("trash")}</button>
  `;
  const [editBtn, deleteBtn] = row.querySelectorAll(".icon-btn");
  editBtn.addEventListener("click", () => {
    switchView("worktime");
    editAbsence(entry.id);
  });
  deleteBtn.addEventListener("click", () =>
    confirmAction(
      t("absence.confirmDelete", { type: typeName(entry.type), date: fmtDate(entry.date) }),
      t("common.delete"),
      () => deleteAbsence(entry.id)
    )
  );
  return row;
}
