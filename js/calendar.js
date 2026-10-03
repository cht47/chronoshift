import { fmtDateParts, t, weekdayShortNames } from "./i18n.js";
import { state } from "./state.js";
import { buildTaskRow, taskDateISO } from "./tasks.js";
import { renderList } from "./ui.js";
import { $, dateFromISO, esc, fmtDur, fmtMin, isoOf, todayISO } from "./util.js";
import { buildWorkRow } from "./worktime.js";
import { compareWorkAsc, computeWorktimeStats, workListContext } from "./worktime-calc.js";

const calGrid = $("calGrid");
const calWeekdays = $("calWeekdays");
const calLabel = $("calLabel");
const calDayDetail = $("calDayDetail");
const calMonthSummary = $("calMonthSummary");

export function initCalendarState() {
  const now = new Date();
  state.cal.year = now.getFullYear();
  state.cal.month = now.getMonth();
  state.cal.selectedISO = todayISO();
}

export function renderCalendar() {
  const { year, month } = state.cal;
  calLabel.textContent = fmtDateParts(new Date(year, month, 1), { month: "long", year: "numeric" });
  calWeekdays.innerHTML = weekdayShortNames().map((l) => `<div class="cal-weekday">${esc(l)}</div>`).join("");

  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const taskDates = new Set(state.tasks.map(taskDateISO));
  const workDates = new Set(state.work.map((e) => e.datum));
  const ctx = workListContext(state.work);
  const overlapDates = new Set(state.work.filter((e) => ctx.overlaps.has(e.id)).map((e) => e.datum));
  const todayIso = todayISO();

  let html = "<div></div>".repeat(startOffset);
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const iso = isoOf(date);
    const classes = ["cal-cell"];
    if (iso === todayIso) classes.push("today");
    if (iso === state.cal.selectedISO) classes.push("selected");
    const label = fmtDateParts(date, { weekday: "long", day: "numeric", month: "long" });
    html += `<button type="button" class="${classes.join(" ")}" data-date="${iso}" aria-label="${esc(label)}">
      <span class="cal-num">${day}</span>
      <span class="cal-dots">
        ${taskDates.has(iso) ? '<span class="dot task"></span>' : ""}
        ${workDates.has(iso) ? '<span class="dot work"></span>' : ""}
        ${overlapDates.has(iso) ? '<span class="dot overlap"></span>' : ""}
      </span>
    </button>`;
  }
  calGrid.innerHTML = html;
  calGrid.querySelectorAll("[data-date]").forEach((cell) => {
    cell.addEventListener("click", () => {
      state.cal.selectedISO = cell.dataset.date;
      renderCalendar();
    });
  });

  renderMonthSummary(ctx.overlaps);
  renderDayDetail(ctx);
}

// Summen des angezeigten Monats; Überschneidungen zählen wie in der Wochensumme nicht
function renderMonthSummary(overlaps) {
  const monthPrefix = isoOf(new Date(state.cal.year, state.cal.month, 1)).slice(0, 8);
  const workMin = state.work
    .filter((e) => e.datum.startsWith(monthPrefix) && !overlaps.has(e.id))
    .reduce((sum, e) => sum + computeWorktimeStats(e).nettoMin, 0);
  const tasks = state.tasks.filter((e) => taskDateISO(e).startsWith(monthPrefix));
  const taskMin = tasks.reduce((sum, e) => sum + e.durationMin, 0);
  calMonthSummary.innerHTML = `
    <span><span class="dot work"></span>${esc(t("common.worktime"))} <strong>${fmtMin(workMin)}</strong></span>
    <span><span class="dot task"></span>${esc(t("calendar.tasks"))} <strong>${tasks.length} · ${fmtDur(taskMin)}</strong></span>`;
}

function renderDayDetail(ctx) {
  const selected = state.cal.selectedISO;
  calDayDetail.innerHTML = "";
  if (!selected) return;

  const dayTasks = state.tasks.filter((e) => taskDateISO(e) === selected).sort((a, b) => a.stopMs - b.stopMs);
  const dayWork = state.work.filter((e) => e.datum === selected).sort(compareWorkAsc);
  const title = fmtDateParts(dateFromISO(selected), { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

  calDayDetail.insertAdjacentHTML("beforeend", `<div class="section-label"><span>${esc(title)}</span></div>`);
  const container = document.createElement("div");
  renderList(container, [...dayWork, ...dayTasks], (e) => ("datum" in e ? buildWorkRow(e, ctx) : buildTaskRow(e)), t("calendar.empty"));
  calDayDetail.appendChild(container);
}

$("calPrevBtn").addEventListener("click", () => {
  state.cal.month--;
  if (state.cal.month < 0) {
    state.cal.month = 11;
    state.cal.year--;
  }
  renderCalendar();
});

$("calNextBtn").addEventListener("click", () => {
  state.cal.month++;
  if (state.cal.month > 11) {
    state.cal.month = 0;
    state.cal.year++;
  }
  renderCalendar();
});
