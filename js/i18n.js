// Translations and locale-aware formatting. Texts live in locales/<code>.json; HTML elements get their text
// via data-i18n, data-i18n-placeholder and data-i18n-aria, code uses t("section.key", { placeholder }).

import { FALLBACK_LANG, LANGUAGES } from "./config.js";
import { state } from "./state.js";
import { clockOf, dateFromISO } from "./util.js";

// Locale for Intl formatting, may include a region (e.g. "en-GB")
let intlLocale = FALLBACK_LANG;
let messages = {};
let fallbackMessages = {};

function browserLanguages() {
  return navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || FALLBACK_LANG];
}

export function systemLanguage() {
  for (const tag of browserLanguages()) {
    const base = tag.toLowerCase().split("-")[0];
    if (base in LANGUAGES) return base;
  }
  return FALLBACK_LANG;
}

async function fetchLocale(code) {
  const res = await fetch(`locales/${code}.json`);
  if (!res.ok) throw new Error(`locales/${code}.json: ${res.status}`);
  return res.json();
}

export async function loadLocale() {
  const lang = state.settings.language in LANGUAGES ? state.settings.language : systemLanguage();
  // Use the browser's regional variant (e.g. en-GB instead of en-US for the date format)
  intlLocale = browserLanguages().find((tag) => tag.toLowerCase().split("-")[0] === lang) || lang;
  document.documentElement.lang = lang;
  try {
    fallbackMessages = await fetchLocale(FALLBACK_LANG);
  } catch (err) {
    console.warn(err);
    fallbackMessages = {};
  }
  try {
    messages = lang === FALLBACK_LANG ? fallbackMessages : await fetchLocale(lang);
  } catch (err) {
    console.warn(err);
    messages = fallbackMessages;
  }
}

// Falls back to English if a text is missing in the selected language, and to the key itself if it is missing there too
export function t(key, params = {}) {
  const lookup = (obj) => key.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const text = lookup(messages) ?? lookup(fallbackMessages) ?? key;
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (name in params ? params[name] : match));
}

export function applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = t(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = t(el.dataset.i18nPlaceholder)));
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
}

// ----- Formatting by language and region -----
export function fmtDateParts(date, options) {
  return new Intl.DateTimeFormat(intlLocale, options).format(date);
}

// Short weekday names starting with Monday, e.g. "Mo" / "Mon" (1 January 2024 was a Monday)
export function weekdayShortNames() {
  return Array.from({ length: 7 }, (_, i) => fmtDateParts(new Date(2024, 0, 1 + i), { weekday: "short" }).replace(/\.$/, ""));
}

export function fmtDateRange(from, to, options) {
  return new Intl.DateTimeFormat(intlLocale, options).formatRange(from, to);
}

export function fmtDate(iso) {
  return fmtDateParts(dateFromISO(iso), { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function fmtDateTime(ms) {
  return `${fmtDateParts(new Date(ms), { day: "2-digit", month: "2-digit", year: "2-digit" })} ${clockOf(ms)}`;
}

export function fmtNumber(n, fractionDigits) {
  const options = fractionDigits === undefined ? {} : { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits };
  return new Intl.NumberFormat(intlLocale, options).format(n);
}
