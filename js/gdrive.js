// Cloud-Backup in Google Drive, direkt aus dem Browser ohne eigenen Server.
// Nur der versteckte App-Ordner (drive.appdata): Die App sieht keine anderen Dateien, andere Apps nicht ihre Backups.
// Die Client-ID ist öffentlich; Google akzeptiert sie nur von den in der Cloud Console eingetragenen Adressen.
const CLIENT_ID = "190909841905-t8lqokh52027krgsuqmos683stfc71bt.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

let scriptPromise = null;
let tokenClient = null;
let token = null; // { value, expires }
let pending = null; // { resolve, reject } der laufenden Anmeldung

// Das Google-Skript wird erst beim ersten Tippen auf einen Cloud-Button geladen
function loadGoogleScript() {
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = null;
      script.remove();
      reject(new Error("offline"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function settleToken(resp) {
  const p = pending;
  pending = null;
  if (!p) return;
  if (resp.access_token) {
    // Tokens gelten etwa eine Stunde; eine Minute Puffer, damit keine Anfrage mit abgelaufenem Token startet
    token = { value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 };
    p.resolve(token.value);
  } else {
    p.reject(new Error(resp.error || resp.type || "auth"));
  }
}

// Öffnet bei Bedarf das Google-Fenster. Browser erlauben es nur kurz nach einem Klick, daher ohne await davor.
function requestToken() {
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: settleToken,
    error_callback: settleToken,
  });
  return new Promise((resolve, reject) => {
    pending?.reject(new Error("auth"));
    pending = { resolve, reject };
    // Leerer prompt: Zustimmung nur beim ersten Mal, danach schließt sich das Fenster von selbst
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

function getToken() {
  if (token && Date.now() < token.expires) return Promise.resolve(token.value);
  if (window.google?.accounts?.oauth2) return requestToken();
  // Erstes Tippen: Skript laden, dann das Fenster öffnen. Das dauert einen Moment, manche Browser (v. a. Safari)
  // blockieren das Fenster dann. Beim zweiten Tippen ist das Skript schon da und das Fenster öffnet sofort.
  return loadGoogleScript().then(() =>
    requestToken().catch((err) => {
      throw err.message === "popup_failed_to_open" ? new Error("retry") : err;
    })
  );
}

async function api(url, options = {}) {
  const accessToken = await getToken();
  const res = await fetch(url, { ...options, headers: { ...options.headers, Authorization: `Bearer ${accessToken}` } });
  if (res.status === 401) {
    // Token von Google nicht mehr akzeptiert; beim nächsten Versuch wird ein neues geholt
    token = null;
    throw new Error("expired");
  }
  if (!res.ok) throw new Error(`drive ${res.status}`);
  return res;
}

export async function uploadBackup(name, json) {
  const boundary = `chronoshift-${Date.now()}`;
  const metadata = { name, parents: ["appDataFolder"], mimeType: "application/json" };
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${json}\r\n--${boundary}--`;
  await api(UPLOAD_API, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
}

// Neueste zuerst
export async function listBackups() {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    fields: "files(id,name,createdTime)",
    orderBy: "createdTime desc",
    pageSize: "100",
  });
  const res = await api(`${FILES_API}?${params}`);
  return (await res.json()).files || [];
}

export async function downloadBackup(id) {
  return (await api(`${FILES_API}/${id}?alt=media`)).text();
}

export async function deleteBackup(id) {
  await api(`${FILES_API}/${id}`, { method: "DELETE" });
}

// Beim Ausschalten die Freigabe bei Google zurückziehen; die Backups selbst bleiben in Drive
export function disconnect() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value);
  token = null;
}
