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

// Abwesenheiten (Urlaub, Krank, Feiertag) gelten ganztägig bzw. als halber Tag und schreiben das Tagessoll gut
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

const typeName = (typ) => t(`absence.types.${typ}`);

// Auch nach einem Sprachwechsel aufrufen: baut die Auswahl neu auf und behält die gewählte Art
export function updateAbsenceFormText() {
  const selected = abType.value || ABSENCE_TYPES[0];
  abType.innerHTML = ABSENCE_TYPES.map((typ) => `<option value="${typ}">${esc(typeName(typ))}</option>`).join("");
  abType.value = selected;
  const editing = state.editingAbsenceId !== null ? state.absences.find((a) => a.id === state.editingAbsenceId) : null;
  abFormTitle.textContent = editing ? t("absence.editTitle", { date: fmtDate(editing.datum) }) : t("absence.formTitle");
  // Beim Bearbeiten geht es um genau einen Tag, ein Zeitraum nur beim Eintragen
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

// Bis darf nicht vor Von liegen; beim Verschieben von Von wandert Bis mit
abFrom.addEventListener("change", () => {
  if (abFrom.value && (!abTo.value || abTo.value < abFrom.value)) abTo.value = abFrom.value;
});

function updateExisting(typ) {
  const datum = abFrom.value;
  if (state.absences.some((a) => a.datum === datum && a.id !== state.editingAbsenceId)) {
    showInfo(t("absence.errorExists"));
    return false;
  }
  const entry = state.absences.find((a) => a.id === state.editingAbsenceId);
  entry.datum = datum;
  entry.typ = typ;
  return true;
}

// Legt pro Arbeitstag im Zeitraum einen Eintrag an; freie Tage und Tage mit Abwesenheit werden übersprungen
function addRange(typ) {
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
  const taken = new Set(state.absences.map((a) => a.datum));
  const newDays = days.filter((d) => state.settings.workDays.includes(dateFromISO(d).getDay()) && !taken.has(d));
  if (!newDays.length) {
    showInfo(t("absence.errorNoWorkDay"));
    return false;
  }
  const baseId = Date.now();
  newDays.forEach((datum, i) => state.absences.push({ id: baseId + i, datum, typ }));
  if (newDays.length > 1) showToast(t("absence.savedDays", { count: newDays.length }));
  return true;
}

absenceForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const typ = abType.value;
  const ok = state.editingAbsenceId !== null ? updateExisting(typ) : addRange(typ);
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
  abType.value = entry.typ;
  abFrom.value = entry.datum;
  abTo.value = entry.datum;
  updateAbsenceFormText();
  absenceForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteAbsence(id) {
  state.absences = state.absences.filter((a) => a.id !== id);
  if (state.editingAbsenceId === id) resetAbsenceForm();
  saveAbsences();
  refreshAll();
}

// ctx: Ergebnis von workListContext, einmal pro Liste berechnet
export function buildAbsenceRow(entry, ctx) {
  const dayDiff = ctx.dayDiffs.get(entry);
  const diffNote =
    dayDiff === undefined ? "" : `<small class="value-diff ${dayDiff >= 0 ? "ok" : "warn"}">${fmtDiff(dayDiff)}</small>`;
  const title = fmtDateParts(dateFromISO(entry.datum), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  // Der halbe Urlaubstag trägt "halber Tag" schon im Namen
  const meta = entry.typ === "vacationHalf" ? "" : ` · ${esc(t("absence.fullDay"))}`;
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
    <span class="row-accent absence"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta"><span class="absence-type">${esc(typeName(entry.typ))}</span>${meta}</div>
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
      t("absence.confirmDelete", { type: typeName(entry.typ), date: fmtDate(entry.datum) }),
      t("common.delete"),
      () => deleteAbsence(entry.id)
    )
  );
  return row;
}
