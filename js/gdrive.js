// Cloud backup in Google Drive, straight from the browser without a server of its own.
// Uses only the hidden app folder (scope drive.appdata): the app cannot see any other files, and other apps
// cannot see its backups. The client ID is public; Google only accepts it from the origins registered in the
// Google Cloud Console.
const CLIENT_ID = "190909841905-t8lqokh52027krgsuqmos683stfc71bt.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

let scriptPromise = null;
let tokenClient = null;
let token = null; // { value, expires }
let pending = null; // { resolve, reject } of the sign-in in progress

// The Google script is only loaded on the first tap on a cloud button
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
    // Tokens are valid for about an hour; one minute of margin so no request starts with an expired token
    token = { value: resp.access_token, expires: Date.now() + (resp.expires_in - 60) * 1000 };
    p.resolve(token.value);
  } else {
    p.reject(new Error(resp.error || resp.type || "auth"));
  }
}

// Opens the Google sign-in window if needed. Browsers only allow popups right after a click, so there must be
// no await before this call.
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
    // Empty prompt: consent is only asked the first time, after that the window closes by itself
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

function getToken() {
  if (token && Date.now() < token.expires) return Promise.resolve(token.value);
  if (window.google?.accounts?.oauth2) return requestToken();
  // First tap: load the script, then open the window. Loading takes a moment, so some browsers (mainly Safari)
  // block the popup. On the second tap the script is already there and the window opens right away.
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
    // Google no longer accepts the token; the next attempt requests a new one
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

// Newest first
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

// Revokes the access when cloud backup is turned off; the backups themselves stay in Drive
export function disconnect() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.value);
  token = null;
}
