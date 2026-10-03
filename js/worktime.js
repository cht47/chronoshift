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
  overtimeBalance,
  workListContext,
  worktimePauseRange,
  worktimeRange,
} from "./worktime-calc.js";

const weekRange = $("weekRange");
const weekIst = $("weekIst");
const weekSoll = $("weekSoll");
const weekDelta = $("weekDelta");
const weekBarWork = $("weekBarWork");
const weekBarAbsence = $("weekBarAbsence");
const balanceLine = $("balanceLine");
const worktimeForm = $("worktimeForm");
const wtFormTitle = $("wtFormTitle");
const wtDatum = $("wtDatum");
const wtBeginn = $("wtBeginn");
const wtEnde = $("wtEnde");
const wtPauseVon = $("wtPauseVon");
const wtPauseBis = $("wtPauseBis");
const wtSaveBtn = $("wtSaveBtn");
const wtCancelBtn = $("wtCancelBtn");
const worktimeContainer = $("worktimeContainer");
const entryModeSwitch = $("entryModeSwitch");
const absenceForm = $("absenceForm");

// Umschalter über dem Formular: Arbeitszeit oder Abwesenheit
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
  wtFormTitle.textContent = editing ? t("worktime.editTitle", { date: fmtDate(editing.datum) }) : t("worktime.formTitle");
  wtSaveBtn.textContent = t(editing ? "common.update" : "common.save");
  wtCancelBtn.hidden = !editing;
}

export function resetWorktimeForm() {
  worktimeForm.reset();
  wtDatum.value = todayISO();
  state.editingWorkId = null;
  updateWorktimeFormText();
}

worktimeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (wtBeginn.value === wtEnde.value) {
    showInfo(t("worktime.errorSameStartEnd"));
    return;
  }
  if (!!wtPauseVon.value !== !!wtPauseBis.value) {
    showInfo(t("worktime.errorBreakIncomplete"));
    return;
  }
  if (wtPauseVon.value && wtPauseVon.value === wtPauseBis.value) {
    showInfo(t("worktime.errorBreakSame"));
    return;
  }
  const entry = {
    id: state.editingWorkId ?? Date.now(),
    datum: wtDatum.value,
    beginn: wtBeginn.value,
    ende: wtEnde.value,
    pauseVon: wtPauseVon.value || null,
    pauseBis: wtPauseBis.value || null,
  };
  const pause = worktimePauseRange(entry);
  if (pause) {
    const { startMs, endMs } = worktimeRange(entry);
    if (pause.pVon < startMs || pause.pBis > endMs) {
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

  if (entry.ende < entry.beginn) {
    confirmAction(t("worktime.confirmNightShift", { end: entry.ende, start: entry.beginn }), t("common.save"), save);
  } else {
    save();
  }
});

wtCancelBtn.addEventListener("click", resetWorktimeForm);

function editWorkEntry(id) {
  const entry = state.work.find((x) => x.id === id);
  if (!entry) return;
  setEntryMode("work");
  wtDatum.value = entry.datum;
  wtBeginn.value = entry.beginn;
  wtEnde.value = entry.ende;
  wtPauseVon.value = entry.pauseVon || "";
  wtPauseBis.value = entry.pauseBis || "";
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

function pauseTextFor(entry, stats) {
  if (stats.pauseManual) return t("worktime.breakManual", { from: entry.pauseVon, to: entry.pauseBis });
  if (stats.pauseMin > 0) return t("worktime.breakAuto", { duration: fmtDur(stats.pauseMin) });
  return t("worktime.noBreak");
}

// ctx: Ergebnis von workListContext, einmal pro Liste berechnet
export function buildWorkRow(entry, ctx) {
  const stats = computeWorktimeStats(entry);
  const overlap = ctx.overlaps.has(entry.id);
  const dayDiff = ctx.dayDiffs.get(entry);
  const diffNote =
    dayDiff === undefined ? "" : `<small class="value-diff ${dayDiff >= 0 ? "ok" : "warn"}">${fmtDiff(dayDiff)}</small>`;
  const overlapNote = overlap ? `<div class="list-row-meta overlap-note">${esc(t("worktime.overlapNote"))}</div>` : "";
  const title = fmtDateParts(dateFromISO(entry.datum), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const row = document.createElement("div");
  row.className = overlap ? "list-row overlap" : "list-row";
  row.innerHTML = `
    <span class="row-accent work"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta">${esc(entry.beginn)}–${esc(entry.ende)} · ${esc(pauseTextFor(entry, stats))}</div>
      ${overlapNote}
    </div>
    <span class="list-row-value">${fmtDur(stats.nettoMin)}${diffNote}</span>
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
      t("worktime.confirmDelete", { date: fmtDate(entry.datum), from: entry.beginn, to: entry.ende }),
      t("common.delete"),
      () => deleteWorkEntry(entry.id)
    )
  );
  return row;
}

// Baut die passende Zeile für eine Arbeitszeit oder eine Abwesenheit
export function buildEntryRow(entry, ctx) {
  return "typ" in entry ? buildAbsenceRow(entry, ctx) : buildWorkRow(entry, ctx);
}

export function renderWorkEntries() {
  const sorted = [...state.work, ...state.absences].sort((a, b) => entrySortKey(b).localeCompare(entrySortKey(a)));
  const ctx = workListContext(state.work, state.absences);
  renderList(worktimeContainer, sorted, (e) => buildEntryRow(e, ctx), t("worktime.empty"));
  renderWeekSummary(ctx.overlaps);
}

function renderWeekSummary(overlaps) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayISO = isoOf(monday);
  const sundayISO = isoOf(sunday);

  const inWeek = (e) => e.datum >= mondayISO && e.datum <= sundayISO;
  const workMin = state.work
    .filter((e) => inWeek(e) && !overlaps.has(e.id))
    .reduce((sum, e) => sum + computeWorktimeStats(e).nettoMin, 0);
  const absenceMin = state.absences.filter(inWeek).reduce((sum, a) => sum + absenceCreditMin(a), 0);
  const nettoSum = workMin + absenceMin;
  const sollMin = Math.round(state.settings.wochensollstunden * 60);
  const diff = nettoSum - sollMin;

  weekRange.textContent = fmtDateRange(monday, sunday, { day: "2-digit", month: "2-digit", year: "numeric" });
  weekIst.textContent = fmtMin(nettoSum);
  weekSoll.textContent = t("worktime.ofTarget", { target: fmtMin(sollMin) });
  weekDelta.textContent = fmtDiff(diff);
  weekDelta.className = "chip " + (diff >= 0 ? "chip-ok" : "chip-warn");
  // Anteile am Wochensoll, zusammen höchstens 100 %
  const percent = (min) => Math.min(100, (min / Math.max(1, sollMin)) * 100);
  const workPercent = percent(workMin);
  weekBarWork.style.width = `${workPercent}%`;
  weekBarAbsence.style.width = `${Math.min(100 - workPercent, percent(absenceMin))}%`;
  renderBalance(overlaps);
}

// Stundenkonto unter dem Wochenbalken; die Prognose nur, wenn künftige Tage eingetragen sind
function renderBalance(overlaps) {
  const balance = overtimeBalance(state.work, state.absences, overlaps);
  balanceLine.hidden = !balance;
  if (!balance) return;
  const row = (label, min, cls) =>
    `<div class="balance-row ${cls}"><span>${esc(t(label))}</span><span class="${min >= 0 ? "ok" : "warn"}">${fmtDiff(min)}</span></div>`;
  const forecast = balance.forecast === null ? "" : row("worktime.forecast", balance.forecast, "forecast");
  balanceLine.innerHTML = `${icon("scale")}<div class="balance-rows">${row("worktime.balance", balance.current, "current")}${forecast}</div>`;
}
