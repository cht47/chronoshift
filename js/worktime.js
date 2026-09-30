import { refreshAll, switchView } from "./app.js";
import { fmtDate, fmtDateParts, fmtDateRange, t } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { saveWork } from "./storage.js";
import { confirmAction, renderList, showInfo } from "./ui.js";
import { $, dateFromISO, esc, fmtDur, fmtMin, isoOf, todayISO } from "./util.js";
import {
  compareWorkAsc,
  computeWorktimeStats,
  findOverlappingWork,
  overlappingWorkIds,
  worktimePauseRange,
  worktimeRange,
} from "./worktime-calc.js";

const weekRange = $("weekRange");
const weekIst = $("weekIst");
const weekSoll = $("weekSoll");
const weekDelta = $("weekDelta");
const weekProgress = $("weekProgress");
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
  const overlap = findOverlappingWork(entry, state.work);
  if (overlap) {
    showInfo(t("worktime.errorOverlap", { date: fmtDate(overlap.datum), from: overlap.beginn, to: overlap.ende }));
    return;
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

// overlaps: Ergebnis von overlappingWorkIds, einmal pro Liste berechnet
export function buildWorkRow(entry, overlaps) {
  const stats = computeWorktimeStats(entry);
  const overlapNote = overlaps.has(entry.id) ? `<div class="list-row-meta warn">${esc(t("worktime.overlapNote"))}</div>` : "";
  const title = fmtDateParts(dateFromISO(entry.datum), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
    <span class="row-accent work"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(title)}</div>
      <div class="list-row-meta">${esc(entry.beginn)}–${esc(entry.ende)} · ${esc(pauseTextFor(entry, stats))}</div>
      ${overlapNote}
    </div>
    <span class="list-row-value">${fmtDur(stats.nettoMin)}</span>
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

export function renderWorkEntries() {
  const sorted = [...state.work].sort((a, b) => compareWorkAsc(b, a));
  const overlaps = overlappingWorkIds(state.work);
  renderList(worktimeContainer, sorted, (e) => buildWorkRow(e, overlaps), t("worktime.empty"));
  renderWeekSummary(overlaps);
}

function renderWeekSummary(overlaps) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayISO = isoOf(monday);
  const sundayISO = isoOf(sunday);

  const nettoSum = state.work
    .filter((e) => e.datum >= mondayISO && e.datum <= sundayISO && !overlaps.has(e.id))
    .reduce((sum, e) => sum + computeWorktimeStats(e).nettoMin, 0);
  const sollMin = Math.round(state.settings.wochensollstunden * 60);
  const diff = nettoSum - sollMin;

  weekRange.textContent = fmtDateRange(monday, sunday, { day: "2-digit", month: "2-digit", year: "numeric" });
  weekIst.textContent = fmtMin(nettoSum);
  weekSoll.textContent = t("worktime.ofTarget", { target: fmtMin(sollMin) });
  weekDelta.textContent = `${diff >= 0 ? "+" : ""}${fmtMin(diff)}`;
  weekDelta.className = "chip " + (diff >= 0 ? "chip-ok" : "chip-warn");
  weekProgress.max = Math.max(1, sollMin);
  weekProgress.value = Math.min(nettoSum, sollMin);
}
