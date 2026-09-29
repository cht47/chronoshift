import { t } from "./i18n.js";
import { $, esc } from "./util.js";

const infoModal = $("infoModal");
const infoModalText = $("infoModalText");
const confirmModal = $("confirmModal");
const confirmText = $("confirmText");
const confirmYesBtn = $("confirmYesBtn");

export function renderList(container, entries, builder, emptyText) {
  container.innerHTML = "";
  const group = document.createElement("div");
  group.className = "list-group";
  if (!entries.length) {
    group.innerHTML = `<div class="empty-state">${esc(emptyText)}</div>`;
  } else {
    entries.forEach((e) => group.appendChild(builder(e)));
  }
  container.appendChild(group);
}

// ----- Dialoge -----
export function showInfo(msg) {
  infoModalText.textContent = msg;
  infoModal.showModal();
}

$("infoModalOkBtn").addEventListener("click", () => infoModal.close());

let toastTimer = null;

export function showToast(msg) {
  const toast = $("toast");
  toast.textContent = msg;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 5000);
}

let confirmCallback = null;
let confirmTimer = null;

export function confirmAction(msg, label, onConfirm, countdownSec = 0) {
  clearInterval(confirmTimer);
  confirmText.textContent = msg;
  confirmCallback = onConfirm;
  let left = countdownSec;
  const update = () => {
    confirmYesBtn.disabled = left > 0;
    confirmYesBtn.textContent = left > 0 ? `${label} (${left})` : label;
  };
  update();
  if (left > 0) {
    confirmTimer = setInterval(() => {
      left--;
      update();
      if (left <= 0) clearInterval(confirmTimer);
    }, 1000);
  }
  confirmModal.showModal();
}

confirmModal.addEventListener("close", () => {
  clearInterval(confirmTimer);
  confirmCallback = null;
});
$("confirmNoBtn").addEventListener("click", () => confirmModal.close());
confirmYesBtn.addEventListener("click", () => {
  const cb = confirmCallback;
  confirmModal.close();
  if (cb) cb();
});

export function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  // Mobile Browser zeigen beim Download kaum Rückmeldung, besonders in der installierten App
  showToast(t("data.exportDone", { file: filename }));
}
