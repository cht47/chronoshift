import { refreshAll } from "./app.js";
import { WORKTIME_RETENTION_DAYS } from "./config.js";
import { fmtDate, t } from "./i18n.js";
import { state } from "./state.js";
import { clearAllData, saveTasks, saveWork } from "./storage.js";
import { taskDateISO } from "./tasks.js";
import { confirmAction, downloadFile, showInfo } from "./ui.js";
import { $, dateFromISO, isoOf, todayISO } from "./util.js";
import { compareWorkAsc, computeWorktimeStats } from "./worktime-calc.js";
import { XLSX_STYLE, buildXlsx, excelDateTime, excelTime } from "./xlsx.js";

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
