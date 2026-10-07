// Entry point: startup, tab navigation and service worker registration.

import { resetAbsenceForm } from "./absence.js";
import { APP_VERSION, FIRST_YEAR, VIEWS } from "./config.js";
import { renderCalendar, initCalendarState } from "./calendar.js";
import { checkBackupReminder, initCloudBackup, showRestoreResult, updateBackupInfo } from "./data.js";
import { applyI18n, loadLocale, t } from "./i18n.js";
import { icon } from "./icons.js";
import { upgradeStoredData } from "./migrate.js";
import { updateRestUi } from "./rest.js";
import { applyTheme, renderSettingsForm, updateStorageInfo } from "./settings.js";
import { closeSettingsPage, renderSettingsHome, SETTINGS_PAGES } from "./settings-nav.js";
import { state } from "./state.js";
import { damagedKeys, loadAbsences, loadSettings, loadTasks, loadWork } from "./storage.js";
import { renderTasks, restoreTimerState } from "./tasks.js";
import { showInfo } from "./ui.js";
import { $ } from "./util.js";
import { renderWorkEntries, resetWorktimeForm, updateOpenBanner } from "./worktime.js";

// Redraws everything that depends on the data; called after every change
export function refreshAll() {
  renderTasks();
  renderWorkEntries();
  renderCalendar();
  updateRestUi();
  updateOpenBanner();
  updateStorageInfo();
  updateBackupInfo();
}

// On a settings sub-page the title shows the page name with a back arrow in front
export function updateViewTitle() {
  const page = state.currentView === "settings" ? state.settingsPage : null;
  $("viewTitle").textContent = t(page ? SETTINGS_PAGES[page] : "nav." + state.currentView);
  $("headerBackBtn").hidden = !page;
}

export function switchView(view) {
  // Every tab change, including a tap on "Settings" itself, leads back to the settings overview
  closeSettingsPage();
  state.currentView = view;
  VIEWS.forEach((v) => {
    $("view-" + v).hidden = v !== view;
    if (v === view) $("tab-" + v).setAttribute("aria-current", "page");
    else $("tab-" + v).removeAttribute("aria-current");
  });
  updateViewTitle();
  updateRestUi();
  updateOpenBanner();
  window.scrollTo(0, 0);
  if (view === "tasks") renderTasks();
  if (view === "worktime") renderWorkEntries();
  if (view === "calendar") renderCalendar();
  if (view === "settings") {
    renderSettingsForm();
    renderSettingsHome();
  }
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

async function init() {
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  $("appVersion").textContent = `v${APP_VERSION}`;
  const year = new Date().getFullYear();
  $("copyrightYears").textContent = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR);
  upgradeStoredData();
  loadSettings();
  applyTheme();
  await loadLocale();
  applyI18n();
  document.documentElement.classList.add("i18n-ready");

  loadTasks();
  loadWork();
  loadAbsences();
  restoreTimerState();
  resetWorktimeForm();
  resetAbsenceForm();
  initCalendarState();
  renderSettingsForm();
  initCloudBackup();
  refreshAll();
  // The open work time banner changes its text at midnight
  setInterval(() => {
    updateRestUi();
    updateOpenBanner();
  }, 60000);
  switchView("tasks");
  showRestoreResult();
  checkBackupReminder();
  if (damagedKeys.length) showInfo(t("data.damaged"));

  // Asks the browser not to evict the data when storage runs low (does not prevent manual deletion)
  navigator.storage?.persist?.().catch(() => {});
}

// Modules run after the HTML has been parsed, so the app can start right away
init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch((err) => console.warn("Service worker registration failed:", err));
}
