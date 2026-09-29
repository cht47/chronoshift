import { fmtDateTime, fmtNumber, t } from "./i18n.js";
import { icon } from "./icons.js";
import { state } from "./state.js";
import { $, esc } from "./util.js";
import { worktimeRange } from "./worktime-calc.js";

const restBanner = $("restBanner");
const restInfo = $("restInfo");

function getLastWorkEndMs() {
  const now = Date.now();
  let last = null;
  state.tasks.forEach((e) => {
    if (e.stopMs && (last === null || e.stopMs > last)) last = e.stopMs;
  });
  state.work.forEach((e) => {
    const { startMs, endMs } = worktimeRange(e);
    // Vorgetragene Arbeitszeiten zählen erst ab ihrem Beginn
    if (startMs > now) return;
    if (last === null || endMs > last) last = endMs;
  });
  return last;
}

function restLabel() {
  return t("rest.label", { hours: fmtNumber(state.settings.restHours) });
}

function restStatus() {
  const lastEnd = getLastWorkEndMs();
  const now = Date.now();
  // Laufender Task verschiebt die Ruhezeit nur, wenn er nach dem letzten Arbeitsende noch läuft
  if (state.running && (lastEnd === null || now >= lastEnd)) {
    return { cls: "rest-active", icon: "hourglass", text: t("rest.taskRunning", { label: restLabel() }), short: t("rest.taskRunningShort") };
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

function isInBannerWindow() {
  const von = minutesOfDay(state.settings.bannerVon);
  const bis = minutesOfDay(state.settings.bannerBis);
  const d = new Date();
  const now = d.getHours() * 60 + d.getMinutes();
  if (von === bis) return true;
  return von < bis ? now >= von && now < bis : now >= von || now < bis;
}

export function updateRestUi() {
  const { ruhezeitEnabled, ruhezeitBannerEnabled } = state.settings;
  const status = ruhezeitEnabled ? restStatus() : null;

  const showBanner = status && ruhezeitBannerEnabled && isInBannerWindow();
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
