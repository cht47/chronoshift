import { APP_VERSION, FIRST_YEAR, VIEWS } from "./config.js";
import { renderCalendar, initCalendarState } from "./calendar.js";
import { checkBackupReminder, initCloudBackup, showRestoreResult, updateBackupInfo } from "./data.js";
import { applyI18n, loadLocale, t } from "./i18n.js";
import { icon } from "./icons.js";
import { updateRestUi } from "./rest.js";
import { applyTheme, renderSettingsForm, updateStorageInfo } from "./settings.js";
import { state } from "./state.js";
import { loadSettings, loadTasks, loadWork } from "./storage.js";
import { renderEntries, restoreTimerState } from "./tasks.js";
import { $ } from "./util.js";
import { renderWorkEntries, resetWorktimeForm } from "./worktime.js";

export function refreshAll() {
  renderEntries();
  renderWorkEntries();
  renderCalendar();
  updateRestUi();
  updateStorageInfo();
  updateBackupInfo();
}

export function updateViewTitle() {
  $("viewTitle").textContent = t("nav." + state.currentView);
}

export function switchView(view) {
  state.currentView = view;
  VIEWS.forEach((v) => {
    $("view-" + v).hidden = v !== view;
    if (v === view) $("tab-" + v).setAttribute("aria-current", "page");
    else $("tab-" + v).removeAttribute("aria-current");
  });
  updateViewTitle();
  window.scrollTo(0, 0);
  if (view === "tasks") renderEntries();
  if (view === "worktime") renderWorkEntries();
  if (view === "calendar") renderCalendar();
  if (view === "settings") renderSettingsForm();
}

document.querySelectorAll(".nav-item").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

async function init() {
  document.querySelectorAll("[data-icon]").forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
  $("appVersion").textContent = `v${APP_VERSION}`;
  const year = new Date().getFullYear();
  $("copyrightYears").textContent = year > FIRST_YEAR ? `${FIRST_YEAR}–${year}` : String(FIRST_YEAR);
  loadSettings();
  applyTheme();
  await loadLocale();
  applyI18n();
  document.documentElement.classList.add("i18n-ready");

  loadTasks();
  loadWork();
  restoreTimerState();
  resetWorktimeForm();
  initCalendarState();
  renderSettingsForm();
  initCloudBackup();
  refreshAll();
  setInterval(updateRestUi, 60000);
  switchView("tasks");
  showRestoreResult();
  checkBackupReminder();

  // Bittet den Browser, die Daten bei knappem Speicher nicht automatisch zu löschen (schützt nicht vor manuellem Löschen)
  navigator.storage?.persist?.().catch(() => {});
}

// Module laufen erst, wenn das HTML fertig eingelesen ist, daher direkt starten
init();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch((err) => console.warn("Service Worker Fehler:", err));
}
