// Settings pages "Backup" and "Export & delete": local and cloud backup, backup reminder, Excel export,
// deleting entries before a date and resetting the app.

import { resetAbsenceForm } from "./absence.js";
import { refreshAll } from "./app.js";
import { ABSENCE_TYPES, APP_VERSION, DATA_VERSION, DAY_MS } from "./config.js";
import { deleteBackup, disconnect, downloadBackup, listBackups, uploadBackup } from "./gdrive.js";
import { fmtDate, fmtDateTime, t } from "./i18n.js";
import { icon } from "./icons.js";
import { migrateData } from "./migrate.js";
import { state } from "./state.js";
import {
  clearAllData,
  loadLastBackup,
  loadLastCloudBackup,
  loadNextReminder,
  restoreData,
  saveAbsences,
  saveLastBackup,
  saveLastCloudBackup,
  saveNextReminder,
  saveSettings,
  saveTasks,
  saveWork,
} from "./storage.js";
import { renderSettingsForm } from "./settings.js";
import { taskDateISO } from "./tasks.js";
import { confirmAction, downloadFile, showInfo, showToast } from "./ui.js";
import { $, dateFromISO, esc, isDate, isPlainObject, isTime, isoOf, nextDayISO, prevDayISO, todayISO } from "./util.js";
import { absenceCreditMin, computeWorktimeStats, entrySortKey, isAbsence, isOpen } from "./worktime-calc.js";
import { resetWorktimeForm } from "./worktime.js";
import { XLSX_STYLE, buildXlsx, excelDateTime, excelTime } from "./xlsx.js";

// ----- Backup -----
// A backup is a JSON file:
//   { app: "ChronoShift", format: DATA_VERSION, version: APP_VERSION, created: ISO timestamp,
//     data: { tasks, worktime, absences, settings } }
// It does not contain a running task: restored days later, that task would appear to have run all along.
const BACKUP_APP = "ChronoShift";
const BACKUP_STALE_DAYS = 30;
const RESTORED_FLAG = "chronoshift.restored";

const backupInfo = $("backupInfo");
const gdriveInfo = $("gdriveInfo");
const backupFileInput = $("backupFileInput");

const dateOf = (iso) => fmtDate(isoOf(new Date(iso)));

// Newest backup, local or cloud (used for the warning and the reminder)
export function newestBackup() {
  const dates = [loadLastBackup(), loadLastCloudBackup()].filter(Boolean);
  return dates.length ? dates.reduce((a, b) => (Date.parse(a) > Date.parse(b) ? a : b)) : null;
}

// True if there is data but no backup for 30 days
export function backupIsStale() {
  const newest = newestBackup();
  const hasData = state.tasks.length > 0 || state.work.length > 0 || state.absences.length > 0;
  return hasData && (!newest || Date.now() - Date.parse(newest) > BACKUP_STALE_DAYS * DAY_MS);
}

export function updateBackupInfo() {
  const local = loadLastBackup();
  const cloud = loadLastCloudBackup();
  const stale = backupIsStale();
  backupInfo.textContent = local ? t("backup.last", { date: dateOf(local) }) : t("backup.lastNever");
  gdriveInfo.textContent = cloud ? t("backup.cloudLast", { date: dateOf(cloud) }) : t("backup.cloudLastNever");
  backupInfo.classList.toggle("warn", stale);
  gdriveInfo.classList.toggle("warn", stale);
}

// ----- Reminder at startup -----
// Only the due date of the next reminder is stored. A backup, a restore and the reminder itself postpone it
// by 30 days. So does an empty app, so new users get the first reminder 30 days after they start using it.
const backupReminderModal = $("backupReminderModal");

function postponeBackupReminder() {
  saveNextReminder(new Date(Date.now() + BACKUP_STALE_DAYS * DAY_MS).toISOString());
}

export function checkBackupReminder() {
  const hasData = state.tasks.length > 0 || state.work.length > 0 || state.absences.length > 0;
  const next = Date.parse(loadNextReminder());
  if (!hasData || Number.isNaN(next)) {
    postponeBackupReminder();
    return;
  }
  if (Date.now() < next) return;

  postponeBackupReminder();
  const last = newestBackup();
  $("backupReminderText").textContent = last ? t("backup.reminderStale", { date: dateOf(last) }) : t("backup.reminderNever");
  backupReminderModal.showModal();
}

$("backupReminderLaterBtn").addEventListener("click", () => backupReminderModal.close());
$("backupReminderSaveBtn").addEventListener("click", () => {
  backupReminderModal.close();
  createBackup();
});

function buildBackup() {
  return {
    app: BACKUP_APP,
    format: DATA_VERSION,
    version: APP_VERSION,
    created: new Date().toISOString(),
    data: { tasks: state.tasks, worktime: state.work, absences: state.absences, settings: state.settings },
  };
}

// Local and cloud backups are shown separately, but both postpone the reminder
function backupDone(created, cloud = false) {
  if (cloud) saveLastCloudBackup(created);
  else saveLastBackup(created);
  postponeBackupReminder();
  updateBackupInfo();
}

function createBackup() {
  const backup = buildBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  downloadFile(blob, t("backup.file", { date: todayISO() }));
  backupDone(backup.created);
}

$("backupCreateBtn").addEventListener("click", createBackup);

const isOptionalTime = (v) => v === null || v === undefined || isTime(v);

function isValidTask(e) {
  return (
    Number.isFinite(e?.id) &&
    typeof e.task === "string" &&
    Number.isFinite(e.startMs) &&
    Number.isFinite(e.stopMs) &&
    Number.isFinite(e.durationMin)
  );
}

function isValidWork(e) {
  // end is null while it is still open
  return (
    Number.isFinite(e?.id) &&
    isDate(e.date) &&
    isTime(e.start) &&
    (e.end === null || isTime(e.end)) &&
    isOptionalTime(e.breakStart) &&
    isOptionalTime(e.breakEnd)
  );
}

function isValidAbsence(e) {
  return Number.isFinite(e?.id) && isDate(e.date) && ABSENCE_TYPES.includes(e.type);
}

// Returns { created, data: { tasks, work, absences, settings } } in the current data format.
// Throws on anything that does not look like a ChronoShift backup, so partial data is never restored.
function parseBackup(text) {
  const backup = JSON.parse(text);
  const { format } = backup ?? {};
  const header =
    backup?.app === BACKUP_APP &&
    Number.isInteger(format) &&
    format >= 1 &&
    format <= DATA_VERSION &&
    !Number.isNaN(Date.parse(backup.created)) &&
    isPlainObject(backup.data);
  if (!header) throw new Error("invalid backup");
  const { tasks, worktime, absences, settings } = backup.data;
  // Backups made before absences existed (1.0.13) have no absences
  const data = migrateData({ tasks, work: worktime, absences: absences ?? [], settings }, format);
  const valid =
    Array.isArray(data.tasks) &&
    Array.isArray(data.work) &&
    Array.isArray(data.absences) &&
    isPlainObject(data.settings) &&
    data.tasks.every(isValidTask) &&
    data.work.every(isValidWork) &&
    data.absences.every(isValidAbsence);
  if (!valid) throw new Error("invalid backup");
  return { created: backup.created, data };
}

$("backupRestoreBtn").addEventListener("click", () => backupFileInput.click());

backupFileInput.addEventListener("change", async () => {
  const file = backupFileInput.files[0];
  backupFileInput.value = "";
  if (!file) return;

  let backup;
  try {
    backup = parseBackup(await file.text());
  } catch {
    showInfo(t("backup.invalid"));
    return;
  }
  confirmRestore(backup);
});

function confirmRestore(backup) {
  const { tasks, work, absences, settings } = backup.data;
  const counts = { tasks: tasks.length, work: work.length, absences: absences.length };
  confirmAction(
    t("backup.confirmRestore", { date: fmtDate(isoOf(new Date(backup.created))), ...counts }),
    t("backup.restoreLabel"),
    () => {
      restoreData(tasks, work, absences, settings);
      postponeBackupReminder();
      // Reload so language, theme and all views start cleanly from the restored data
      sessionStorage.setItem(RESTORED_FLAG, JSON.stringify(counts));
      location.reload();
    }
  );
}

export function showRestoreResult() {
  const restored = sessionStorage.getItem(RESTORED_FLAG);
  if (!restored) return;
  sessionStorage.removeItem(RESTORED_FLAG);
  showToast(t("backup.restored", JSON.parse(restored)));
}

// ----- Cloud backup (Google Drive) -----
const CLOUD_KEEP = 10; // older backups are deleted after an upload
const setGdrive = $("setGdrive");
const gdriveActions = $("gdriveActions");
const cloudRestoreModal = $("cloudRestoreModal");
const cloudRestoreList = $("cloudRestoreList");

export function initCloudBackup() {
  setGdrive.checked = state.settings.gdriveEnabled;
  gdriveActions.hidden = !state.settings.gdriveEnabled;
}

setGdrive.addEventListener("change", () => {
  state.settings.gdriveEnabled = setGdrive.checked;
  saveSettings();
  gdriveActions.hidden = !setGdrive.checked;
  if (!setGdrive.checked) disconnect();
});

function showCloudError(err) {
  const reason = err.message;
  if (reason === "retry") showInfo(t("backup.cloudRetry"));
  else if (reason === "expired") showInfo(t("backup.cloudExpired"));
  else if (reason === "popup_failed_to_open") showInfo(t("backup.cloudPopupBlocked"));
  // Window closed or access denied by the user: not an error, just a notice
  else if (/popup_closed|access_denied|auth/.test(reason)) showInfo(t("backup.cloudCancelled"));
  else showInfo(t("backup.cloudError"));
}

$("gdriveSaveBtn").addEventListener("click", async () => {
  const backup = buildBackup();
  try {
    const upload = uploadBackup(t("backup.file", { date: backup.created.replace(/[:.]/g, "-") }), JSON.stringify(backup));
    showToast(t("backup.cloudSaving"));
    await upload;
    backupDone(backup.created, true);
    showToast(t("backup.cloudSaved"));
    const old = (await listBackups()).slice(CLOUD_KEEP);
    await Promise.all(old.map((f) => deleteBackup(f.id)));
  } catch (err) {
    showCloudError(err);
  }
});

$("gdriveRestoreBtn").addEventListener("click", async () => {
  let files;
  try {
    files = await listBackups();
  } catch (err) {
    showCloudError(err);
    return;
  }
  if (!files.length) {
    showInfo(t("backup.cloudEmpty"));
    return;
  }
  cloudRestoreList.innerHTML = "";
  files.forEach((f) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "action-row";
    btn.innerHTML = `${icon("cloudDownload")}<span>${esc(fmtDateTime(Date.parse(f.createdTime)))}</span>`;
    btn.addEventListener("click", async () => {
      cloudRestoreModal.close();
      let backup;
      try {
        backup = parseBackup(await downloadBackup(f.id));
      } catch (err) {
        if (err instanceof SyntaxError || err.message === "invalid backup") showInfo(t("backup.invalid"));
        else showCloudError(err);
        return;
      }
      confirmRestore(backup);
    });
    cloudRestoreList.appendChild(btn);
  });
  cloudRestoreModal.showModal();
});

$("cloudRestoreCancelBtn").addEventListener("click", () => cloudRestoreModal.close());

$("gdriveDeleteBtn").addEventListener("click", () => {
  confirmAction(
    t("backup.cloudConfirmDelete"),
    t("backup.cloudDeleteLabel"),
    async () => {
      try {
        const files = await listBackups();
        await Promise.all(files.map((f) => deleteBackup(f.id)));
        showToast(t("backup.cloudDeleted", { count: files.length }));
      } catch (err) {
        showCloudError(err);
      }
    },
    5
  );
});

// ----- Export -----
$("exportTasksBtn").addEventListener("click", () => {
  if (!state.tasks.length) {
    showInfo(t("data.noTasksToExport"));
    return;
  }
  const columns = [
    { header: t("export.task"), width: 40 },
    { header: t("export.start"), width: 18 },
    { header: t("export.stop"), width: 18 },
    { header: t("export.minutes"), width: 10 },
  ];
  const rows = [...state.tasks]
    .sort((a, b) => a.startMs - b.startMs)
    .map((e) => [
      e.task,
      { v: excelDateTime(new Date(e.startMs)), s: XLSX_STYLE.dateTime },
      { v: excelDateTime(new Date(e.stopMs)), s: XLSX_STYLE.dateTime },
      e.durationMin,
    ]);
  downloadFile(buildXlsx(t("export.tasksSheet"), columns, rows), t("export.tasksFile", { date: todayISO() }));
});

// Work time and absences in one sheet, sorted by day. "Net" is pure work time; absences have their own
// columns for type and credit, so net + credit adds up to the totals shown in the app.
// Overlapping entries are exported as they are, entries with an open end without end and net time.
$("exportWorkBtn").addEventListener("click", () => {
  if (!state.work.length && !state.absences.length) {
    showInfo(t("data.noWorkToExport"));
    return;
  }
  const columns = [
    { header: t("export.date"), width: 12 },
    { header: t("export.workStart"), width: 10 },
    { header: t("export.workEnd"), width: 10 },
    { header: t("export.breakFrom"), width: 12 },
    { header: t("export.breakTo"), width: 12 },
    { header: t("export.breakMinutes"), width: 16 },
    { header: t("export.breakType"), width: 14 },
    { header: t("export.netMinutes"), width: 16 },
    { header: t("export.absence"), width: 22 },
    { header: t("export.creditMinutes"), width: 18 },
  ];
  const time = (hhmm) => (hhmm ? { v: excelTime(hhmm), s: XLSX_STYLE.time } : null);
  const date = (iso) => ({ v: excelDateTime(dateFromISO(iso)), s: XLSX_STYLE.date });
  const entries = [...state.work, ...state.absences].sort((a, b) => entrySortKey(a).localeCompare(entrySortKey(b)));
  const rows = entries.map((e) => {
    if (isAbsence(e)) return [date(e.date), null, null, null, null, null, "", null, t(`absence.types.${e.type}`), absenceCreditMin(e)];
    if (isOpen(e)) return [date(e.date), time(e.start), null, time(e.breakStart), time(e.breakEnd), null, "", null];
    const s = computeWorktimeStats(e);
    const breakType = s.breakManual ? t("export.breakManual") : s.breakMin > 0 ? t("export.breakAuto") : "";
    return [date(e.date), time(e.start), time(e.end), time(e.breakStart), time(e.breakEnd), s.breakMin, breakType, s.netMin];
  });
  downloadFile(buildXlsx(t("export.workSheet"), columns, rows), t("export.workFile", { date: todayISO() }));
});

// ----- Delete -----
// Deletes entries before a date, for any combination of tasks, work time and absences.
// Tasks belong to the day they started, like in the calendar.
const DELETE_SCOPES = {
  tasks: { list: "tasks", dateOf: taskDateISO, save: saveTasks },
  work: { list: "work", dateOf: (e) => e.date, save: saveWork },
  absences: { list: "absences", dateOf: (e) => e.date, save: saveAbsences },
};
const deleteBeforeCard = $("deleteBeforeCard");
const deleteBeforeDate = $("deleteBeforeDate");
const deleteBeforeSummary = $("deleteBeforeSummary");
const deleteBeforeConfirmBtn = $("deleteBeforeConfirmBtn");
const deleteScopeBoxes = deleteBeforeCard.querySelectorAll("input[data-scope]");

// Number of entries the current selection would delete: { tasks, work, absences }
function deleteBeforeCounts() {
  const before = deleteBeforeDate.value;
  const counts = { tasks: 0, work: 0, absences: 0 };
  if (!before) return counts;
  deleteScopeBoxes.forEach((box) => {
    const scope = DELETE_SCOPES[box.dataset.scope];
    if (box.checked) counts[box.dataset.scope] = state[scope.list].filter((e) => scope.dateOf(e) < before).length;
  });
  return counts;
}

// Shows exactly what would be deleted; the button stays disabled without a date or matching entries
function updateDeleteBeforeSummary() {
  const before = deleteBeforeDate.value;
  const counts = deleteBeforeCounts();
  const total = counts.tasks + counts.work + counts.absences;
  const anyScope = [...deleteScopeBoxes].some((box) => box.checked);
  if (!before) deleteBeforeSummary.textContent = t("data.chooseDate");
  else if (!anyScope) deleteBeforeSummary.textContent = t("data.chooseScope");
  else if (!total) deleteBeforeSummary.textContent = t("data.nothingBefore", { date: fmtDate(before) });
  else deleteBeforeSummary.textContent = t("data.deleteBeforeSummary", { date: fmtDate(before), ...counts });
  if (total && resetsBalance(before)) deleteBeforeSummary.textContent += " " + t("data.deleteResetsBalance", { date: fmtDate(before) });
  deleteBeforeConfirmBtn.disabled = !total;
}

// Deleting work time or absences that the overtime account already counts would turn those days into
// missing days. In that case the account restarts at 0 on the day before the cut-off date.
function resetsBalance(before) {
  const { overtimeEnabled, overtimeDate } = state.settings;
  const scopes = [...deleteScopeBoxes].filter((box) => box.checked).map((box) => box.dataset.scope);
  return overtimeEnabled && overtimeDate && nextDayISO(overtimeDate) < before && (scopes.includes("work") || scopes.includes("absences"));
}

// When the page opens and after deleting: no date, all switches off
export function resetDeleteBefore() {
  deleteBeforeDate.value = "";
  deleteScopeBoxes.forEach((box) => (box.checked = false));
  updateDeleteBeforeSummary();
}

// "change" as well, because some mobile date pickers do not fire "input"
deleteBeforeDate.addEventListener("input", updateDeleteBeforeSummary);
deleteBeforeDate.addEventListener("change", updateDeleteBeforeSummary);
deleteScopeBoxes.forEach((box) => box.addEventListener("change", updateDeleteBeforeSummary));

deleteBeforeConfirmBtn.addEventListener("click", () => {
  const before = deleteBeforeDate.value;
  const counts = deleteBeforeCounts();
  if (resetsBalance(before)) {
    state.settings.overtimeDate = prevDayISO(before);
    state.settings.overtimeMin = 0;
    saveSettings();
    renderSettingsForm();
  }
  deleteScopeBoxes.forEach((box) => {
    if (!box.checked) return;
    const scope = DELETE_SCOPES[box.dataset.scope];
    state[scope.list] = state[scope.list].filter((e) => scope.dateOf(e) >= before);
    scope.save();
  });
  resetDeleteBefore();
  // An entry that is being edited may have been deleted
  resetWorktimeForm();
  resetAbsenceForm();
  refreshAll();
  showToast(t("data.deletedBefore", { count: counts.tasks + counts.work + counts.absences }));
});

$("resetAllBtn").addEventListener("click", () => {
  confirmAction(
    t("data.confirmReset"),
    t("data.resetConfirmLabel"),
    () => {
      clearAllData();
      location.reload();
    },
    5
  );
});
