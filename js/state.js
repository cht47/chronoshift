import { DEFAULT_SETTINGS } from "./config.js";

// Shared state of all modules. It is a single object because modules cannot reassign imported variables,
// but they can change object properties.
export const state = {
  // Stored data, see storage.js
  tasks: [],
  work: [],
  absences: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  // Running task
  running: false,
  currentStartTime: null,
  currentTask: "",
  // Entry currently shown in the work time or absence form for editing
  editingWorkId: null,
  editingAbsenceId: null,
  // Displayed calendar month (month 0-11) and selected day
  cal: { year: 0, month: 0, selectedISO: null },
  currentView: "tasks",
  // Open settings sub-page, null for the overview
  settingsPage: null,
};
