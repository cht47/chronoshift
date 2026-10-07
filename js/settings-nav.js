// Settings overview with sub-pages. Every sub-page adds an entry to the browser history, so the
// Android back gesture returns to the overview instead of closing the app.

import { updateViewTitle } from "./app.js";
import { WEEK_FROM_MONDAY } from "./config.js";
import { backupIsStale, newestBackup, resetDeleteBefore } from "./data.js";
import { fmtDate, fmtNumber, t, weekdayShortNames } from "./i18n.js";
import { state } from "./state.js";
import { storageChars } from "./storage.js";
import { $, isoOf } from "./util.js";

// Sub-page name -> translation key of its title. Each page is an element with id "settingsPage-<name>".
export const SETTINGS_PAGES = {
  lists: "settings.lists",
  worktime: "settings.worktime",
  rest: "settings.rest",
  backup: "settings.backupPage",
  data: "settings.dataPage",
};

const settingsHome = $("settingsHome");

// page: name of a sub-page, or null for the overview
function showPage(page) {
  state.settingsPage = page;
  settingsHome.hidden = !!page;
  for (const p of Object.keys(SETTINGS_PAGES)) $(`settingsPage-${p}`).hidden = p !== page;
  if (!page) renderSettingsHome();
  updateViewTitle();
  window.scrollTo(0, 0);
}

function openSettingsPage(page) {
  if (page === "data") resetDeleteBefore();
  showPage(page);
  history.pushState({ settingsPage: page }, "");
}

// Back to the overview, e.g. on a tab change; also removes the history entry of the sub-page
export function closeSettingsPage() {
  if (!state.settingsPage) return;
  showPage(null);
  history.back();
}

settingsHome.querySelectorAll("[data-page]").forEach((btn) => btn.addEventListener("click", () => openSettingsPage(btn.dataset.page)));
$("headerBackBtn").addEventListener("click", () => history.back());
window.addEventListener("popstate", () => {
  if (state.settingsPage) showPage(null);
});

// Short form of the work days: consecutive days as "Mon–Fri", otherwise listed as "Mon, Wed, Fri"
function workDaysText() {
  const names = weekdayShortNames();
  const indexes = WEEK_FROM_MONDAY.map((day, i) => (state.settings.workDays.includes(day) ? i : -1)).filter((i) => i >= 0);
  const contiguous = indexes.every((idx, n) => n === 0 || idx === indexes[n - 1] + 1);
  if (contiguous && indexes.length >= 3) return `${names[indexes[0]]}–${names[indexes.at(-1)]}`;
  return indexes.map((i) => names[i]).join(", ");
}

// Labels of the list settings, also used on the "Lists" page
export const taskCountText = (count) => t("settings.taskCount", { count });
export const listDaysText = (days) => (days ? t("settings.listDays", { count: days }) : t("settings.listAll"));

// Current values shown next to each sub-page in the overview
export function renderSettingsHome() {
  const s = state.settings;
  $("sumLists").textContent = `${taskCountText(s.taskListCount)} · ${listDaysText(s.workListDays)}`;
  $("sumWorktime").textContent = `${fmtNumber(s.weeklyHours)} h · ${workDaysText()}`;
  $("sumRest").textContent = s.restEnabled
    ? `${fmtNumber(s.restHours)} h${s.restBannerEnabled ? ` · ${t("settings.sumBanner")}` : ""}`
    : t("settings.sumOff");
  const newest = newestBackup();
  const sumBackup = $("sumBackup");
  sumBackup.textContent = newest ? fmtDate(isoOf(new Date(newest))) : t("settings.sumNoBackup");
  sumBackup.classList.toggle("warn", backupIsStale());
  $("sumData").textContent = `${fmtNumber(storageChars() / 1024, 1)} KB`;
}
