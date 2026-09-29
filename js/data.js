import { refreshAll } from "./app.js";
import { APP_VERSION, DAY_MS, WORKTIME_RETENTION_DAYS } from "./config.js";
import { fmtDate, t } from "./i18n.js";
import { state } from "./state.js";
import { clearAllData, loadLastBackup, restoreData, saveLastBackup, saveTasks, saveWork } from "./storage.js";
import { taskDateISO } from "./tasks.js";
import { confirmAction, downloadFile, showInfo, showToast } from "./ui.js";
import { $, dateFromISO, isDate, isTime, isoOf, todayISO } from "./util.js";
import { compareWorkAsc, computeWorktimeStats } from "./worktime-calc.js";
import { XLSX_STYLE, buildXlsx, excelDateTime, excelTime } from "./xlsx.js";

// ----- Backup -----
// Enthält Tasks, Arbeitszeiten und Einstellungen, aber keinen laufenden Timer:
// Beim Wiederherstellen Tage später würde er sonst einen Task liefern, der seitdem "läuft".
const BACKUP_APP = "ChronoShift";
const BACKUP_FORMAT = 1;
const BACKUP_STALE_DAYS = 30;
const RESTORED_FLAG = "chronoshift.restored";

const backupInfo = $("backupInfo");
const backupFileInput = $("backupFileInput");

export function updateBackupInfo() {
  const last = loadLastBackup();
  const hasData = state.tasks.length > 0 || state.work.length > 0;
  const stale = !last || Date.now() - Date.parse(last) > BACKUP_STALE_DAYS * DAY_MS;
  backupInfo.textContent = last ? t("backup.last", { date: fmtDate(isoOf(new Date(last))) }) : t("backup.lastNever");
  backupInfo.classList.toggle("warn", hasData && stale);
}

$("backupCreateBtn").addEventListener("click", () => {
  const backup = {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    version: APP_VERSION,
    created: new Date().toISOString(),
    data: { tasks: state.tasks, worktime: state.work, settings: state.settings },
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  downloadFile(blob, t("backup.file", { date: todayISO() }));
  saveLastBackup(backup.created);
  updateBackupInfo();
});

const isOptionalTime = (v) => v === null || v === undefined || isTime(v);

function isValidTask(e) {
  return Number.isFinite(e?.id) && typeof e.task === "string" && Number.isFinite(e.stopMs) && Number.isFinite(e.durationMin);
}

function isValidWork(e) {
  return Number.isFinite(e?.id) && isDate(e.datum) && isTime(e.beginn) && isTime(e.ende) && isOptionalTime(e.pauseVon) && isOptionalTime(e.pauseBis);
}

// Wirft bei allem, was nicht wie ein ChronoShift-Backup aussieht, damit nie halbe Daten übernommen werden
function parseBackup(text) {
  const backup = JSON.parse(text);
  const data = backup?.data;
  const valid =
    backup?.app === BACKUP_APP &&
    backup.format === BACKUP_FORMAT &&
    !Number.isNaN(Date.parse(backup.created)) &&
    Array.isArray(data?.tasks) &&
    Array.isArray(data.worktime) &&
    data.settings !== null &&
    typeof data.settings === "object" &&
    data.tasks.every(isValidTask) &&
    data.worktime.every(isValidWork);
  if (!valid) throw new Error("invalid backup");
  return backup;
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

  const { tasks, worktime, settings } = backup.data;
  const counts = { tasks: tasks.length, work: worktime.length };
  confirmAction(
    t("backup.confirmRestore", { date: fmtDate(isoOf(new Date(backup.created))), ...counts }),
    t("backup.restoreLabel"),
    () => {
      restoreData(tasks, worktime, settings);
      // Neu laden, damit Sprache, Design und alle Ansichten sauber aus den wiederhergestellten Daten starten
      sessionStorage.setItem(RESTORED_FLAG, JSON.stringify(counts));
      location.reload();
    }
  );
});

export function showRestoreResult() {
  const restored = sessionStorage.getItem(RESTORED_FLAG);
  if (!restored) return;
  sessionStorage.removeItem(RESTORED_FLAG);
  showToast(t("backup.restored", JSON.parse(restored)));
}

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
    .sort((a, b) => a.stopMs - b.stopMs)
    .map((e) => [
      e.task,
      // Alte Einträge ohne startMs behalten ihren gespeicherten Starttext
      e.startMs ? { v: excelDateTime(new Date(e.startMs)), s: XLSX_STYLE.dateTime } : e.startStr,
      { v: excelDateTime(new Date(e.stopMs)), s: XLSX_STYLE.dateTime },
      e.durationMin,
    ]);
  downloadFile(buildXlsx(t("export.tasksSheet"), columns, rows), t("export.tasksFile", { date: todayISO() }));
});

$("exportWorkBtn").addEventListener("click", () => {
  if (!state.work.length) {
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
  ];
  const time = (hhmm) => (hhmm ? { v: excelTime(hhmm), s: XLSX_STYLE.time } : null);
  const rows = [...state.work].sort(compareWorkAsc).map((e) => {
    const s = computeWorktimeStats(e);
    const breakType = s.pauseManual ? t("export.breakManual") : s.pauseMin > 0 ? t("export.breakAuto") : "";
    return [
      { v: excelDateTime(dateFromISO(e.datum)), s: XLSX_STYLE.date },
      time(e.beginn),
      time(e.ende),
      time(e.pauseVon),
      time(e.pauseBis),
      s.pauseMin,
      breakType,
      s.nettoMin,
    ];
  });
  downloadFile(buildXlsx(t("export.workSheet"), columns, rows), t("export.workFile", { date: todayISO() }));
});

// ----- Löschen -----
$("deleteTodayTasksBtn").addEventListener("click", () => {
  const today = todayISO();
  const count = state.tasks.filter((e) => taskDateISO(e) === today).length;
  if (!count) {
    showInfo(t("data.noTasksToday"));
    return;
  }
  confirmAction(t("data.confirmDeleteToday", { count }), t("common.delete"), () => {
    state.tasks = state.tasks.filter((e) => taskDateISO(e) !== today);
    saveTasks();
    refreshAll();
  });
});

$("deleteAllTasksBtn").addEventListener("click", () => {
  if (!state.tasks.length) {
    showInfo(t("data.noTasks"));
    return;
  }
  confirmAction(t("data.confirmDeleteAll", { count: state.tasks.length }), t("common.delete"), () => {
    state.tasks = [];
    saveTasks();
    refreshAll();
  });
});

$("deleteOldWorkBtn").addEventListener("click", () => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - WORKTIME_RETENTION_DAYS);
  const cutoffISO = isoOf(cutoff);
  const count = state.work.filter((e) => e.datum < cutoffISO).length;
  if (!count) {
    showInfo(t("data.noOldWork", { days: WORKTIME_RETENTION_DAYS }));
    return;
  }
  confirmAction(t("data.confirmDeleteOld", { count, date: fmtDate(cutoffISO) }), t("common.delete"), () => {
    state.work = state.work.filter((e) => e.datum >= cutoffISO);
    saveWork();
    refreshAll();
  });
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
