// Settings: form fields of the settings pages, theme, language, app installation and overtime account.
// Every change is saved immediately; there is no save button.

import { refreshAll, updateViewTitle } from "./app.js";
import { updateAbsenceFormText } from "./absence.js";
import { LANGUAGES, TASK_LIST_COUNTS, WEEK_FROM_MONDAY, WORK_LIST_DAYS } from "./config.js";
import { applyI18n, fmtDate, fmtNumber, loadLocale, systemLanguage, t, weekdayShortNames } from "./i18n.js";
import { icon } from "./icons.js";
import { updateRestUi } from "./rest.js";
import { listDaysText, renderSettingsHome, taskCountText } from "./settings-nav.js";
import { state } from "./state.js";
import { saveSettings, storageChars } from "./storage.js";
import { renderTasks, setRunningUi } from "./tasks.js";
import { showInfo, showToast } from "./ui.js";
import { $, esc, fmtDiff, fmtMin, isoOf } from "./util.js";
import { renderWorkEntries, updateWorktimeFormText } from "./worktime.js";
import { dailyTargetMin } from "./worktime-calc.js";

const setLanguage = $("setLanguage");
const setWeeklyHours = $("setWeeklyHours");
const workDaysSwitch = $("workDaysSwitch");
const dailyTargetInfo = $("dailyTargetInfo");
const setRestEnabled = $("setRestEnabled");
const restOptionsWrap = $("restOptionsWrap");
const restHint = $("restHint");
const setRestHours = $("setRestHours");
const setRestBanner = $("setRestBanner");
const bannerWindowWrap = $("bannerWindowWrap");
const setBannerFrom = $("setBannerFrom");
const setBannerTo = $("setBannerTo");
const setAutoBreak = $("setAutoBreak");
const breakRulesWrap = $("breakRulesWrap");
const breakRulesContainer = $("breakRulesContainer");
const storageInfo = $("storageInfo");
const setOvertime = $("setOvertime");
const overtimeWrap = $("overtimeWrap");
const overtimeState = $("overtimeState");
const overtimeEditBtn = $("overtimeEditBtn");
const overtimeModal = $("overtimeModal");
const overtimeDateInput = $("overtimeDateInput");
const overtimeSign = $("overtimeSign");
const overtimeHours = $("overtimeHours");
const overtimeMinutes = $("overtimeMinutes");
const taskListSwitch = $("taskListSwitch");
const workListSwitch = $("workListSwitch");
const convSign = $("convSign");
const convHours = $("convHours");
const convMinutes = $("convMinutes");
const convDecimal = $("convDecimal");

function updateDailyTargetInfo() {
  dailyTargetInfo.textContent = t("settings.dailyTarget", { duration: fmtMin(dailyTargetMin()) });
}

// ----- Work days -----

function renderWorkDays() {
  const names = weekdayShortNames();
  workDaysSwitch.innerHTML = WEEK_FROM_MONDAY.map(
    (day, i) =>
      `<button type="button" data-day="${day}" aria-pressed="${state.settings.workDays.includes(day)}">${esc(names[i])}</button>`
  ).join("");
}

workDaysSwitch.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-day]");
  if (!btn) return;
  const day = Number(btn.dataset.day);
  const { workDays } = state.settings;
  // At least one work day stays selected, otherwise there would be no daily target
  if (workDays.includes(day) && workDays.length === 1) return;
  state.settings.workDays = workDays.includes(day) ? workDays.filter((d) => d !== day) : [...workDays, day];
  saveSettings();
  btn.setAttribute("aria-pressed", String(state.settings.workDays.includes(day)));
  updateDailyTargetInfo();
  renderWorkEntries();
});

export function updateStorageInfo() {
  storageInfo.textContent = t("settings.storage", {
    size: fmtNumber(storageChars() / 1024, 1),
    tasks: state.tasks.length,
    work: state.work.length,
    absences: state.absences.length,
  });
}

// ----- Language -----
function renderLanguageSelect() {
  const systemOption = `<option value="system">${esc(t("settings.languageSystem", { language: LANGUAGES[systemLanguage()] }))}</option>`;
  const options = Object.entries(LANGUAGES).map(([code, name]) => `<option value="${code}">${esc(name)}</option>`);
  setLanguage.innerHTML = systemOption + options.join("");
  setLanguage.value = state.settings.language in LANGUAGES ? state.settings.language : "system";
}

// Texts set from code are not covered by applyI18n and are rendered again here
setLanguage.addEventListener("change", async () => {
  state.settings.language = setLanguage.value;
  saveSettings();
  await loadLocale();
  applyI18n();
  setRunningUi(state.running);
  updateWorktimeFormText();
  updateAbsenceFormText();
  renderSettingsForm();
  renderSettingsHome();
  refreshAll();
  updateViewTitle();
});

// ----- Installation -----
// Chrome, Edge and Samsung Internet offer beforeinstallprompt; Safari on iOS has no such API, there the
// button shows instructions instead
let deferredInstallPrompt = null;
const installSection = $("installSection");

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function updateInstallUi() {
  installSection.hidden = isStandalone() || !(deferredInstallPrompt || isIos());
}

window.addEventListener("beforeinstallprompt", (e) => {
  deferredInstallPrompt = e;
  updateInstallUi();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  updateInstallUi();
});

$("installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    showInfo(t("settings.installIos"));
    return;
  }
  const installPrompt = deferredInstallPrompt;
  deferredInstallPrompt = null;
  installPrompt.prompt();
  await installPrompt.userChoice;
  updateInstallUi();
});

// ----- Appearance -----
const themeButtons = document.querySelectorAll("#themeSwitch button");
const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme() {
  const root = document.documentElement;
  if (state.settings.theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", state.settings.theme);
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).backgroundColor;
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeValue === state.settings.theme)));
}

themeButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    state.settings.theme = btn.dataset.themeValue;
    saveSettings();
    applyTheme();
  })
);

darkQuery.addEventListener("change", () => {
  if (state.settings.theme === "system") applyTheme();
});

// ----- Form -----
export function renderSettingsForm() {
  const s = state.settings;
  updateInstallUi();
  renderLanguageSelect();
  setWeeklyHours.value = s.weeklyHours;
  renderWorkDays();
  setRestEnabled.checked = s.restEnabled;
  restOptionsWrap.hidden = !s.restEnabled;
  restHint.hidden = !s.restEnabled;
  setRestHours.value = s.restHours;
  setRestBanner.checked = s.restBannerEnabled;
  bannerWindowWrap.hidden = !s.restBannerEnabled;
  setBannerFrom.value = s.bannerFrom;
  setBannerTo.value = s.bannerTo;
  setAutoBreak.checked = s.autoBreakEnabled;
  breakRulesWrap.hidden = !s.autoBreakEnabled;
  updateDailyTargetInfo();
  updateStorageInfo();
  renderBreakRules();
  renderOvertime();
  renderListSwitches();
  renderConverter();
}

// ----- Lists -----
// How many earlier tasks and how many days of work time the lists show; the rest is in the calendar
function renderListSwitch(container, values, key, label) {
  container.innerHTML = values
    .map((v) => `<button type="button" data-value="${v}" aria-pressed="${state.settings[key] === v}">${esc(label(v))}</button>`)
    .join("");
}

function renderListSwitches() {
  renderListSwitch(taskListSwitch, TASK_LIST_COUNTS, "taskListCount", taskCountText);
  renderListSwitch(workListSwitch, WORK_LIST_DAYS, "workListDays", listDaysText);
}

function bindListSwitch(container, key) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-value]");
    if (!btn) return;
    state.settings[key] = Number(btn.dataset.value);
    saveSettings();
    renderListSwitches();
    renderTasks();
    renderWorkEntries();
  });
}

bindListSwitch(taskListSwitch, "taskListCount");
bindListSwitch(workListSwitch, "workListDays");

// ----- Converter -----
// Hours and minutes <-> decimal hours as used by many time recording systems (6 h 03 min = 6.05 h).
// Both sides update each other while typing; nothing is saved.
function converterSign() {
  return Number(convSign.querySelector('[aria-pressed="true"]').dataset.sign);
}

function setConverterSign(sign) {
  convSign.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sign) === sign)));
}

function convertFromHoursMinutes() {
  if (!convHours.value && !convMinutes.value) {
    convDecimal.value = "";
    return;
  }
  const minutes = Math.max(0, Math.floor(Number(convHours.value) || 0)) * 60 + Math.max(0, Math.floor(Number(convMinutes.value) || 0));
  // "|| 0" avoids showing "-0"
  convDecimal.value = fmtNumber((converterSign() * Math.round((minutes / 60) * 100)) / 100 || 0);
}

// Accepts comma and point as decimal separator and a leading minus
function convertFromDecimal() {
  const text = convDecimal.value.trim().replace(",", ".");
  if (text === "" || text === "-") {
    convHours.value = "";
    convMinutes.value = "";
    return;
  }
  const hours = Number(text);
  if (!Number.isFinite(hours)) return;
  const minutes = Math.round(Math.abs(hours) * 60);
  setConverterSign(hours < 0 ? -1 : 1);
  convHours.value = Math.floor(minutes / 60);
  convMinutes.value = minutes % 60;
}

// After a language change the decimal separator changes
function renderConverter() {
  convDecimal.placeholder = fmtNumber(0, 2);
  if (convDecimal.value) convertFromHoursMinutes();
}

convHours.addEventListener("input", convertFromHoursMinutes);
convMinutes.addEventListener("input", convertFromHoursMinutes);
convDecimal.addEventListener("input", convertFromDecimal);
convSign.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-sign]");
  if (!btn) return;
  setConverterSign(Number(btn.dataset.sign));
  convertFromHoursMinutes();
});

// ----- Overtime account -----
// The page only shows the current setup; date and balance are changed in a dialog with an explicit save
function renderOvertime() {
  const { overtimeEnabled, overtimeDate, overtimeMin } = state.settings;
  setOvertime.checked = overtimeEnabled;
  overtimeWrap.hidden = !overtimeEnabled;
  overtimeState.textContent = overtimeDate
    ? t("settings.balanceState", { date: fmtDate(overtimeDate), value: fmtDiff(overtimeMin) })
    : t("settings.balanceNotSet");
  overtimeEditBtn.textContent = t(overtimeDate ? "settings.balanceEdit" : "settings.balanceSetup");
}

function setOvertimeSign(sign) {
  overtimeSign.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sign) === sign)));
}

setOvertime.addEventListener("change", () => {
  state.settings.overtimeEnabled = setOvertime.checked;
  saveSettings();
  renderOvertime();
  renderWorkEntries();
});

// A new account starts on the last day of the previous month, matching a monthly carry-over
overtimeEditBtn.addEventListener("click", () => {
  const { overtimeDate, overtimeMin } = state.settings;
  const now = new Date();
  overtimeDateInput.value = overtimeDate || isoOf(new Date(now.getFullYear(), now.getMonth(), 0));
  setOvertimeSign(overtimeMin < 0 ? -1 : 1);
  overtimeHours.value = Math.floor(Math.abs(overtimeMin) / 60);
  overtimeMinutes.value = Math.abs(overtimeMin) % 60;
  overtimeModal.showModal();
});

overtimeSign.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-sign]");
  if (btn) setOvertimeSign(Number(btn.dataset.sign));
});

$("overtimeCancelBtn").addEventListener("click", () => overtimeModal.close());

$("overtimeSaveBtn").addEventListener("click", () => {
  if (!overtimeDateInput.value) {
    showInfo(t("data.chooseDate"));
    return;
  }
  const sign = Number(overtimeSign.querySelector('[aria-pressed="true"]').dataset.sign);
  const hours = Math.max(0, Math.floor(Number(overtimeHours.value) || 0));
  const minutes = Math.min(59, Math.max(0, Math.floor(Number(overtimeMinutes.value) || 0)));
  state.settings.overtimeDate = overtimeDateInput.value;
  state.settings.overtimeMin = sign * (hours * 60 + minutes);
  saveSettings();
  overtimeModal.close();
  renderOvertime();
  renderWorkEntries();
  showToast(t("settings.balanceSaved"));
});

// ----- Automatic break rules -----
function renderBreakRules() {
  breakRulesContainer.innerHTML = "";
  state.settings.breakRules.forEach((rule, idx) => {
    const row = document.createElement("div");
    row.className = "break-rule-row";
    const hourOptions = Array.from({ length: 24 }, (_, i) => i + 1)
      .map((h) => `<option value="${h}" ${h === rule.hours ? "selected" : ""}>${h} h</option>`)
      .join("");
    row.innerHTML = `
      <span>${esc(t("settings.ruleFrom"))}</span>
      <select class="rule-hours" aria-label="${esc(t("settings.ruleHoursAria"))}">${hourOptions}</select>
      <input type="number" min="1" max="99" inputmode="numeric" class="rule-minutes" aria-label="${esc(t("settings.ruleMinutesAria"))}" value="${rule.minutes}" />
      <span>min</span>
      <button type="button" class="icon-btn danger-icon" aria-label="${esc(t("settings.ruleRemove"))}">${icon("x")}</button>
    `;
    row.querySelector(".rule-hours").addEventListener("change", (e) => {
      rule.hours = Number(e.target.value);
      saveSettings();
      renderWorkEntries();
    });
    row.querySelector(".rule-minutes").addEventListener("input", (e) => {
      const min = Number(e.target.value);
      if (!(min >= 1)) return; // ignore empty or 0 while typing
      rule.minutes = Math.min(99, Math.round(min));
      saveSettings();
      renderWorkEntries();
    });
    row.querySelector(".icon-btn").addEventListener("click", () => {
      state.settings.breakRules.splice(idx, 1);
      saveSettings();
      renderBreakRules();
      renderWorkEntries();
    });
    breakRulesContainer.appendChild(row);
  });
}

$("addBreakRuleBtn").addEventListener("click", () => {
  const maxH = Math.max(0, ...state.settings.breakRules.map((r) => r.hours));
  state.settings.breakRules.push({ hours: Math.min(24, maxH + 1), minutes: 15 });
  saveSettings();
  renderBreakRules();
  renderWorkEntries();
});

// ----- Other fields -----
// Number fields are not written back while typing, otherwise the value would jump.
// Invalid intermediate values (empty, 0) are ignored.
setWeeklyHours.addEventListener("input", () => {
  const hours = Number(setWeeklyHours.value);
  if (!(hours > 0)) return;
  state.settings.weeklyHours = hours;
  saveSettings();
  updateDailyTargetInfo();
  renderWorkEntries();
});
setRestEnabled.addEventListener("change", () => {
  state.settings.restEnabled = setRestEnabled.checked;
  restOptionsWrap.hidden = !state.settings.restEnabled;
  restHint.hidden = !state.settings.restEnabled;
  saveSettings();
  updateRestUi();
});
setRestHours.addEventListener("input", () => {
  const h = Number(setRestHours.value);
  if (h < 1 || h > 24) return;
  state.settings.restHours = h;
  saveSettings();
  updateRestUi();
});
setRestBanner.addEventListener("change", () => {
  state.settings.restBannerEnabled = setRestBanner.checked;
  bannerWindowWrap.hidden = !state.settings.restBannerEnabled;
  saveSettings();
  updateRestUi();
});
setBannerFrom.addEventListener("change", () => {
  state.settings.bannerFrom = setBannerFrom.value || "00:00";
  saveSettings();
  updateRestUi();
});
setBannerTo.addEventListener("change", () => {
  state.settings.bannerTo = setBannerTo.value || "00:00";
  saveSettings();
  updateRestUi();
});
setAutoBreak.addEventListener("change", () => {
  state.settings.autoBreakEnabled = setAutoBreak.checked;
  breakRulesWrap.hidden = !state.settings.autoBreakEnabled;
  saveSettings();
  renderWorkEntries();
});
