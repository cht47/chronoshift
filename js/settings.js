import { refreshAll, updateViewTitle } from "./app.js";
import { updateAbsenceFormText } from "./absence.js";
import { LANGUAGES, WEEK_FROM_MONDAY } from "./config.js";
import { applyI18n, fmtDate, fmtNumber, loadLocale, systemLanguage, t, weekdayShortNames } from "./i18n.js";
import { icon } from "./icons.js";
import { updateRestUi } from "./rest.js";
import { state } from "./state.js";
import { saveSettings, storageChars } from "./storage.js";
import { setRunningUi } from "./tasks.js";
import { showInfo, showToast } from "./ui.js";
import { $, esc, fmtDiff, fmtMin, isoOf } from "./util.js";
import { renderWorkEntries, updateWorktimeFormText } from "./worktime.js";
import { dailyTargetMin } from "./worktime-calc.js";

const setLanguage = $("setLanguage");
const setWochensoll = $("setWochensoll");
const workDaysSwitch = $("workDaysSwitch");
const tagessollInfo = $("tagessollInfo");
const setRestEnabled = $("setRestEnabled");
const ruhezeitOptionsWrap = $("ruhezeitOptionsWrap");
const ruhezeitHint = $("ruhezeitHint");
const setRestHours = $("setRestHours");
const setRestBanner = $("setRestBanner");
const bannerWindowWrap = $("bannerWindowWrap");
const setBannerVon = $("setBannerVon");
const setBannerBis = $("setBannerBis");
const setPauseAutoEnabled = $("setPauseAutoEnabled");
const pauseRulesWrap = $("pauseRulesWrap");
const pauseRulesContainer = $("pauseRulesContainer");
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

function updateTagessollInfo() {
  tagessollInfo.textContent = t("settings.dailyTarget", { duration: fmtMin(dailyTargetMin()) });
}

// ----- Arbeitstage -----

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
  // Mindestens ein Arbeitstag bleibt gewählt, sonst gäbe es kein Tagessoll
  if (workDays.includes(day) && workDays.length === 1) return;
  state.settings.workDays = workDays.includes(day) ? workDays.filter((d) => d !== day) : [...workDays, day];
  saveSettings();
  btn.setAttribute("aria-pressed", String(state.settings.workDays.includes(day)));
  updateTagessollInfo();
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

// ----- Sprache -----
function renderLanguageSelect() {
  const systemOption = `<option value="system">${esc(t("settings.languageSystem", { language: LANGUAGES[systemLanguage()] }))}</option>`;
  const options = Object.entries(LANGUAGES).map(([code, name]) => `<option value="${code}">${esc(name)}</option>`);
  setLanguage.innerHTML = systemOption + options.join("");
  setLanguage.value = state.settings.language in LANGUAGES ? state.settings.language : "system";
}

setLanguage.addEventListener("change", async () => {
  state.settings.language = setLanguage.value;
  saveSettings();
  await loadLocale();
  applyI18n();
  setRunningUi(state.running);
  updateWorktimeFormText();
  updateAbsenceFormText();
  renderSettingsForm();
  refreshAll();
  updateViewTitle();
});

// ----- Installation -----
// Chrome, Edge und Samsung Internet bieten beforeinstallprompt; Safari auf iOS hat keine API, dort nur eine Anleitung
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

// ----- Darstellung -----
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

// ----- Formular -----
export function renderSettingsForm() {
  const s = state.settings;
  updateInstallUi();
  renderLanguageSelect();
  setWochensoll.value = s.wochensollstunden;
  renderWorkDays();
  setRestEnabled.checked = s.ruhezeitEnabled;
  ruhezeitOptionsWrap.hidden = !s.ruhezeitEnabled;
  ruhezeitHint.hidden = !s.ruhezeitEnabled;
  setRestHours.value = s.restHours;
  setRestBanner.checked = s.ruhezeitBannerEnabled;
  bannerWindowWrap.hidden = !s.ruhezeitBannerEnabled;
  setBannerVon.value = s.bannerVon;
  setBannerBis.value = s.bannerBis;
  setPauseAutoEnabled.checked = s.pauseAutoEnabled;
  pauseRulesWrap.hidden = !s.pauseAutoEnabled;
  updateTagessollInfo();
  updateStorageInfo();
  renderPauseRules();
  renderOvertime();
}

// ----- Stundenkonto -----
// Auf der Seite steht nur der aktuelle Stand; Datum und Saldo ändert man bewusst über das Modal mit Speichern
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

// Neu eingerichtet: der letzte Tag des Vormonats, passend zu einem Monatsübertrag
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

function renderPauseRules() {
  pauseRulesContainer.innerHTML = "";
  state.settings.pauseRules.forEach((rule, idx) => {
    const row = document.createElement("div");
    row.className = "pause-rule-row";
    const hourOptions = Array.from({ length: 24 }, (_, i) => i + 1)
      .map((h) => `<option value="${h}" ${h === rule.stunden ? "selected" : ""}>${h} h</option>`)
      .join("");
    row.innerHTML = `
      <span>${esc(t("settings.ruleFrom"))}</span>
      <select class="rule-hours" aria-label="${esc(t("settings.ruleHoursAria"))}">${hourOptions}</select>
      <input type="number" min="1" max="99" inputmode="numeric" class="rule-minutes" aria-label="${esc(t("settings.ruleMinutesAria"))}" value="${rule.minuten}" />
      <span>min</span>
      <button type="button" class="icon-btn danger-icon" aria-label="${esc(t("settings.ruleRemove"))}">${icon("x")}</button>
    `;
    row.querySelector(".rule-hours").addEventListener("change", (e) => {
      rule.stunden = Number(e.target.value);
      saveSettings();
      renderWorkEntries();
    });
    row.querySelector(".rule-minutes").addEventListener("input", (e) => {
      const min = Number(e.target.value);
      if (!(min >= 1)) return; // leer oder 0 beim Tippen nicht übernehmen
      rule.minuten = Math.min(99, Math.round(min));
      saveSettings();
      renderWorkEntries();
    });
    row.querySelector(".icon-btn").addEventListener("click", () => {
      state.settings.pauseRules.splice(idx, 1);
      saveSettings();
      renderPauseRules();
      renderWorkEntries();
    });
    pauseRulesContainer.appendChild(row);
  });
}

$("addPauseRuleBtn").addEventListener("click", () => {
  const maxH = Math.max(0, ...state.settings.pauseRules.map((r) => r.stunden));
  state.settings.pauseRules.push({ stunden: Math.min(24, maxH + 1), minuten: 15 });
  saveSettings();
  renderPauseRules();
  renderWorkEntries();
});

// Eingabefelder nicht neu befüllen, sonst springt der Wert beim Tippen
setWochensoll.addEventListener("input", () => {
  const hours = Number(setWochensoll.value);
  if (!(hours > 0)) return; // leer oder 0 beim Tippen nicht übernehmen
  state.settings.wochensollstunden = hours;
  saveSettings();
  updateTagessollInfo();
  renderWorkEntries();
});
setRestEnabled.addEventListener("change", () => {
  state.settings.ruhezeitEnabled = setRestEnabled.checked;
  ruhezeitOptionsWrap.hidden = !state.settings.ruhezeitEnabled;
  ruhezeitHint.hidden = !state.settings.ruhezeitEnabled;
  saveSettings();
  updateRestUi();
});
// Ungültige Zwischenstände beim Tippen (leer, 0) nicht übernehmen
setRestHours.addEventListener("input", () => {
  const h = Number(setRestHours.value);
  if (h < 1 || h > 24) return;
  state.settings.restHours = h;
  saveSettings();
  updateRestUi();
});
setRestBanner.addEventListener("change", () => {
  state.settings.ruhezeitBannerEnabled = setRestBanner.checked;
  bannerWindowWrap.hidden = !state.settings.ruhezeitBannerEnabled;
  saveSettings();
  updateRestUi();
});
setBannerVon.addEventListener("change", () => {
  state.settings.bannerVon = setBannerVon.value || "00:00";
  saveSettings();
  updateRestUi();
});
setBannerBis.addEventListener("change", () => {
  state.settings.bannerBis = setBannerBis.value || "00:00";
  saveSettings();
  updateRestUi();
});
setPauseAutoEnabled.addEventListener("change", () => {
  state.settings.pauseAutoEnabled = setPauseAutoEnabled.checked;
  pauseRulesWrap.hidden = !state.settings.pauseAutoEnabled;
  saveSettings();
  renderWorkEntries();
});
