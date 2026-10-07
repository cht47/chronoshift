// Rest period: when the minimum rest between two working days ends, based on the latest task or work time.
// Shown as a line in the week card and optionally as a banner below the title.

import { fmtDateTime, fmtNumber, t } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { $, combineDateTime, esc } from "./util.js";
import { isOpen, worktimeRange } from "./worktime-calc.js";

const restBanner = $("restBanner");
const restInfo = $("restInfo");

function getLastWorkEndMs() {
  const now = Date.now();
  let last = null;
  state.tasks.forEach((e) => {
    if (e.stopMs && (last === null || e.stopMs > last)) last = e.stopMs;
  });
  state.work.forEach((e) => {
    if (isOpen(e)) return;
    const { startMs, endMs } = worktimeRange(e);
    // Work time entered in advance only counts once it has started
    if (startMs > now) return;
    if (last === null || endMs > last) last = endMs;
  });
  return last;
}

// Work time with an open end that has already started keeps running like a task, also past midnight
function workIsOpen() {
  return state.work.some((e) => isOpen(e) && combineDateTime(e.date, e.start) <= Date.now());
}

function restLabel() {
  return t("rest.label", { hours: fmtNumber(state.settings.restHours) });
}

// { cls, icon, text, short } for the current rest period, or null if there is nothing to show
function restStatus() {
  const lastEnd = getLastWorkEndMs();
  const now = Date.now();
  // A running task or open work time only matters if it is still running after the latest end of work
  if (lastEnd === null || now >= lastEnd) {
    if (state.running) {
      return { cls: "rest-active", icon: "hourglass", text: t("rest.taskRunning", { label: restLabel() }), short: t("rest.taskRunningShort") };
    }
    if (workIsOpen()) {
      return { cls: "rest-active", icon: "hourglass", text: t("rest.workOpen", { label: restLabel() }), short: t("rest.workOpenShort") };
    }
  }
  if (lastEnd === null) return null;
  const restEndMs = lastEnd + state.settings.restHours * 60 * 60 * 1000;
  const time = fmtDateTime(restEndMs);
  if (now < restEndMs) {
    return { cls: "rest-active", icon: "hourglass", text: t("rest.until", { label: restLabel(), time }), short: t("rest.untilShort", { time }) };
  }
  return { cls: "rest-rested", icon: "check", text: t("rest.rested", { time }), short: t("rest.restedShort", { time }) };
}

function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

// Equal start and end mean all day; a window like 18:00–07:00 spans midnight
function isInBannerWindow() {
  const from = minutesOfDay(state.settings.bannerFrom);
  const to = minutesOfDay(state.settings.bannerTo);
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  if (from === to) return true;
  return from < to ? now >= from && now < to : now >= from || now < to;
}

// The banner belongs to time tracking; it stays hidden in the calendar and the settings
export const BANNER_VIEWS = ["tasks", "worktime"];

export function updateRestUi() {
  const { restEnabled, restBannerEnabled } = state.settings;
  const status = restEnabled ? restStatus() : null;

  const showBanner = status && restBannerEnabled && isInBannerWindow() && BANNER_VIEWS.includes(state.currentView);
  restBanner.hidden = !showBanner;
  if (showBanner) {
    restBanner.className = "rest-chip " + status.cls;
    restBanner.innerHTML = `${icon(status.icon)}<span>${esc(status.text)}</span>`;
  }

  restInfo.hidden = !status;
  if (status) {
    restInfo.innerHTML = `<span class="${status.cls}">${icon(status.icon)}</span><span><strong>${esc(restLabel())}</strong> <span class="${status.cls}">${esc(status.short)}</span></span>`;
  }
}
