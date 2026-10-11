// Public holidays from the OpenHolidays API (openholidaysapi.org, run by STÜBER SYSTEMS GmbH, Berlin; data under
// the ODbL). The app only connects when "Import public holidays" is tapped. Imported holidays are absences of type
// "holiday" with their name; a new import replaces them, holidays entered by hand stay.

import { refreshAll } from "./app.js";
import { fmtDate, t } from "./i18n.js";
import { renderVacationYearInfo } from "./settings.js";
import { state } from "./state.js";
import { saveAbsences, saveSettings } from "./storage.js";
import { showInfo, showToast } from "./ui.js";
import { $, dateFromISO, esc, nextDayISO, todayISO } from "./util.js";
import { vacationDays } from "./worktime-calc.js";

const API = "https://openholidaysapi.org";

const holidayImportBtn = $("holidayImportBtn");
const holidayInfo = $("holidayInfo");
const holidayModal = $("holidayModal");
const holidayCountry = $("holidayCountry");
const holidayRegionWrap = $("holidayRegionWrap");
const holidayRegion = $("holidayRegion");
const holidayModalHint = $("holidayModalHint");
const holidaySaveBtn = $("holidaySaveBtn");

// Names come in the app language if the API has it, otherwise in the first language available
// (e.g. municipalities only have their local name)
function localName(names) {
  const lang = document.documentElement.lang.toUpperCase();
  return (names.find((n) => n.language === lang) ?? names[0])?.text ?? "";
}

async function apiGet(path, params) {
  const query = new URLSearchParams({ languageIsoCode: document.documentElement.lang.toUpperCase(), ...params });
  const res = await fetch(`${API}/${path}?${query}`);
  if (!res.ok) throw new Error(`holidays ${res.status}`);
  return res.json();
}

const byLabel = (a, b) => a.label.localeCompare(b.label);

async function loadCountries() {
  const countries = await apiGet("Countries", {});
  return countries.map((c) => ({ code: c.isoCode, label: localName(c.name) })).sort(byLabel);
}

// Regions as a flat list; smaller regions follow the region they belong to, e.g. "Bayern – Augsburg"
function flattenRegions(list, parent = "") {
  return list
    .map((s) => ({ s, label: parent ? `${parent} – ${localName(s.name)}` : localName(s.name) }))
    .sort(byLabel)
    .flatMap(({ s, label }) => [{ code: s.code, label }, ...flattenRegions(s.children ?? [], label)]);
}

async function loadRegions(country) {
  return flattenRegions(await apiGet("Subdivisions", { countryIsoCode: country }));
}

// Full public holidays of a region: nationwide ones and those of the region or a region it belongs to (a
// municipality also gets the holidays of its state). Half days and optional holidays are left out.
// Returns [{ date, name }], one item per day.
async function loadHolidays(country, region, from, to) {
  const holidays = await apiGet("PublicHolidays", { countryIsoCode: country, validFrom: from, validTo: to });
  const applies = (h) =>
    h.type === "Public" &&
    h.temporalScope === "FullDay" &&
    (h.nationwide || (h.subdivisions ?? []).some((s) => region === s.code || region.startsWith(`${s.code}-`)));
  const days = [];
  for (const h of holidays.filter(applies)) {
    for (let d = h.startDate; d <= h.endDate; d = nextDayISO(d)) days.push({ date: d, name: localName(h.name) });
  }
  return days;
}

// Replaces the imported holidays between from and to by the new ones, on work days only. A vacation day on a
// holiday is replaced, because no vacation is needed that day; other absences (sick leave, holidays entered by
// hand) stay. Returns { count, replaced }.
function applyHolidays(holidays, from, to) {
  const isOldImport = (a) => a.type === "holiday" && a.name !== undefined && a.date >= from && a.date <= to;
  const kept = state.absences.filter((a) => !isOldImport(a));
  const byDate = new Map(kept.map((a) => [a.date, a]));
  const replaced = new Set();
  const added = [];
  const baseId = Date.now();
  for (const { date, name } of holidays) {
    if (!state.settings.workDays.includes(dateFromISO(date).getDay())) continue;
    const existing = byDate.get(date);
    if (existing && !vacationDays(existing)) continue;
    if (existing) replaced.add(existing.id);
    const entry = { id: baseId + added.length, date, type: "holiday", name };
    byDate.set(date, entry);
    added.push(entry);
  }
  state.absences = [...kept.filter((a) => !replaced.has(a.id)), ...added];
  return { count: added.length, replaced: replaced.size };
}

// ----- Settings page and dialog -----

// An import covers the year it was made in and the next one. Returns the first year without holidays as soon
// as that is next year (or already this year), so there is time to import again; otherwise null, also if
// holidays were never imported.
export function holidaysMissingYear() {
  const { holidaySynced } = state.settings;
  if (!holidaySynced) return null;
  const lastYear = Number(holidaySynced.slice(0, 4)) + 1;
  return lastYear <= new Date().getFullYear() ? lastYear + 1 : null;
}

export function renderHolidayInfo() {
  const { holidayLabel, holidaySynced } = state.settings;
  const missing = holidaysMissingYear();
  holidayInfo.textContent = holidaySynced
    ? t("holidays.state", { region: holidayLabel, date: fmtDate(holidaySynced) }) +
      (missing ? ` · ${t("holidays.missing", { year: missing })}` : "")
    : t("holidays.notSet");
  holidayInfo.classList.toggle("warn", !!missing);
}

// The current year and the next one
function importYears() {
  const year = new Date().getFullYear();
  return { from: year, to: year + 1 };
}

// Country of the browser language, e.g. "de-AT" -> "AT"
function browserCountry() {
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language || ""];
  return tags.map((tag) => tag.split("-")[1]?.toUpperCase()).find(Boolean);
}

let regionRequest = 0;

async function showRegions(country) {
  const request = ++regionRequest;
  holidayRegion.disabled = true;
  holidaySaveBtn.disabled = true;
  try {
    const regions = await loadRegions(country);
    if (request !== regionRequest) return;
    const selected = country === state.settings.holidayCountry ? state.settings.holidayRegion : "";
    holidayRegion.innerHTML =
      `<option value="">${esc(t("holidays.regionNone"))}</option>` +
      regions.map((r) => `<option value="${esc(r.code)}">${esc(r.label)}</option>`).join("");
    holidayRegion.value = regions.some((r) => r.code === selected) ? selected : "";
    holidayRegionWrap.hidden = !regions.length;
    holidayRegion.disabled = false;
    holidaySaveBtn.disabled = false;
  } catch (err) {
    if (request !== regionRequest) return;
    console.warn(err);
    holidayModal.close();
    showInfo(t("holidays.error"));
  }
}

holidayImportBtn.addEventListener("click", async () => {
  if (holidayImportBtn.getAttribute("aria-busy") === "true") return;
  holidayImportBtn.setAttribute("aria-busy", "true");
  try {
    const countries = await loadCountries();
    const codes = countries.map((c) => c.code);
    const country = [state.settings.holidayCountry, browserCountry(), "DE"].find((c) => codes.includes(c)) ?? codes[0];
    holidayCountry.innerHTML = countries.map((c) => `<option value="${esc(c.code)}">${esc(c.label)}</option>`).join("");
    holidayCountry.value = country;
    holidayModalHint.textContent = t("holidays.modalHint", importYears());
    holidayModal.showModal();
    await showRegions(country);
  } catch (err) {
    console.warn(err);
    showInfo(t("holidays.error"));
  } finally {
    holidayImportBtn.removeAttribute("aria-busy");
  }
});

holidayCountry.addEventListener("change", () => showRegions(holidayCountry.value));

$("holidayCancelBtn").addEventListener("click", () => {
  regionRequest++;
  holidayModal.close();
});

holidaySaveBtn.addEventListener("click", async () => {
  const country = holidayCountry.value;
  const region = holidayRegion.value;
  const { from, to } = importYears();
  holidaySaveBtn.setAttribute("aria-busy", "true");
  holidaySaveBtn.disabled = true;
  try {
    const holidays = await loadHolidays(country, region, `${from}-01-01`, `${to}-12-31`);
    // Cancelled while loading
    if (!holidayModal.open) return;
    const result = applyHolidays(holidays, `${from}-01-01`, `${to}-12-31`);
    const label = (region ? holidayRegion : holidayCountry).selectedOptions[0].textContent;
    Object.assign(state.settings, { holidayCountry: country, holidayRegion: region, holidayLabel: label, holidaySynced: todayISO() });
    saveAbsences();
    saveSettings();
    holidayModal.close();
    renderHolidayInfo();
    renderVacationYearInfo();
    refreshAll();
    const replacedText = result.replaced ? ` ${t("holidays.replaced", { count: result.replaced })}` : "";
    showToast(t("holidays.imported", { count: result.count, from, to }) + replacedText);
  } catch (err) {
    console.warn(err);
    holidayModal.close();
    showInfo(t("holidays.error"));
  } finally {
    holidaySaveBtn.removeAttribute("aria-busy");
    holidaySaveBtn.disabled = false;
  }
});
