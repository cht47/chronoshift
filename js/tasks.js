// "Track time" tab: start and stop a task timer and show the latest tasks.

import { refreshAll } from "./app.js";
import { fmtDateParts, fmtDateTime, t } from "./i18n.js";
import { icon } from "./icons.js";
import { updateRestUi } from "./rest.js";
import { state } from "./state.js";
import { loadTimer, saveTasks, saveTimer } from "./storage.js";
import { confirmAction, renderList, showInfo } from "./ui.js";
import { $, clockOf, esc, fmtDur, isoOf, pad2, todayISO } from "./util.js";

const taskInput = $("taskInput");
const startStopBtn = $("startStopBtn");
const timerDisplay = $("timerDisplay");
const timerSub = $("timerSub");
const tasksContainer = $("tasksContainer");
const taskListHint = $("taskListHint");

let tickTimer = null;

// A task belongs to the day it started, even if it ends after midnight
export function taskDateISO(entry) {
  return isoOf(new Date(entry.startMs));
}

function updateTimerDisplay() {
  if (!state.running) {
    timerDisplay.textContent = "00:00:00";
    timerSub.textContent = t("tasks.ready");
    return;
  }
  const sec = Math.max(0, Math.floor((Date.now() - state.currentStartTime) / 1000));
  timerDisplay.textContent = `${pad2(Math.floor(sec / 3600))}:${pad2(Math.floor(sec / 60) % 60)}:${pad2(sec % 60)}`;
  const since = isoOf(new Date(state.currentStartTime)) === todayISO() ? clockOf(state.currentStartTime) : fmtDateTime(state.currentStartTime);
  timerSub.innerHTML = `<span class="live-dot"></span>${esc(t("tasks.runningSince", { time: since }))}`;
}

// The interval only updates the display; the duration is calculated from start and stop time
export function setRunningUi(isRunning) {
  taskInput.disabled = isRunning;
  startStopBtn.classList.toggle("stop", isRunning);
  startStopBtn.innerHTML = isRunning ? `${icon("stop")}${esc(t("tasks.stop"))}` : `${icon("play")}${esc(t("tasks.start"))}`;
  clearInterval(tickTimer);
  if (isRunning) tickTimer = setInterval(updateTimerDisplay, 1000);
  updateTimerDisplay();
}

// A running task is stored separately, so it keeps running when the app is closed
export function restoreTimerState() {
  const timer = loadTimer();
  if (timer && timer.running) {
    state.running = true;
    state.currentStartTime = timer.startTime;
    state.currentTask = timer.task;
    taskInput.value = state.currentTask;
  }
  setRunningUi(state.running);
}

taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !state.running) {
    e.preventDefault();
    startStopBtn.click();
  }
});

startStopBtn.addEventListener("click", () => {
  if (!state.running) {
    if (!taskInput.value.trim()) {
      showInfo(t("tasks.missingDescription"));
      return;
    }
    state.running = true;
    state.currentStartTime = Date.now();
    state.currentTask = taskInput.value.trim();
    saveTimer({ running: true, startTime: state.currentStartTime, task: state.currentTask });
    taskInput.blur();
    setRunningUi(true);
    updateRestUi();
  } else {
    state.running = false;
    const stopTime = Date.now();

    // Duration from full clock minutes (seconds dropped), so it matches the displayed start and stop times
    const startDate = new Date(state.currentStartTime);
    startDate.setSeconds(0, 0);
    const stopDate = new Date(stopTime);
    stopDate.setSeconds(0, 0);
    const diffMin = Math.round((stopDate.getTime() - startDate.getTime()) / 60000);

    state.tasks.push({
      id: Date.now(),
      task: state.currentTask,
      startMs: state.currentStartTime,
      stopMs: stopTime,
      durationMin: diffMin,
    });
    saveTasks();
    saveTimer(null);

    taskInput.value = "";
    setRunningUi(false);
    refreshAll();
  }
});

function deleteTask(id) {
  state.tasks = state.tasks.filter((e) => e.id !== id);
  saveTasks();
  refreshAll();
}

function taskTimeRange(e) {
  if (isoOf(new Date(e.startMs)) !== isoOf(new Date(e.stopMs))) return `${fmtDateTime(e.startMs)} – ${fmtDateTime(e.stopMs)}`;
  const day = fmtDateParts(new Date(e.stopMs), { weekday: "short", day: "2-digit", month: "2-digit" });
  return `${day} · ${clockOf(e.startMs)}–${clockOf(e.stopMs)}`;
}

export function buildTaskRow(entry) {
  const row = document.createElement("div");
  row.className = "list-row";
  row.innerHTML = `
    <span class="row-accent task"></span>
    <div class="list-row-main">
      <div class="list-row-title">${esc(entry.task)}</div>
      <div class="list-row-meta">${esc(taskTimeRange(entry))}</div>
    </div>
    <span class="list-row-value">${fmtDur(entry.durationMin)}</span>
    <button type="button" class="icon-btn danger-icon" aria-label="${esc(t("tasks.deleteAria"))}">${icon("trash")}</button>
  `;
  row.querySelector(".icon-btn").addEventListener("click", () =>
    confirmAction(t("tasks.confirmDelete", { name: entry.task, date: fmtDateTime(entry.startMs) }), t("common.delete"), () => deleteTask(entry.id))
  );
  return row;
}

// Today's tasks, but at least the two most recent ones; everything else is in the calendar
function visibleTasks() {
  const today = todayISO();
  const sorted = [...state.tasks].sort((a, b) => b.stopMs - a.stopMs);
  const todays = sorted.filter((e) => taskDateISO(e) === today);
  return todays.length >= 2 ? todays : sorted.slice(0, 2);
}

export function renderTasks() {
  const visible = visibleTasks();
  const hidden = state.tasks.length - visible.length;
  taskListHint.textContent = hidden > 0 ? t("tasks.moreInCalendar", { count: hidden }) : "";
  renderList(tasksContainer, visible, buildTaskRow, t("tasks.empty"));
}
