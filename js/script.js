// =====================
// CONFIG (Google Sheets API directo) ✅
// =====================

// 🛡️ Normaliza IDs (evita espacios, saltos de línea, o pegar la URL completa)
function normalizeSpreadsheetId(input) {
  const raw = String(input || "").trim();

  // Si pegaron la URL completa, extrae el /d/<ID>/
  const m = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1].trim();

  // Si es solo el ID, pero vino con basura/espacios, lo limpia
  // Google IDs suelen ser [a-zA-Z0-9-_] y largos
  const m2 = raw.match(/[a-zA-Z0-9-_]{20,}/);
  return (m2 ? m2[0] : raw).trim();
}

// ID de tu Spreadsheet de LISTA COMPRAS
// ✅ Recomendado: pegá la URL completa, normalizeSpreadsheetId extrae el /d/<ID>/
const SPREADSHEET_ID = normalizeSpreadsheetId("https://docs.google.com/spreadsheets/d/15_lqyiG2uB0GSp5RWFc5x0f06YilMQaCBXm3EDMFAq8/edit?gid=1038837531#gid=1038837531");

// Hoja/pestaña
const SHEET_NAME = String("Items").trim();

// Meta cell
const META_CELL_A1 = "Z1";

// =====================
// Helpers para diagnóstico de acceso / ID
// =====================
function spreadsheetUrl() {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(String(SPREADSHEET_ID).trim())}/edit`;
}

// Abrir planilla en pestaña nueva (útil para confirmar permisos con la cuenta actual)
window.__openSheet = function __openSheet() {
  const url = spreadsheetUrl();
  console.log("__openSheet ->", url);
  window.open(url, "_blank", "noopener,noreferrer");
};

// Test simple: intenta leer metadata (si da 404 => ID mal o sin acceso)
window.__testMeta = async function __testMeta() {
  console.log("=== __testMeta START ===");
  try {
    const token = await ensureOAuthToken(true, "consent");
    const url =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(String(SPREADSHEET_ID).trim())}` +
      `?fields=spreadsheetId,properties.title`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    console.log("__testMeta status:", r.status);
    console.log("__testMeta body:", json || text);
  } catch (e) {
    console.error("__testMeta ERROR:", e);
  }
  console.log("=== __testMeta END ===");
};

// =====================
// CONFIG OAUTH (GIS)
// =====================
// IMPORTANTE: este Client ID es del proyecto NUEVO de "Lista Compras"
const OAUTH_CLIENT_ID = "125380828558-eitpoc7fjjrqa1rseaghpkf0sdfn8mve.apps.googleusercontent.com";

// scopes: openid/email/profile + userinfo + ✅ spreadsheets (leer/escribir planilla)
const OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  // ✅ Sheets API
  "https://www.googleapis.com/auth/spreadsheets"
].join(" ");

// LocalStorage OAuth
// ✅ v2 para forzar re-autorización limpia (evita tokens viejos sin permisos)
const LS_OAUTH = "lista_oauth_token_v2";        // {access_token, expires_at}
const LS_OAUTH_EMAIL = "lista_oauth_email_v2";  // email para hint
const LS_TOMBSTONES = "lista_tombstones_v1";    // { keys: [...] }

// =====================
// Local cache/offline keys
// =====================
const LS_CACHE = "lista_drive_cache_v3";
const LS_PENDING = "lista_drive_pending_v3";

// =====================
// UI construir estructura
// =====================
const header = document.querySelector("header");

const titulo = document.createElement("section");
titulo.classList = "titulo";
header.appendChild(titulo);

// fila 1: título
const headerRow1 = document.createElement("div");
headerRow1.className = "header-row header-row-1";
titulo.appendChild(headerRow1);

const h1 = document.createElement("h1");
h1.innerText = "Lista de Compras";
headerRow1.appendChild(h1);

// fila 2: pill sync + acciones + cuenta
const headerRow2 = document.createElement("div");
headerRow2.className = "header-row header-row-2";
titulo.appendChild(headerRow2);

const syncPill = document.createElement("div");
syncPill.className = "sync-pill";
syncPill.innerHTML = `<span class="sync-dot"></span><span class="sync-text">Cargando…</span>`;
headerRow2.appendChild(syncPill);

const headerActions = document.createElement("div");
headerActions.className = "header-actions";
headerRow2.appendChild(headerActions);

const btnConnect = document.createElement("button");
btnConnect.className = "btn-connect";
btnConnect.type = "button";
btnConnect.textContent = "Conectar";
btnConnect.dataset.mode = "connect"; // connect | switch
headerActions.appendChild(btnConnect);

const btnRefresh = document.createElement("button");
btnRefresh.className = "btn-refresh";
btnRefresh.type = "button";
btnRefresh.textContent = "↻";
btnRefresh.title = "Reintentar conexión";
btnRefresh.style.display = "none";
headerActions.appendChild(btnRefresh);

const accountPill = document.createElement("div");
accountPill.className = "account-pill";
accountPill.style.display = "none";
headerRow2.appendChild(accountPill);

const main = document.querySelector("main");

const seccionLista = document.createElement("section");
seccionLista.classList = "agregarItem";
main.appendChild(seccionLista);

const label1 = document.createElement("label");
label1.innerText = "Agregar item: ";
seccionLista.appendChild(label1);

const input1 = document.createElement("input");
input1.type = "text";
input1.placeholder = "Ej: Pan lactal…";
seccionLista.appendChild(input1);

// ===== Sección (con datalist + texto libre) =====
const seccionWrap = document.createElement("div");
seccionWrap.style.display = "flex";
seccionWrap.style.alignItems = "center";
seccionWrap.style.gap = "8px";
seccionWrap.style.minWidth = "240px";
seccionLista.appendChild(seccionWrap);

const seccionLabel = document.createElement("span");
seccionLabel.textContent = "Sección:";
seccionLabel.style.color = "#fff";
seccionLabel.style.whiteSpace = "nowrap";
seccionWrap.appendChild(seccionLabel);

// --- Sección (input + ghost "Super" visible en blanco, pero value vacío) ---
const seccionInputWrap = document.createElement("div");
seccionInputWrap.className = "input-ghost-wrap";
seccionWrap.appendChild(seccionInputWrap);

const inputSeccion = document.createElement("input");
inputSeccion.type = "text";

// ✅ Dejamos el placeholder vacío para no verlo gris.
// El "Super" lo mostramos con un ghost text (span) en blanco.
inputSeccion.placeholder = "";
inputSeccion.value = "";

inputSeccion.setAttribute("list", "datalist-secciones");
inputSeccion.style.minWidth = "150px";
seccionInputWrap.appendChild(inputSeccion);

// Ghost text (se ve como texto normal cuando el input está vacío)
const seccionGhost = document.createElement("span");
seccionGhost.className = "ghost-label";
seccionGhost.textContent = "Super";
seccionInputWrap.appendChild(seccionGhost);

const dlSecciones = document.createElement("datalist");
dlSecciones.id = "datalist-secciones";
seccionWrap.appendChild(dlSecciones);

// Helper: mostrar/ocultar ghost
function updateSeccionGhost() {
  const hasValue = (inputSeccion.value || "").trim().length > 0;
  // si hay valor o está enfocado, ocultamos el ghost
  if (hasValue || document.activeElement === inputSeccion) {
    seccionInputWrap.classList.add("has-value");
  } else {
    seccionInputWrap.classList.remove("has-value");
  }
}

// Eventos para el ghost
inputSeccion.addEventListener("input", updateSeccionGhost);
inputSeccion.addEventListener("focus", updateSeccionGhost);
inputSeccion.addEventListener("blur", updateSeccionGhost);

// Inicial
updateSeccionGhost();

// ===== Subsección (depende de sección) =====
const subWrap = document.createElement("div");
subWrap.style.display = "flex";
subWrap.style.alignItems = "center";
subWrap.style.gap = "8px";
subWrap.style.minWidth = "260px";
seccionLista.appendChild(subWrap);

const subLabel = document.createElement("span");
subLabel.textContent = "Sub:";
subLabel.style.color = "#fff";
subLabel.style.whiteSpace = "nowrap";
subWrap.appendChild(subLabel);

const inputSubseccion = document.createElement("input");
inputSubseccion.type = "text";
inputSubseccion.placeholder = "Ej: Ferretería…";
inputSubseccion.setAttribute("list", "datalist-subsecciones");
inputSubseccion.style.minWidth = "170px";
subWrap.appendChild(inputSubseccion);

const dlSubsecciones = document.createElement("datalist");
dlSubsecciones.id = "datalist-subsecciones";
subWrap.appendChild(dlSubsecciones);

// ===== Botón Agregar =====
const button1 = document.createElement("button");
button1.innerText = "Agregar";
seccionLista.appendChild(button1);

// ===== BUSCADOR (input + X agrupados) =====
const buscadorWrap = document.createElement("div");
buscadorWrap.style.display = "flex";
buscadorWrap.style.alignItems = "center";
buscadorWrap.style.gap = "10px";
buscadorWrap.style.marginLeft = "10px";
buscadorWrap.style.flex = "1";

seccionLista.appendChild(buscadorWrap);

const buscador = document.createElement("input");
buscador.type = "text";
buscador.placeholder = "Buscar item...";
buscador.style.flex = "1";
buscadorWrap.appendChild(buscador);

let filtroBusqueda = "";

// ===== BOTÓN LIMPIAR BUSCADOR (X) =====
const limpiarBusquedaBtn = document.createElement("button");
limpiarBusquedaBtn.innerText = "✕";
limpiarBusquedaBtn.title = "Limpiar búsqueda";
limpiarBusquedaBtn.style.padding = "4px 10px";
limpiarBusquedaBtn.style.cursor = "pointer";
limpiarBusquedaBtn.style.display = "none"; // oculto por defecto
buscadorWrap.appendChild(limpiarBusquedaBtn);

// Mostrar / ocultar la X según haya texto
buscador.addEventListener("input", () => {
    filtroBusqueda = (buscador.value || "").toLowerCase().trim();
    limpiarBusquedaBtn.style.display = buscador.value ? "inline-block" : "none";
    render();
});

// Acción de limpiar
limpiarBusquedaBtn.addEventListener("click", () => {
    buscador.value = "";
    filtroBusqueda = "";
    limpiarBusquedaBtn.style.display = "none";
    buscador.focus();
    render();
});

const seccionItems = document.createElement("section");
seccionItems.classList = "items";
main.appendChild(seccionItems);

const seccionUtilidades = document.createElement("section");
seccionUtilidades.classList = "utilidades";
main.appendChild(seccionUtilidades);

const copiarContainer = document.createElement("div");
copiarContainer.classList = "copiar-lista";
seccionUtilidades.appendChild(copiarContainer);

const labelCopiar = document.createElement("label");
labelCopiar.innerText = "Copiar items de esta lista";
copiarContainer.appendChild(labelCopiar);

const buttonCopiar = document.createElement("button");
buttonCopiar.innerText = "Copiar items";
copiarContainer.appendChild(buttonCopiar);

const importarContainer = document.createElement("div");
importarContainer.classList = "importar-lista";
seccionUtilidades.appendChild(importarContainer);

const labelImportar = document.createElement("label");
labelImportar.innerText = "Pegar una lista que te pasaron:";
importarContainer.appendChild(labelImportar);

const textareaImportar = document.createElement("textarea");
textareaImportar.rows = 4;
textareaImportar.placeholder = "Un item por línea o separados por comas...";
importarContainer.appendChild(textareaImportar);

const buttonImportar = document.createElement("button");
buttonImportar.innerText = "Agregar a mi lista";
importarContainer.appendChild(buttonImportar);

const toastRoot = document.getElementById("toast-root");

// =====================
// Estado
// =====================
let listaItems = [];
// =====================
// Secciones / Subsecciones (UI helpers)
// =====================
const DEFAULT_SECCIONES = ["Super", "Verdulería", "Otros"];

function normCat(s) {
  return (s ?? "").toString().trim();
}

function getSeccionOrDefault(it) {
  const s = normCat(it?.seccion);
  return s || "Super";
}

function getSubOrDefault(it) {
  const s = normCat(it?.subseccion);
  return s || "";
}

function rebuildSectionDatalists() {
  // 1) Secciones existentes + defaults
  const setSec = new Set(DEFAULT_SECCIONES);
  for (const it of (listaItems || [])) setSec.add(getSeccionOrDefault(it));

  const secciones = Array.from(setSec).filter(Boolean).sort((a,b)=>a.localeCompare(b));

  dlSecciones.innerHTML = "";
  for (const s of secciones) {
    const opt = document.createElement("option");
    opt.value = s;
    dlSecciones.appendChild(opt);
  }

  // 2) Subsecciones SOLO de la sección actual
  const secActual = normCat(inputSeccion.value) || "Super";
  const setSub = new Set();
  for (const it of (listaItems || [])) {
    const sec = getSeccionOrDefault(it);
    if (sec !== secActual) continue;
    const sub = getSubOrDefault(it);
    if (sub) setSub.add(sub);
  }

  const subs = Array.from(setSub).sort((a,b)=>a.localeCompare(b));
  dlSubsecciones.innerHTML = "";
  for (const s of subs) {
    const opt = document.createElement("option");
    opt.value = s;
    dlSubsecciones.appendChild(opt);
  }
}

// cuando cambia la sección, refrescamos las subsecciones
// ✅ NO forzamos "Super" en el input (dejamos que quede vacío)
// ✅ Solo usamos "Super" como default lógico (para filtrar subsecciones / al agregar items)
let _lastSeccionParaSub = "Super";

inputSeccion.addEventListener("input", () => {
  const secActual = normCat(inputSeccion.value) || "Super";

  // Solo limpiamos la subsección si realmente cambió la sección (lógica)
  if (secActual !== _lastSeccionParaSub) {
    inputSubseccion.value = "";
    _lastSeccionParaSub = secActual;
  }

  rebuildSectionDatalists();
});

// (opcional) Al enfocar, reconstruimos para asegurar opciones actualizadas
inputSeccion.addEventListener("focus", () => {
  rebuildSectionDatalists();
});

let remoteMeta = { updatedAt: 0 };

// =====================
// OAuth state
// =====================
let tokenClient = null;
let oauthAccessToken = "";
let oauthExpiresAt = 0;

// =====================
// Connection lock (evita reconexiones pisadas)
// =====================
let connectInFlight = null; // Promise | null

function isConnectBusy() {
  return !!connectInFlight;
}

// =====================
// DEBUG / LOGS
// =====================
const DEBUG_SYNC = true;

function dbg(...args) {
  if (!DEBUG_SYNC) return;
  console.log("[SYNC]", ...args);
}
function dbgWarn(...args) {
  if (!DEBUG_SYNC) return;
  console.warn("[SYNC]", ...args);
}
function dbgErr(...args) {
  if (!DEBUG_SYNC) return;
  console.error("[SYNC]", ...args);
}

// =====================
// TEST rápido (Sheets API directo)
// =====================
window.__testSheetsGet = async function __testSheetsGet() {
  console.log("=== __testSheetsGet START ===");
  try {
    // allowInteractive true => si falta algo, abre popup de consent
    const data = await apiCall("get", {}, { allowInteractive: true, interactivePrompt: "consent" });
    console.log("__testSheetsGet resp:", data);
  } catch (e) {
    console.error("__testSheetsGet ERROR:", e);
  }
  console.log("=== __testSheetsGet END ===");
};

// =====================
// DIAGNÓSTICO (meta + hojas visibles)
// =====================
window.__diagSheets = async function __diagSheets() {
  console.log("=== __diagSheets START ===");

  try {
    const token = await ensureOAuthToken(true, "consent");
    console.log("__diagSheets token ok:", !!token);

    const urlMeta =
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(String(SPREADSHEET_ID).trim())}` +
      `?fields=spreadsheetId,properties.title,sheets.properties.title`;

    console.log("__diagSheets META url:", urlMeta);

    const r = await fetch(urlMeta, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store"
    });

    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    console.log("__diagSheets META status:", r.status);
    console.log("__diagSheets META body:", json || text);

    if (json?.sheets?.length) {
      const names = json.sheets.map(s => s?.properties?.title).filter(Boolean);
      console.log("__diagSheets hojas visibles:", names);
      console.log("__diagSheets SHEET_NAME actual:", SHEET_NAME);
    }

  } catch (e) {
    console.error("__diagSheets ERROR:", e);
  }

  console.log("=== __diagSheets END ===");
};

// =====================
// FORZAR EXPIRACIÓN (para probar auto-reconexión)
// =====================
function __expireTokenNow(hard = true) {
  dbgWarn("__expireTokenNow() -> forzando token inválido", { hard });

  // invalida runtime
  oauthExpiresAt = 0;

  // modo hard: invalida también lo guardado, así NO puede “revivir” del storage
  if (hard) {
    try { localStorage.setItem(LS_OAUTH, JSON.stringify({ access_token: oauthAccessToken || "", expires_at: 0 })); } catch {}
    // si querés simular el caso extremo:
    // clearStoredOAuth(); oauthAccessToken = "";
  }
}
window.__expireTokenNow = __expireTokenNow;



// =====================
// Tombstones / merge helpers
// =====================
function loadTombstones() {
    try {
        const raw = localStorage.getItem(LS_TOMBSTONES);
        const parsed = raw ? JSON.parse(raw) : null;
        const keys = Array.isArray(parsed?.keys) ? parsed.keys : [];
        return new Set(keys.map(k => (k || "").toString().toLowerCase()));
    } catch {
        return new Set();
    }
}

function saveTombstones(set) {
    try {
        localStorage.setItem(LS_TOMBSTONES, JSON.stringify({ keys: Array.from(set) }));
    } catch { }
}

let tombstones = loadTombstones();

function keyFromTexto(texto) {
    return (texto || "").toString().trim().toLowerCase();
}

function mergeRemoteWithLocal(remoteItems, localItems, tombstoneSet) {
    const byKey = new Map();

    function normalizeItem(it) {
      const texto = normalizarTexto(it?.texto);
      if (!texto) return null;
      return {
        texto,
        completado: !!it?.completado,
        seccion: normCat(it?.seccion) || "Super",
        subseccion: normCat(it?.subseccion) || "",
        noDisponible: !!it?.noDisponible
      };
    }

    // base remoto
    for (const it of (remoteItems || [])) {
        const norm = normalizeItem(it);
        if (!norm) continue;
        const k = keyFromTexto(norm.texto);
        if (tombstoneSet.has(k)) continue;
        byKey.set(k, norm);
    }

    // overlay local (gana local)
    for (const it of (localItems || [])) {
        const norm = normalizeItem(it);
        if (!norm) continue;
        const k = keyFromTexto(norm.texto);
        if (tombstoneSet.has(k)) continue;
        byKey.set(k, norm);
    }

    return dedupNormalize(Array.from(byKey.values()));
}

// ===== Control de cambios locales (evita pisadas por GET de verificación) =====
let localVersion = 0;        // sube cada vez que el usuario cambia algo

// =====================
// UI helpers
// =====================
function setSync(state, text) {
    syncPill.classList.remove("ok", "saving", "offline");
    if (state) syncPill.classList.add(state);
    syncPill.querySelector(".sync-text").textContent = text;
}

function escapeHtml(s) {
    return (s ?? "").toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function toast(msg, type = "ok", small = "") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `${escapeHtml(msg)}${small ? `<div class="small">${escapeHtml(small)}</div>` : ""}`;
    toastRoot.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(6px)";
        el.style.transition = "all .2s ease";
    }, 2400);
    setTimeout(() => el.remove(), 2700);
}

// =====================
// Data helpers
// =====================
function ordenarLista(arr) {
    return (arr || []).sort((a, b) => {
        // 1) No disponible siempre al final
        const na = a.noDisponible ? 1 : 0;
        const nb = b.noDisponible ? 1 : 0;
        if (na !== nb) return na - nb;

        // 2) Para comprar (completado=true) arriba
        const ca = a.completado ? 0 : 1;
        const cb = b.completado ? 0 : 1;
        if (ca !== cb) return ca - cb;

        // 3) Luego por sección, subsección, texto
        const sa = (a.seccion || "").toLowerCase();
        const sb = (b.seccion || "").toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);

        const ua = (a.subseccion || "").toLowerCase();
        const ub = (b.subseccion || "").toLowerCase();
        if (ua !== ub) return ua.localeCompare(ub);

        return (a.texto || "").toLowerCase().localeCompare((b.texto || "").toLowerCase());
    });
}

function normalizarTexto(t) {
    return (t ?? "").toString().trim();
}

function dedupNormalize(items) {
    const seen = new Set();
    const out = [];
    for (const it of items || []) {
        const texto = normalizarTexto(it?.texto);
        if (!texto) continue;

        const key = texto.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
            texto,
            completado: !!it?.completado,
            seccion: normCat(it?.seccion) || "Super",
            subseccion: normCat(it?.subseccion) || "",
            noDisponible: !!it?.noDisponible
        });
    }
    return ordenarLista(out);
}

// =====================
// Cache
// =====================
function loadCache() {
    try {
        const raw = localStorage.getItem(LS_CACHE);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed?.items)) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCache(items, meta = {}) {
    try {
        localStorage.setItem(LS_CACHE, JSON.stringify({
            items,
            meta: { updatedAt: meta.updatedAt || 0, ts: Date.now() }
        }));
    } catch { }
}

function loadPending() {
    try {
        const raw = localStorage.getItem(LS_PENDING);
        const p = raw ? JSON.parse(raw) : null;
        return Array.isArray(p?.items) ? p : null;
    } catch {
        return null;
    }
}

function setPending(items) {
    try { localStorage.setItem(LS_PENDING, JSON.stringify({ items, ts: Date.now() })); } catch { }
}

function clearPending() {
    try { localStorage.removeItem(LS_PENDING); } catch { }
}

function isOnline() {
    return navigator.onLine !== false;
}

// =====================
// OAuth helpers
// =====================
function isTokenValid() {
    return !!oauthAccessToken && Date.now() < (oauthExpiresAt - 10_000);
}

function loadStoredOAuth() {
    try {
        const raw = localStorage.getItem(LS_OAUTH);
        const parsed = raw ? JSON.parse(raw) : null;
        if (!parsed?.access_token || !parsed?.expires_at) return null;
        return { access_token: parsed.access_token, expires_at: Number(parsed.expires_at) };
    } catch {
        return null;
    }
}
function saveStoredOAuth(access_token, expires_at) {
    try { localStorage.setItem(LS_OAUTH, JSON.stringify({ access_token, expires_at })); } catch { }
}
function clearStoredOAuth() {
    try { localStorage.removeItem(LS_OAUTH); } catch { }
}

function loadStoredOAuthEmail() {
  try {
    return String(localStorage.getItem(LS_OAUTH_EMAIL) || "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function saveStoredOAuthEmail(email) {
    try { localStorage.setItem(LS_OAUTH_EMAIL, (email || "").toString()); } catch { }
}
function clearStoredOAuthEmail() {
    try { localStorage.removeItem(LS_OAUTH_EMAIL); } catch { }
}

async function fetchUserEmailFromToken(accessToken) {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!r.ok) throw new Error("No se pudo obtener userinfo");
    const data = await r.json();
    return (data?.email || "").toString();
}

function initOAuth() {
    if (!window.google?.accounts?.oauth2?.initTokenClient) {
        throw new Error("GIS no está cargado (falta gsi/client en HTML)");
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: OAUTH_CLIENT_ID,
        scope: OAUTH_SCOPES,
        include_granted_scopes: true,
        // evita prompts raros en algunos navegadores
        use_fedcm_for_prompt: true,
        callback: () => { } // lo seteo en requestAccessToken
    });
}

// prompt: "" (silent), "consent", "select_account"
function requestAccessToken({ prompt, hint } = {}) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("OAuth no inicializado"));

    let done = false;

    // ✅ Timeout anti-“cuelgue” (igual que tu Lista de Tareas)
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("popup_timeout_or_closed"));
    }, 45_000);

    tokenClient.callback = (resp) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      if (!resp || resp.error) {
        const err = String(resp?.error || "oauth_error");
        const sub = String(resp?.error_subtype || "");
        const msg = (err + (sub ? `:${sub}` : "")).toLowerCase();

        // ✅ Normalizamos cancelaciones / interacciones requeridas
        const e = new Error(err);
        e.isCanceled =
          msg.includes("popup_closed") ||
          msg.includes("popup_closed_by_user") ||
          msg.includes("access_denied") ||
          msg.includes("user_cancel") ||
          msg.includes("interaction_required");

        return reject(e);
      }

      const accessToken = resp.access_token;
      const expiresIn = Number(resp.expires_in || 3600);
      const expiresAt = Date.now() + (expiresIn * 1000);

      oauthAccessToken = accessToken;
      oauthExpiresAt = expiresAt;
      saveStoredOAuth(accessToken, expiresAt);

      resolve({ access_token: accessToken, expires_at: expiresAt });
    };

    // ✅ Si prompt es undefined, no lo mandamos (más estable)
    const req = {};
    if (prompt !== undefined) req.prompt = prompt;
    if (hint && String(hint).includes("@")) req.hint = hint;

    try {
      tokenClient.requestAccessToken(req);
    } catch (e) {
      clearTimeout(timer);
      reject(e);
    }
  });
}

// allowInteractive=false => NO popup
async function ensureOAuthToken(allowInteractive = false, interactivePrompt = "consent") {
  // 1) token en memoria
  if (isTokenValid()) return oauthAccessToken;

  // 2) token guardado válido
  const stored = loadStoredOAuth();
  if (stored?.access_token && stored?.expires_at && Date.now() < (stored.expires_at - 10_000)) {
    oauthAccessToken = stored.access_token;
    oauthExpiresAt = Number(stored.expires_at);
    return oauthAccessToken;
  }

  const hintEmail = (loadStoredOAuthEmail() || "").trim().toLowerCase();

  // ✅ CORTE estilo Drive XL:
  // Si NO es interactivo y NO tengo token guardado válido y NO tengo hint => NO llamar GIS
  if (!allowInteractive && !hintEmail) {
    throw new Error("TOKEN_NEEDS_INTERACTIVE");
  }

  // 3) Silent real (prompt:"")
  try {
    await requestAccessToken({ prompt: "", hint: hintEmail || undefined });
    if (isTokenValid()) return oauthAccessToken;
  } catch (e) {
    const msg = String(e?.message || e || "").toLowerCase();
    dbgWarn("ensureOAuthToken(silent) falló:", msg);

    // si NO podemos interactuar, normalizamos error para el resto del sistema
    if (!allowInteractive) throw new Error("TOKEN_NEEDS_INTERACTIVE");
  }

  // 4) Interactivo
  await requestAccessToken({ prompt: interactivePrompt ?? "consent", hint: hintEmail || undefined });

  if (!isTokenValid()) {
    throw new Error("TOKEN_NEEDS_INTERACTIVE");
  }

  return oauthAccessToken;
}

async function forceSwitchAccount() {
    clearStoredOAuth();
    clearStoredOAuthEmail();
    oauthAccessToken = "";
    oauthExpiresAt = 0;
    await ensureOAuthToken(true, "select_account");
}

// =====================
// API client (POST text/plain + JSON body)
// =====================

// =====================
// API client (Sheets API directo) ✅
// Mantiene la interfaz { mode, access_token, ... } como tu sistema actual
// Respuestas compatibles con lo que ya espera tu código:
// - whoami: {ok, email}
// - get:    {ok, email, items, meta:{updatedAt,count}}
// - set:    {ok, email, saved, meta:{updatedAt,count}}
// - conflict:{ok:false,error:"conflict", items, meta:{updatedAt,count}}
// =====================
async function apiPost_(payload) {
  const mode = (payload?.mode || "").toString().toLowerCase();
  const token = (payload?.access_token || "").toString();
  if (!token) return { ok: false, error: "auth_required" };

  // helper interno: fetch JSON
  async function fetchJson(url, options = {}) {
    const r = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    const text = await r.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}

    return { r, status: r.status, url, text, json };
  }

  // clasifica errores típicos de Google APIs (para ver “qué es” el 404/403)
  function classifyGoogleApiError(resp) {
    const status = Number(resp?.status || 0);
    const msg = String(resp?.json?.error?.message || resp?.text || "").toLowerCase();
    const stat = String(resp?.json?.error?.status || "").toLowerCase();

    if (status === 401) return { error: "auth_required" };

    if (status === 403) {
      // token sin scopes / permisos insuficientes
      if (
        msg.includes("insufficient authentication scopes") ||
        msg.includes("access_token_scope_insufficient") ||
        msg.includes("insufficientpermissions")
      ) return { error: "missing_scope" };

      if (msg.includes("has not been used in project") || msg.includes("is disabled")) {
        return { error: "api_disabled" };
      }

      return { error: "permission_denied" };
    }

    if (status === 404) {
      // IMPORTANTÍSIMO:
      // Google suele devolver 404 cuando:
      // - ID incorrecto, o
      // - la cuenta NO tiene acceso (aunque exista), o
      // - el recurso está en un contexto que no estás viendo con esa cuenta
      // mensaje típico: "Requested entity was not found."
      return { error: "not_found_or_no_access" };
    }

    return { error: "http_" + status };
  }

  try {
    // ---------- PING ----------
    if (mode === "ping") return { ok: true, pong: true };

    // ---------- WHOAMI ----------
    if (mode === "whoami") {
      const resp = await fetchJson("https://openidconnect.googleapis.com/v1/userinfo");
      if (!resp?.r?.ok) {
        const cls = classifyGoogleApiError(resp);
        return { ok: false, error: cls.error || "whoami_failed", status: resp.status, detail: String(resp.text || "").slice(0, 1200) };
      }
      const email = (resp?.json?.email || "").toString().toLowerCase().trim();
      return { ok: true, email };
    }

    // ---------- GET ----------
    if (mode === "get") {
      const rangeItems = `${SHEET_NAME}!A2:E`;
      const rangeMeta  = `${SHEET_NAME}!${META_CELL_A1}`;

      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}` +
        `/values:batchGet?ranges=${encodeURIComponent(rangeItems)}&ranges=${encodeURIComponent(rangeMeta)}` +
        `&majorDimension=ROWS`;

      const resp = await fetchJson(url);
      if (!resp?.r?.ok) {
        const cls = classifyGoogleApiError(resp);
        return {
          ok: false,
          error: cls.error || "get_failed",
          status: resp.status,
          url: resp.url,
          detail: String(resp.text || "").slice(0, 2000)
        };
      }

      const json = resp.json || {};
      const valueRanges = Array.isArray(json?.valueRanges) ? json.valueRanges : [];
      const itemsValues = Array.isArray(valueRanges?.[0]?.values) ? valueRanges[0].values : [];
      const metaValues  = Array.isArray(valueRanges?.[1]?.values) ? valueRanges[1].values : [];

      const updatedAt = Number(metaValues?.[0]?.[0] || 0);

      const items = itemsValues
        .filter(row => (row?.[0] || "").toString().trim() !== "")
        .map(row => ({
          texto: (row?.[0] || "").toString(),
          completado:
            String(row?.[1] || "").toLowerCase().trim() === "true" ||
            String(row?.[1] || "").trim() === "1",
          seccion: (row?.[2] || "").toString().trim() || "Super",
          subseccion: (row?.[3] || "").toString().trim() || "",
          noDisponible:
            String(row?.[4] || "").toLowerCase().trim() === "true" ||
            String(row?.[4] || "").trim() === "1"
        }));

      // Email (opcional)
      let email = "";
      try {
        const who = await apiPost_({ mode: "whoami", access_token: token });
        if (who?.ok) email = who.email || "";
      } catch {}

      return { ok: true, email, items, meta: { updatedAt, count: items.length } };
    }

    // ---------- SET ----------
    if (mode === "set") {
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const expectedUpdatedAt = Number(payload?.expectedUpdatedAt || 0);

      // 1) leer estado remoto
      const before = await apiPost_({ mode: "get", access_token: token });
      if (!before?.ok) return before;

      const remoteUA = Number(before?.meta?.updatedAt || 0);
      const remoteCount = Number(before?.meta?.count || 0);

      if (expectedUpdatedAt !== remoteUA) {
        return {
          ok: false,
          error: "conflict",
          items: Array.isArray(before?.items) ? before.items : [],
          meta: { updatedAt: remoteUA, count: remoteCount }
        };
      }

      // 2) normalizar/dedup/ordenar  ✅ (mantener seccion/subseccion/noDisponible)
      let clean = (items || [])
        .map(it => ({
          texto: (it?.texto || "").toString().trim(),
          completado: !!it?.completado,
          seccion: normCat(it?.seccion) || "Super",
          subseccion: normCat(it?.subseccion) || "",
          noDisponible: !!it?.noDisponible
        }))
        .filter(it => it.texto !== "");

      // dedupe case-insensitive por texto (mantiene el primero que aparezca)
      const seen = new Set();
      const out = [];
      for (const it of clean) {
        const key = it.texto.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(it);
      }
      clean = out;

      // orden consistente con tu UI (noDisponible al final, luego para comprar, etc.)
      clean = ordenarLista(clean);

      if (clean.length === 0) return { ok: false, error: "empty_list_blocked" };

      // 3) batchUpdate
      const nextUA = Date.now();
      const maxLen = Math.max(remoteCount, clean.length);

      const values = [];
      for (let i = 0; i < maxLen; i++) {
        if (i < clean.length) {
          values.push([
            clean[i].texto,
            clean[i].completado ? "TRUE" : "FALSE",
            (clean[i].seccion || "Super"),
            (clean[i].subseccion || ""),
            clean[i].noDisponible ? "TRUE" : "FALSE"
          ]);
        } else {
          values.push(["", "", "", "", ""]);
        }
      }

      const url =
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SPREADSHEET_ID)}` +
        `/values:batchUpdate`;

      const body = {
        valueInputOption: "USER_ENTERED",
        data: [
          // ✅ headers (por si no existen)
          { range: `${SHEET_NAME}!A1:E1`, majorDimension: "ROWS", values: [["texto", "completado", "seccion", "subseccion", "no_disponible"]] },

          // ✅ data
          { range: `${SHEET_NAME}!A2:E`, majorDimension: "ROWS", values },

          // meta
          { range: `${SHEET_NAME}!${META_CELL_A1}`, majorDimension: "ROWS", values: [[String(nextUA)]] }
        ]
      };

      const resp2 = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      if (!resp2?.r?.ok) {
        const cls = classifyGoogleApiError(resp2);
        return {
          ok: false,
          error: cls.error || "set_failed",
          status: resp2.status,
          url: resp2.url,
          detail: String(resp2.text || "").slice(0, 2000)
        };
      }

      // Email (opcional)
      let email = "";
      try {
        const who = await apiPost_({ mode: "whoami", access_token: token });
        if (who?.ok) email = who.email || "";
      } catch {}

      return { ok: true, email, saved: clean.length, meta: { updatedAt: nextUA, count: clean.length } };
    }

    return { ok: false, error: "bad_mode" };
  } catch (e) {
    return { ok: false, error: "network_error", detail: String(e?.message || e) };
  }
}

// =====================
// POST helper (para SET sin URL gigante)
// - Content-Type: text/plain => evita preflight CORS
// =====================
async function apiCall(mode, payload = {}, opts = {}) {
  const allowInteractive = !!opts.allowInteractive;

  // 1) asegurar token
  let token = await ensureOAuthToken(allowInteractive, opts.interactivePrompt || "consent");
  dbg("apiCall:", { mode, allowInteractive, hasToken: !!token });

  // 2) armar body
  const body = { mode, access_token: token, ...(payload || {}) };

  // 3) POST para todo
  let data = await apiPost_(body);

  // 4) retry con consent si falta scope/auth
  if (!data?.ok && (
      data?.error === "missing_scope" ||
      data?.error === "auth_required" ||
      data?.error === "whoami_failed"
    )) {
    token = await ensureOAuthToken(true, "consent");
    body.access_token = token;
    data = await apiPost_(body);
  }

  return data || { ok: false, error: "empty_response" };
}

async function verifyBackendAccessOrThrow(allowInteractive) {
  const data = await apiCall("whoami", {}, { allowInteractive });

  if (!data?.ok) {
    console.error("WHOAMI FAIL:", data);
    const msg = (data?.error || "no_access") + (data?.detail ? ` | ${data.detail}` : "");
    throw new Error(msg);
  }

  return data;
}

// =====================
// Render
// =====================
function render() {
    seccionItems.innerHTML = "";

    const listaFiltrada = !filtroBusqueda
        ? listaItems
        : listaItems.filter(it => it.texto.toLowerCase().includes(filtroBusqueda));

    // 3 zonas:
    const paraComprar = listaFiltrada.filter(it => !!it.completado && !it.noDisponible);
    const resto = listaFiltrada.filter(it => !it.completado && !it.noDisponible);
    const noDisp = listaFiltrada.filter(it => !!it.noDisponible);

    function sectionOrderKey(s) {
      const ss = (s || "").toLowerCase();
      if (ss === "verdulería" || ss === "verduleria") return "0_" + ss;
      if (ss === "super") return "1_" + ss;
      if (ss === "otros") return "2_" + ss;
      return "3_" + ss;
    }

    function normalizeSectionForCss(sec) {
      const s = (sec || "").toString().trim().toLowerCase();
      if (s === "verdulería" || s === "verduleria") return "verduleria";
      if (s === "super") return "super";
      if (s === "otros") return "otros";
      return "default";
    }

    function groupBySeccionSub(items) {
      const map = new Map(); // sec -> sub -> []
      for (const it of (items || [])) {
        const sec = getSeccionOrDefault(it);
        const sub = getSubOrDefault(it) || "Sin subsección";
        if (!map.has(sec)) map.set(sec, new Map());
        const subMap = map.get(sec);
        if (!subMap.has(sub)) subMap.set(sub, []);
        subMap.get(sub).push(it);
      }
      return map;
    }

    function renderZone(title, items) {
      if (!items.length) return;

      const zone = document.createElement("div");
      zone.className = "zone";
      zone.style.marginBottom = "14px";

      const h = document.createElement("div");
      h.className = "zone-title";
      h.textContent = title;
      h.style.padding = "10px 10px 6px 10px";
      h.style.color = "#fff";
      h.style.fontWeight = "600";
      h.style.opacity = "0.95";
      zone.appendChild(h);

      const grouped = groupBySeccionSub(items);

      const secciones = Array.from(grouped.keys()).sort((a,b)=> {
        return sectionOrderKey(a).localeCompare(sectionOrderKey(b));
      });

      for (const sec of secciones) {
        const secBlock = document.createElement("div");
        secBlock.className = "sec-block";

        // ✅ NUEVO: clase por sección para colorear flúor
        secBlock.classList.add("sec-" + normalizeSectionForCss(sec));

        secBlock.style.margin = "0 10px 10px 10px";
        secBlock.style.border = "1px solid rgba(255,255,255,0.05)";
        secBlock.style.borderRadius = "12px";
        secBlock.style.overflow = "hidden";

        const secHeader = document.createElement("div");
        secHeader.textContent = sec;
        secHeader.style.padding = "10px 10px";
        secHeader.style.background = "rgba(255,255,255,0.03)";
        secHeader.style.fontWeight = "600";
        secHeader.style.color = "#fff";
        secBlock.appendChild(secHeader);

        const subMap = grouped.get(sec);
        const subs = Array.from(subMap.keys()).sort((a,b)=>a.localeCompare(b));

        for (const sub of subs) {
          const subHeader = document.createElement("div");
          subHeader.textContent = "• " + sub;
          subHeader.style.padding = "8px 10px";
          subHeader.style.color = "rgba(255,255,255,0.75)";
          subHeader.style.fontSize = "0.9rem";
          subHeader.style.borderTop = "1px solid rgba(255,255,255,0.04)";
          secBlock.appendChild(subHeader);

          for (const item of subMap.get(sub)) {
            const index = listaItems.indexOf(item);

            const itemContainer = document.createElement("div");
            itemContainer.classList.add("item-container");

            const tick = document.createElement("input");
            tick.type = "checkbox";
            tick.checked = !!item.completado;

            tick.addEventListener("change", () => {
                item.completado = tick.checked;

                // si lo desmarcás, por seguridad lo sacamos de "No disponible"
                if (!item.completado) item.noDisponible = false;

                listaItems = dedupNormalize(listaItems);
                localVersion++;
                render();
                scheduleSave("Cambio de estado");
            });

            const listItem = document.createElement("p");
            listItem.innerText = item.texto;

            // ===== Botón No hay / Volver =====
            const btnNoHay = document.createElement("button");
            btnNoHay.className = "btn-nohay";
            btnNoHay.type = "button";

            if (item.noDisponible) {
              btnNoHay.textContent = "Volver";
              btnNoHay.title = "Sacar de No disponible";
            } else {
              btnNoHay.textContent = "No hay";
              btnNoHay.title = "Marcar como No disponible";
            }

            // en "Resto" (no completado) no tiene sentido “No hay”
            if (!item.completado && !item.noDisponible) {
              btnNoHay.style.display = "none";
            }

            btnNoHay.addEventListener("click", () => {
              if (item.noDisponible) {
                item.noDisponible = false; // vuelve a su zona normal
              } else {
                // si lo marcás como no disponible, queda "para comprar" pero se va al final
                item.noDisponible = true;
                item.completado = true;
              }
              listaItems = dedupNormalize(listaItems);
              localVersion++;
              render();
              scheduleSave(item.noDisponible ? "Marcado No disponible" : "Volvió a disponibles");
            });

            const botonEliminarItem = document.createElement("button");
            botonEliminarItem.innerText = "Eliminar";
            botonEliminarItem.classList.add("eliminar-item");
            botonEliminarItem.setAttribute("data-index", index);

            itemContainer.appendChild(tick);
            itemContainer.appendChild(listItem);
            itemContainer.appendChild(btnNoHay);
            itemContainer.appendChild(botonEliminarItem);

            secBlock.appendChild(itemContainer);
          }
        }

        zone.appendChild(secBlock);
      }

      seccionItems.appendChild(zone);
    }

    renderZone("Para comprar", paraComprar);
    renderZone("No disponible", noDisp);
    renderZone("Lista", resto);
}

// =====================
// CRUD
// =====================
function agregarElemento(texto, completado = false) {
    const t = normalizarTexto(texto);
    if (!t) return;

    // si estaba borrado (tombstone) y lo re-agregás, se perdona
    const k = keyFromTexto(t);
    if (k && tombstones.has(k)) {
        tombstones.delete(k);
        saveTombstones(tombstones);
    }

    const existe = listaItems.some(obj => obj.texto.toLowerCase() === t.toLowerCase());
    if (existe) {
        toast("Ese item ya existe", "warn", "No se agregan duplicados.");
        return;
    }

    const seccion = normCat(inputSeccion.value) || "Super";
    const subseccion = normCat(inputSubseccion.value) || "";

    listaItems.push({
      texto: t,
      completado: !!completado,
      seccion,
      subseccion,
      noDisponible: false
    });

    listaItems = dedupNormalize(listaItems);
    localVersion++;
    render();
    rebuildSectionDatalists();
    scheduleSave("Item agregado");
}

function eliminarElemento(index) {
    const item = listaItems[index];
    if (!item) return;

    const ok = confirm(`¿Eliminar "${item.texto}"?`);
    if (!ok) return;

    // tombstone para que NO vuelva por merge si remoto aún lo tiene
    const k = keyFromTexto(item.texto);
    if (k) {
        tombstones.add(k);
        saveTombstones(tombstones);
    }

    listaItems.splice(index, 1);
    localVersion++;
    render();
    scheduleSave("Item eliminado");
}

// =====================
// Save engine (debounce + offline queue + verify)
// =====================
let saveTimer = null;
let saving = false;

// =====================
// Auto-retry sync pending (backoff)
// =====================
let retryTimer = null;
let retryDelayMs = 2000;         // arranca en 2s
const RETRY_MAX_MS = 60000;      // tope 60s

function resetRetry() {
  retryDelayMs = 2000;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

async function scheduleRetry(label = "") {
  // si ya hay un retry programado, no duplicar
  if (retryTimer) return;

  // si no hay pending real, no programes nada
  const p = loadPending();
  if (!p?.items) return;

  // no reintentar si no hay condiciones mínimas
  if (!isOnline()) return;
  if (saving) return;

  // intento silencioso: si logra token, buenísimo; si no, frenamos el retry
  if (!isTokenValid()) {
    try {
      dbgWarn("scheduleRetry: token inválido -> intento ensureOAuthToken(false)");
      await ensureOAuthToken(false);
    } catch (e) {
      const msg = String(e?.message || e || "");
      dbgWarn("scheduleRetry: no pudo asegurar token silencioso:", msg);

      // ✅ si necesita interacción, NO reintentar en loop
      if (msg === "TOKEN_NEEDS_INTERACTIVE") {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
      }
      return;
    }
  }


  if (!isTokenValid()) return;


  retryTimer = setTimeout(async () => {
    retryTimer = null;
    try {
      await trySyncPending();
      // si trySyncPending sincronizó, ella misma va a limpiar pending y setear OK
      // si NO sincronizó, dejamos que scheduleRetry vuelva a programar
      if (loadPending()?.items) {
        retryDelayMs = Math.min(Math.floor(retryDelayMs * 1.7), RETRY_MAX_MS);
        scheduleRetry("retry_loop");
      } else {
        resetRetry();
      }
    } catch {
      retryDelayMs = Math.min(Math.floor(retryDelayMs * 1.7), RETRY_MAX_MS);
      scheduleRetry("retry_loop_err");
    }
  }, retryDelayMs);
}


async function scheduleSave(reason = "") {
  saveCache(listaItems, remoteMeta);

  if (!isOnline()) {
    setSync("offline", "Sin conexión — Guardado local");
    setPending(listaItems);
    if (reason) toast("Guardado local (offline)", "warn", "Se sincroniza cuando vuelva internet.");
    // reintento queda para cuando vuelva online (evento online ya llama trySyncPending)
    return;
  }


  // si no hay token válido, intentá renovar SILENCIOSO antes de rendirte
  if (!isTokenValid()) {
    try {
      dbgWarn("scheduleSave: token inválido -> intento ensureOAuthToken(false)");
      await ensureOAuthToken(false);
    } catch (e) {
      dbgWarn("scheduleSave: no pudo asegurar token silencioso:", e?.message || e);
    }
  }

  // si sigue sin token válido, queda en pending
  if (!isTokenValid()) {
    setSync("offline", "Necesita Conectar");
    setPending(listaItems);
    btnRefresh.style.display = "inline-block";
    if (reason) toast("Guardado local", "warn", "Conectá para sincronizar.");
    return;
  }



  setSync("saving", "Guardando…");
  clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    if (saving) return;
    saving = true;

    try {
      const startedVersion = localVersion;

      // ✅ Optimistic save: NO hacemos GET antes del SET
      // Usamos el updatedAt local que ya tenemos
      const remoteUA = Number(remoteMeta?.updatedAt || 0);

      // Merge: usamos "listaItems" como base local
      // (si hay conflicto, el backend nos devuelve items y re-mergeamos)
      const merged = mergeRemoteWithLocal([], listaItems, tombstones);


      // Seguridad: no guardar vacío por error
      if (merged.length === 0) {
        setPending(listaItems);
        setSync("offline", "No se guardó (lista vacía bloqueada)");
        toast("Bloqueado", "warn", "No se permite guardar una lista vacía por seguridad.");
        return;
      }

      // Set con expectedUpdatedAt (conflictos)
      let saved = await apiCall("set", { items: merged, expectedUpdatedAt: remoteUA }, { allowInteractive: false });

      if (!saved?.ok && saved?.error === "conflict") {
        // ✅ Re-merge con lo que el backend devolvió (estado actual remoto)
        const rItems = Array.isArray(saved?.items) ? saved.items : [];
        const rUA = Number(saved?.meta?.updatedAt || 0);

        const merged2 = mergeRemoteWithLocal(rItems, listaItems, tombstones);
        const saved2 = await apiCall("set", { items: merged2, expectedUpdatedAt: rUA }, { allowInteractive: false });

        if (!saved2?.ok) throw new Error(saved2?.error || "set_failed");

        saved = saved2;
      }

      if (!saved?.ok) throw new Error(saved?.error || "set_failed");

      // ok
      remoteMeta = { updatedAt: Number(saved?.meta?.updatedAt || 0) };


      // Si hubo cambios mientras guardábamos, no “pisar” el estado local
      if (localVersion !== startedVersion) {
        setPending(listaItems);
        setSync("saving", "Guardando…");
        saving = false;
        scheduleSave("");
        return;
      }

      // OK: persistimos cache y limpiamos pending
      listaItems = dedupNormalize(merged);
      saveCache(listaItems, remoteMeta);
      clearPending();

      render();
      setSync("ok", "Guardado ✅");
      btnRefresh.style.display = "none";
      if (reason) toast("Guardado ✅", "ok", reason);
    } catch (e) {
      dbgErr("scheduleSave ERROR:", e);

      setPending(listaItems);
      setSync("offline", "No se pudo guardar — Queda en cola");
      btnRefresh.style.display = "inline-block";
      toast("No se pudo guardar", "err", "Quedó pendiente, se reintenta solo.");
      // ✅ reintento automático (si hay token + online)
      scheduleRetry("save_failed");
    } finally {
      saving = false;
    }

  }, 650);
}

async function trySyncPending() {
  if (!isOnline()) {
    setSync("offline", "Sin conexión — Guardado local");
    return;
  }

  // Intento silencioso de renovar/obtener token (SIN popup)
  try {
    await ensureOAuthToken(false);
  } catch (e) {
    dbgWarn("trySyncPending: no pudo asegurar token silencioso:", e?.message || e);
  }

  // si sigue sin token válido, no sync
  if (!isTokenValid()) {
    dbgWarn("trySyncPending: sin token válido -> necesita conectar");
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
    return;
  }


  const pending = loadPending();
  if (!pending?.items) {
    await refreshFromRemote(false);
    return;
  }

  setSync("saving", "Sincronizando…");

  try {
    // 1) traer remoto actual (para merge)
    const before = await apiCall("get", {}, { allowInteractive: false });
    if (!before?.ok) throw new Error(before?.error || "get_failed");

    const remoteItems = Array.isArray(before.items) ? before.items : [];
    const remoteUA = Number(before?.meta?.updatedAt || 0);

    // 2) merge remoto + pending (local gana), respetando tombstones
    const merged = mergeRemoteWithLocal(remoteItems, pending.items, tombstones);

    // 3) set con expectedUpdatedAt
    const saved = await apiCall("set", { items: merged, expectedUpdatedAt: remoteUA }, { allowInteractive: false });
    if (!saved?.ok) {
      if (saved?.error === "conflict") {
        // re-merge una vez con lo que devolvió el backend
        const r2Items = Array.isArray(saved?.items) ? saved.items : [];
        const r2UA = Number(saved?.meta?.updatedAt || 0);
        const merged2 = mergeRemoteWithLocal(r2Items, pending.items, tombstones);
        const saved2 = await apiCall("set", { items: merged2, expectedUpdatedAt: r2UA }, { allowInteractive: false });
        if (!saved2?.ok) throw new Error(saved2?.error || "set_failed");
        remoteMeta = { updatedAt: Number(saved2?.meta?.updatedAt || 0) };
        listaItems = dedupNormalize(merged2);
      } else {
        throw new Error(saved?.error || "set_failed");
      }
    } else {
      remoteMeta = { updatedAt: Number(saved?.meta?.updatedAt || 0) };
      listaItems = dedupNormalize(merged);
    }

    saveCache(listaItems, remoteMeta);
    clearPending();
    render();
    setSync("ok", "Sincronizado ✅");
    btnRefresh.style.display = "none";
    toast("Sincronizado ✅", "ok", "Se aplicaron cambios pendientes.");
    } catch (e) {
    dbgErr("trySyncPending ERROR:", e);

    setPending(listaItems);
    setSync("offline", "Sincronización pendiente");
    btnRefresh.style.display = "inline-block";
  }
}

async function refreshFromRemote(showToast = true, opts = { skipEnsureToken: false }) {
  if (!isOnline()) {
    setSync("offline", "Sin conexión — usando cache");
    return;
  }

  // Intento silencioso de renovar/obtener token (SIN popup)
  if (!opts?.skipEnsureToken) {
    try {
      await ensureOAuthToken(false);
    } catch (e) {
      dbgWarn("refreshFromRemote: no pudo asegurar token silencioso:", e?.message || e);
    }
  }

  // si sigue sin token válido, no tocar remoto
  if (!isTokenValid()) {
    dbgWarn("refreshFromRemote: sin token válido -> necesita conectar");
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
    return;
  }

  try {
    const resp = await apiCall("get", {}, { allowInteractive: false });

    if (!resp?.ok) {
      // ✅ Caso CLAVE: ID mal o sin acceso a la planilla
      if (resp?.error === "not_found_or_no_access") {
        setSync("offline", "Sin acceso a planilla / ID incorrecto");
        btnRefresh.style.display = "inline-block";

        if (showToast) {
          toast(
            "No se pudo acceder a la planilla",
            "err",
            "Es un 404: ID incorrecto o esta cuenta no tiene permisos. Usá __openSheet() para abrirla."
          );
        }

        // Log extra útil
        console.error("[SYNC] Sheets GET not_found_or_no_access", {
          spreadsheetId: SPREADSHEET_ID,
          sheetName: SHEET_NAME,
          status: resp.status,
          url: resp.url,
          detail: resp.detail
        });

        return;
      }

      // otros errores
      throw new Error(resp?.error || "get_failed");
    }

    const remoteItems = Array.isArray(resp?.items) ? resp.items : [];
    const meta = resp?.meta || { updatedAt: 0 };

    // aplica tombstones (no re-agrega lo borrado localmente)
    listaItems = mergeRemoteWithLocal(remoteItems, [], tombstones);
    remoteMeta = { updatedAt: Number(meta.updatedAt || 0) };
    saveCache(listaItems, remoteMeta);

    render();
    setSync("ok", "Listo ✅");
    btnRefresh.style.display = "none";
    if (showToast) toast("Lista actualizada", "ok", "Cargada desde Drive.");
  } catch (e) {
    dbgErr("refreshFromRemote ERROR:", e);

    setSync("offline", "No se pudo cargar — usando cache");
    btnRefresh.style.display = "inline-block";

    if (showToast) toast("No se pudo cargar", "warn", "Abrí consola para ver detalle.");
  }
}

// =====================
// Eventos
// =====================
seccionItems.addEventListener("click", (event) => {
    if (event.target.classList.contains("eliminar-item")) {
        const index = parseInt(event.target.getAttribute("data-index"), 10);
        eliminarElemento(index);
    }
});

button1.addEventListener("click", () => {
    const textoItem = input1.value;
    if (normalizarTexto(textoItem) !== "") {
        agregarElemento(textoItem, false);
        input1.value = "";

        // opcional: resetear búsqueda al agregar
        if (typeof buscador !== "undefined") {
            buscador.value = "";
            filtroBusqueda = "";
        }

        input1.focus();
    }
});

input1.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        e.preventDefault();
        button1.click();
    }
});

// Copiar
buttonCopiar.addEventListener("click", () => {
    if (listaItems.length === 0) {
        toast("No hay items para copiar", "warn");
        return;
    }
    const texto = listaItems.map(item => item.texto).join("\n");
    navigator.clipboard.writeText(texto)
        .then(() => toast("Copiado ✅", "ok", "Lista al portapapeles"))
        .catch(() => toast("No se pudo copiar", "err"));
});

// Importar
buttonImportar.addEventListener("click", () => {
    const textoPegado = textareaImportar.value;

    if (textoPegado.trim() === "") {
        toast("Pegá primero una lista 😉", "warn");
        return;
    }

    let candidatos = textoPegado.includes("\n")
        ? textoPegado.split("\n")
        : textoPegado.split(",");

    candidatos = candidatos.map(t => t.trim()).filter(t => t !== "");

    let agregados = 0;
    for (const t of candidatos) {
        const before = listaItems.length;
        agregarElemento(t, false);
        if (listaItems.length > before) agregados++;
    }

    textareaImportar.value = "";
    toast("Importado ✅", "ok", `${agregados} items agregados`);
});

window.addEventListener("online", () => {
    toast("Volvió la conexión", "ok", "Sincronizando…");
    trySyncPending().finally(() => {
      // ✅ si sigue pendiente, programar reintentos
      scheduleRetry("online_event");
    });
});


window.addEventListener("offline", () => {
    setSync("offline", "Sin conexión — Guardado local");
    toast("Sin conexión", "warn", "Podés seguir usando la lista.");
});

// =====================
// UI: Conectar / Refresh
// =====================
function setAccountUI(email) {
  const e = (email || "").toString().trim();

  if (!e) {
    accountPill.style.display = "none";
    accountPill.textContent = "";
    btnConnect.textContent = "Conectar";
    btnConnect.dataset.mode = "connect";
    return;
  }

  accountPill.style.display = "inline-flex";
  accountPill.textContent = e;
  btnConnect.textContent = "Cambiar cuenta";
  btnConnect.dataset.mode = "switch";
}

// =====================
// Conectar (único flujo, con lock)
// =====================
async function runConnectFlow({ interactive, prompt } = { interactive: false, prompt: "consent" }) {
  // si ya hay un connect corriendo, reusamos el mismo (evita carreras)
  if (connectInFlight) return connectInFlight;

  connectInFlight = (async () => {
    try {
      setSync("saving", interactive ? "Conectando…" : "Reconectando…");

      // 1) token
      try {
        await ensureOAuthToken(!!interactive, prompt || "consent");
      } catch (e) {
        // Si el usuario canceló el popup => NO romper todo, volvemos a estado estable
        if (e?.isCanceled) {
          dbgWarn("Connect cancelado por el usuario:", e.message);
          // dejamos UI acorde al estado real actual
          if (isTokenValid()) {
            setSync("ok", "Listo ✅");
          } else {
            setSync("offline", "Necesita Conectar");
            btnRefresh.style.display = "inline-block";
          }
          return { ok: false, canceled: true };
        }
        throw e;
      }

      // 2) whoami (valida backend)
      const who = await verifyBackendAccessOrThrow(!!interactive);
      const email = (who?.email || "").toString();
      if (email) saveStoredOAuthEmail(email);
      setAccountUI(email);

      // 3) refrescar datos
      btnRefresh.style.display = "none";
      await refreshFromRemote(true, { skipEnsureToken: true });

      // 4) si hay pending, que reintente
      scheduleRetry("runConnectFlow");

      return { ok: true };
    } catch (e) {
  dbgErr("runConnectFlow ERROR:", e);

  const msg = String(e?.message || e || "");

  // ✅ mensaje uniforme
  if (msg === "TOKEN_NEEDS_INTERACTIVE") {
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
    return { ok: false, needsInteractive: true };
  }

  setSync("offline", "Necesita Conectar");
  btnRefresh.style.display = "inline-block";
  return { ok: false, error: msg };
}
 finally {
      // liberamos lock
      connectInFlight = null;
    }
  })();

  return connectInFlight;
}


async function reconnectAndRefresh() {
  // reconexión NO interactiva (sin popup)
  return await runConnectFlow({ interactive: false, prompt: "" });
}

btnConnect.addEventListener("click", async () => {
  // si ya hay conexión corriendo, no duplicar
  if (isConnectBusy()) {
    dbgWarn("btnConnect: connectInFlight activo, ignorando click");
    return;
  }

  // Si estaba en modo switch, primero limpiamos storage y pedimos select_account
  if (btnConnect.dataset.mode === "switch") {
    // backup por si el usuario cancela el selector
    const prevStored = loadStoredOAuth();
    const prevEmail = loadStoredOAuthEmail();
    const prevRuntimeToken = oauthAccessToken;
    const prevRuntimeExp = oauthExpiresAt;

    // limpiamos para forzar selector de cuenta
    clearStoredOAuth();
    clearStoredOAuthEmail();
    oauthAccessToken = "";
    oauthExpiresAt = 0;

    const res = await runConnectFlow({ interactive: true, prompt: "select_account" });

    // si canceló => restaurar sesión anterior
    if (res?.canceled) {
      if (prevStored?.access_token && prevStored?.expires_at) {
        saveStoredOAuth(prevStored.access_token, prevStored.expires_at);
      }
      if (prevEmail) saveStoredOAuthEmail(prevEmail);
      oauthAccessToken = prevRuntimeToken || "";
      oauthExpiresAt = prevRuntimeExp || 0;
      setAccountUI(prevEmail || "");
      if (isTokenValid()) setSync("ok", "Listo ✅");
      else {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
      }
      return;
    }

    if (!res?.ok) toast("No se pudo cambiar cuenta", "err", "Intentá de nuevo.");
    return;
  }


  // Modo connect normal
  const res = await runConnectFlow({ interactive: true, prompt: "consent" });

  // si canceló, listo
  if (res?.canceled) return;

  if (!res?.ok) {
    toast("No se pudo conectar", "err", "Revisá permisos / usuario autorizado.");
  }
});

btnRefresh.addEventListener("click", async () => {
  await reconnectAndRefresh();
});

// auto-refresh token (evita popups)
setInterval(async () => {
  try {
    if (document.visibilityState !== "visible") return;
    if (isConnectBusy()) return;
    if (!oauthAccessToken) return;

    // si falta poco para expirar, intento silencioso
    if (Date.now() < (oauthExpiresAt - 120_000)) return;
    await ensureOAuthToken(false);

    // si se renovó bien y estábamos “Necesita Conectar”, refrescamos sin popup
    if (isTokenValid() && syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) {
      await reconnectAndRefresh();
    }
  } catch {}
}, 20_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (isConnectBusy()) return;

  if (syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) {
    reconnectAndRefresh();
  }
});

// =====================
// INIT
// =====================
window.addEventListener("load", async () => {
    input1.focus();

        // OAuth init + cargar token guardado
    try {
      initOAuth();

      const stored = loadStoredOAuth();
      if (stored?.access_token && Date.now() < (stored.expires_at - 10_000)) {
        oauthAccessToken = stored.access_token;
        oauthExpiresAt = stored.expires_at;

        // set UI con email si existe
        const emailHint = loadStoredOAuthEmail();
        setAccountUI(emailHint);
      } else {
        setAccountUI(loadStoredOAuthEmail());
      }
    } catch {
      // si GIS no cargó, lo vas a ver al tocar Conectar
    }

    // 1) cache instantáneo
    const cached = loadCache();
    if (cached?.items) {
        listaItems = dedupNormalize(cached.items);
        remoteMeta = cached.meta?.updatedAt ? { updatedAt: cached.meta.updatedAt } : { updatedAt: 0 };
        render();
        rebuildSectionDatalists();
        setSync(isOnline() ? "saving" : "offline", isOnline() ? "Cargando… (cache)" : "Sin conexión — usando cache");
    } else {
        setSync(isOnline() ? "saving" : "offline", isOnline() ? "Cargando…" : "Sin conexión");
    }

    // 2) pending
    const pending = loadPending();
    if (pending?.items) {
        listaItems = dedupNormalize(pending.items);
        render();
        rebuildSectionDatalists();
        if (!isOnline()) {
            setSync("offline", "Sin conexión — Cambios pendientes");
        } else {
            await trySyncPending();
            // ✅ si quedó pending, reintentar solo
            scheduleRetry("load_pending");
        }
        return;
    }


    // 3) Auto-sync al cargar (SIN popup)
    // - Si hay token/email guardado, intentamos reconectar silencioso
    // - Si no se puede, queda "Necesita Conectar"
    if (isOnline()) {
      const emailHint = loadStoredOAuthEmail();
      const stored = loadStoredOAuth();

      dbg("INIT: online. emailHint=", emailHint, "hasStoredToken=", !!stored?.access_token);

      if (emailHint || (stored?.access_token && stored?.expires_at)) {
        await reconnectAndRefresh(); // usa ensureOAuthToken(false) -> no popup
      } else {
        setSync("offline", "Necesita Conectar");
        btnRefresh.style.display = "inline-block";
      }
    } else {
      setSync("offline", "Sin conexión");
      btnRefresh.style.display = "none";
    }

    // ✅ Asegura que el datalist tenga opciones aunque la lista esté vacía al inicio
    rebuildSectionDatalists();

});
