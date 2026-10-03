import { updateViewTitle } from "./app.js";
import { WEEK_FROM_MONDAY } from "./config.js";
import { backupIsStale, newestBackup, resetDeleteBefore } from "./data.js";
import { fmtDate, fmtNumber, t, weekdayShortNames } from "./i18n.js";
import { state } from "./state.js";
import { storageChars } from "./storage.js";
import { $, isoOf } from "./util.js";

// Einstellungen als Übersicht mit Unterseiten. Jede Unterseite bekommt einen Eintrag im Browser-Verlauf,
// damit die Zurück-Geste von Android zur Übersicht führt, statt die App zu schließen.
export const SETTINGS_PAGES = {
  worktime: "settings.worktime",
  rest: "settings.rest",
  backup: "settings.backupPage",
  data: "settings.dataPage",
};

const settingsHome = $("settingsHome");

function showPage(page) {
  state.settingsPage = page;
  settingsHome.hidden = !!page;
  for (const p of Object.keys(SETTINGS_PAGES)) $(`settingsPage-${p}`).hidden = p !== page;
  if (!page) renderSettingsHome();
  updateViewTitle();
  window.scrollTo(0, 0);
}

export function openSettingsPage(page) {
  if (page === "data") resetDeleteBefore();
  showPage(page);
  history.pushState({ settingsPage: page }, "");
}

// Zurück zur Übersicht, z. B. beim Tab-Wechsel; der Verlaufseintrag der Unterseite wird mit entfernt
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

// Kurzform der Arbeitstage: zusammenhängend als "Mo–Fr", sonst einzeln "Mo, Mi, Fr"
function workDaysText() {
  const names = weekdayShortNames();
  const indexes = WEEK_FROM_MONDAY.map((day, i) => (state.settings.workDays.includes(day) ? i : -1)).filter((i) => i >= 0);
  const contiguous = indexes.every((idx, n) => n === 0 || idx === indexes[n - 1] + 1);
  if (contiguous && indexes.length >= 3) return `${names[indexes[0]]}–${names[indexes.at(-1)]}`;
  return indexes.map((i) => names[i]).join(", ");
}

export function renderSettingsHome() {
  const s = state.settings;
  $("sumWorktime").textContent = `${fmtNumber(s.wochensollstunden)} h · ${workDaysText()}`;
  $("sumRest").textContent = s.ruhezeitEnabled
    ? `${fmtNumber(s.restHours)} h${s.ruhezeitBannerEnabled ? ` · ${t("settings.sumBanner")}` : ""}`
    : t("settings.sumOff");
  const newest = newestBackup();
  const sumBackup = $("sumBackup");
  sumBackup.textContent = newest ? fmtDate(isoOf(new Date(newest))) : t("settings.sumNoBackup");
  sumBackup.classList.toggle("warn", backupIsStale());
  $("sumData").textContent = `${fmtNumber(storageChars() / 1024, 1)} KB`;
}
