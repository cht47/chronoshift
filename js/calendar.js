import { fmtDateParts, t } from "./i18n.js";
import { state } from "./state.js";
import { buildTaskRow, taskDateISO } from "./tasks.js";
import { renderList } from "./ui.js";
import { $, dateFromISO, esc, isoOf, todayISO } from "./util.js";
import { buildWorkRow } from "./worktime.js";
import { compareWorkAsc, overlappingWorkIds } from "./worktime-calc.js";

const calGrid = $("calGrid");
const calWeekdays = $("calWeekdays");
const calLabel = $("calLabel");
const calDayDetail = $("calDayDetail");

export function initCalendarState() {
  const now = new Date();
  state.cal.year = now.getFullYear();
  state.cal.month = now.getMonth();
  state.cal.selectedISO = todayISO();
}

// Kurze Wochentagsnamen ab Montag, z. B. "Mo" / "Mon"
function weekdayLabels() {
  const monday = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) =>
    fmtDateParts(new Date(2024, 0, monday.getDate() + i), { weekday: "short" }).replace(/\.$/, "")
  );
}

export function renderCalendar() {
  const { year, month } = state.cal;
  calLabel.textContent = fmtDateParts(new Date(year, month, 1), { month: "long", year: "numeric" });
  calWeekdays.innerHTML = weekdayLabels().map((l) => `<div class="cal-weekday">${esc(l)}</div>`).join("");

  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // Montag = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const taskDates = new Set(state.tasks.map(taskDateISO));
  const workDates = new Set(state.work.map((e) => e.datum));
  const overlaps = overlappingWorkIds(state.work);
  const overlapDates = new Set(state.work.filter((e) => overlaps.has(e.id)).map((e) => e.datum));
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

  renderDayDetail();
}

function renderDayDetail() {
  const selected = state.cal.selectedISO;
  calDayDetail.innerHTML = "";
  if (!selected) return;

  const dayTasks = state.tasks.filter((e) => taskDateISO(e) === selected).sort((a, b) => a.stopMs - b.stopMs);
  const dayWork = state.work.filter((e) => e.datum === selected).sort(compareWorkAsc);
  const title = fmtDateParts(dateFromISO(selected), { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });

  calDayDetail.insertAdjacentHTML("beforeend", `<div class="section-label"><span>${esc(title)}</span></div>`);
  const container = document.createElement("div");
  const overlaps = overlappingWorkIds(state.work);
  renderList(container, [...dayWork, ...dayTasks], (e) => ("datum" in e ? buildWorkRow(e, overlaps) : buildTaskRow(e)), t("calendar.empty"));
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
