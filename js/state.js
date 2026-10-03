import { DEFAULT_SETTINGS } from "./config.js";

// Gemeinsamer Zustand aller Module (Module können importierte Variablen nicht neu zuweisen, Objekt-Eigenschaften schon)
export const state = {
  tasks: [],
  work: [],
  absences: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  running: false,
  currentStartTime: null,
  currentTask: "",
  editingWorkId: null,
  editingAbsenceId: null,
  cal: { year: 0, month: 0, selectedISO: null },
  currentView: "tasks",
};
