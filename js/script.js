// =====================
// CONFIG API (Apps Script Web App)
// =====================
const API_BASE = "https://script.google.com/macros/s/AKfycby7g9yrzm8_2j0HA0P2vLHfXP-rA8dgexHccj8a7e5FEnT1jNJhxi0jKDeb8D5vX3nB5g/exec"; // termina en /exec

// =====================
// CONFIG OAUTH (GIS)
// =====================
// IMPORTANTE: este Client ID es del proyecto NUEVO de "Lista Compras"
const OAUTH_CLIENT_ID = "125380828558-eitpoc7fjjrqa1rseaghpkf0sdfn8mve.apps.googleusercontent.com";

// scopes: openid/email/profile + userinfo + drive.metadata.readonly (requerido por backend)
const OAUTH_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/drive.metadata.readonly"
].join(" ");

// LocalStorage OAuth
const LS_OAUTH = "lista_oauth_token_v1";        // {access_token, expires_at}
const LS_OAUTH_EMAIL = "lista_oauth_email_v1";  // email para hint
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
seccionLista.appendChild(input1);

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
let remoteMeta = { updatedAt: 0 };

// =====================
// OAuth state
// =====================
let tokenClient = null;
let oauthAccessToken = "";
let oauthExpiresAt = 0;

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

    // base remoto
    for (const it of (remoteItems || [])) {
        const texto = normalizarTexto(it?.texto);
        if (!texto) continue;
        const k = keyFromTexto(texto);
        if (tombstoneSet.has(k)) continue;
        byKey.set(k, { texto, completado: !!it?.completado });
    }

    // overlay local (gana local)
    for (const it of (localItems || [])) {
        const texto = normalizarTexto(it?.texto);
        if (!texto) continue;
        const k = keyFromTexto(texto);
        if (tombstoneSet.has(k)) continue;
        byKey.set(k, { texto, completado: !!it?.completado });
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
    return arr.sort((a, b) => {
        if (a.completado === b.completado) {
            return a.texto.toLowerCase().localeCompare(b.texto.toLowerCase());
        }
        // completados arriba
        return (b.completado === true) - (a.completado === true);
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
        out.push({ texto, completado: !!it?.completado });
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
    try { return (localStorage.getItem(LS_OAUTH_EMAIL) || "").toString() || ""; } catch { return ""; }
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
function requestAccessToken({ prompt, hint }) {
    return new Promise((resolve, reject) => {
        if (!tokenClient) return reject(new Error("OAuth no inicializado"));

        tokenClient.callback = (resp) => {
            if (!resp || resp.error) return reject(new Error(resp?.error || "oauth_error"));
            const accessToken = resp.access_token;
            const expiresIn = Number(resp.expires_in || 3600);
            const expiresAt = Date.now() + (expiresIn * 1000);

            oauthAccessToken = accessToken;
            oauthExpiresAt = expiresAt;
            saveStoredOAuth(accessToken, expiresAt);

            resolve({ access_token: accessToken, expires_at: expiresAt });
        };

        const req = { prompt: prompt ?? "" };
        if (hint) req.hint = hint;

        try {
            tokenClient.requestAccessToken(req);
        } catch (e) {
            reject(e);
        }
    });
}

// allowInteractive=false => NO popup
async function ensureOAuthToken(allowInteractive, interactivePrompt = "consent") {
    if (isTokenValid()) return oauthAccessToken;

    // 1) intentar token guardado
    const stored = loadStoredOAuth();
    if (stored?.access_token && Date.now() < (stored.expires_at - 10_000)) {
        oauthAccessToken = stored.access_token;
        oauthExpiresAt = stored.expires_at;
        return oauthAccessToken;
    }

    // 2) si no es interactivo y no tengo hint => NO llamar GIS
    const hintEmail = loadStoredOAuthEmail();
    if (!allowInteractive && !hintEmail) {
        throw new Error("auth_required");
    }

    // 3) silent real
    try {
        await requestAccessToken({ prompt: "", hint: hintEmail || undefined });
        return oauthAccessToken;
    } catch {
        if (!allowInteractive) throw new Error("auth_required");
    }

    // 4) interactivo
    await requestAccessToken({ prompt: interactivePrompt, hint: hintEmail || undefined });
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
// API client (POST JSON + token en body)
// =====================
async function apiCall(mode, payload = {}, opts = {}) {
    const allowInteractive = !!opts.allowInteractive;

    // asegurar token
    const token = await ensureOAuthToken(allowInteractive, opts.interactivePrompt || "consent");

    const body = {
        mode,
        access_token: token,
        ...payload
    };

    let r;
    try {
        r = await fetch(API_BASE, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error("FETCH FAILED (CORS?):", e);
        throw e;
    }


    const data = await r.json().catch(() => ({}));

    // retry ante auth
    if (data?.ok === false && (data?.error === "auth_required" || data?.error === "wrong_audience" || data?.error === "missing_scope")) {
        // intento refresh silent una vez
        try {
            await ensureOAuthToken(false);
            const r2 = await fetch(API_BASE, {
                method: "POST",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ mode, access_token: oauthAccessToken, ...payload })
            });
            return await r2.json().catch(() => ({}));
        } catch {
            // si se permite popup, reintento interactivo
            if (allowInteractive) {
                await ensureOAuthToken(true, "consent");
                const r3 = await fetch(API_BASE, {
                    method: "POST",
                    headers: { "Content-Type": "text/plain;charset=utf-8" },
                    body: JSON.stringify({ mode, access_token: oauthAccessToken, ...payload })
                });
                return await r3.json().catch(() => ({}));
            }
        }
    }

    return data;
}

async function verifyBackendAccessOrThrow(allowInteractive) {
    const data = await apiCall("whoami", {}, { allowInteractive });
    if (!data?.ok) throw new Error(data?.error || "no_access");
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

    listaFiltrada.forEach((item) => {
        const index = listaItems.indexOf(item); // para que el botón eliminar use el índice real

        const itemContainer = document.createElement("div");
        itemContainer.classList.add("item-container");

        const tick = document.createElement("input");
        tick.type = "checkbox";
        tick.checked = !!item.completado;

        tick.addEventListener("change", () => {
            item.completado = tick.checked;
            listaItems = dedupNormalize(listaItems);
            localVersion++;                 // 👈 nuevo
            render();
            scheduleSave("Cambio de estado");
        });


        const listItem = document.createElement("p");
        listItem.innerText = item.texto;

        const botonEliminarItem = document.createElement("button");
        botonEliminarItem.innerText = "Eliminar";
        botonEliminarItem.classList.add("eliminar-item");
        botonEliminarItem.setAttribute("data-index", index);

        itemContainer.appendChild(tick);
        itemContainer.appendChild(listItem);
        itemContainer.appendChild(botonEliminarItem);

        seccionItems.appendChild(itemContainer);
    });
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

    listaItems.push({ texto: t, completado: !!completado });
    listaItems = dedupNormalize(listaItems);
    localVersion++;                 // 👈 nuevo
    render();
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

function scheduleSave(reason = "") {
  saveCache(listaItems, remoteMeta);

  if (!isOnline()) {
    setSync("offline", "Sin conexión — Guardado local");
    setPending(listaItems);
    if (reason) toast("Guardado local (offline)", "warn", "Se sincroniza cuando vuelva internet.");
    return;
  }

  // si no hay token válido, no sync remoto (queda en pending)
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

      // Precheck: traer remoto actual
      const before = await apiCall("get", {}, { allowInteractive: false });
      if (!before?.ok) throw new Error(before?.error || "get_failed");

      const remoteItems = Array.isArray(before.items) ? before.items : [];
      const remoteUA = Number(before?.meta?.updatedAt || 0);

      // Merge remoto + local
      const merged = mergeRemoteWithLocal(remoteItems, listaItems, tombstones);

      // Seguridad: no guardar vacío por error
      if (merged.length === 0) {
        setPending(listaItems);
        setSync("offline", "No se guardó (lista vacía bloqueada)");
        toast("Bloqueado", "warn", "No se permite guardar una lista vacía por seguridad.");
        return;
      }

      // Set con expectedUpdatedAt (conflictos)
      const saved = await apiCall("set", { items: merged, expectedUpdatedAt: remoteUA }, { allowInteractive: false });

      if (!saved?.ok) {
        if (saved?.error === "conflict") {
          // re-merge una vez
          const r2Items = Array.isArray(saved?.items) ? saved.items : [];
          const r2UA = Number(saved?.meta?.updatedAt || 0);
          const merged2 = mergeRemoteWithLocal(r2Items, listaItems, tombstones);
          const saved2 = await apiCall("set", { items: merged2, expectedUpdatedAt: r2UA }, { allowInteractive: false });
          if (!saved2?.ok) throw new Error(saved2?.error || "set_failed");
          remoteMeta = { updatedAt: Number(saved2?.meta?.updatedAt || 0) };
        } else {
          throw new Error(saved?.error || "set_failed");
        }
      } else {
        remoteMeta = { updatedAt: Number(saved?.meta?.updatedAt || 0) };
      }

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
    } catch {
      setPending(listaItems);
      setSync("offline", "No se pudo guardar — Queda en cola");
      btnRefresh.style.display = "inline-block";
      toast("No se pudo guardar", "err", "Quedó pendiente, se reintenta solo.");
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

  // si no hay token, no sync
  if (!isTokenValid()) {
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
  } catch {
    setPending(listaItems);
    setSync("offline", "Sincronización pendiente");
    btnRefresh.style.display = "inline-block";
  }
}


async function refreshFromRemote(showToast = true) {
  if (!isOnline()) {
    setSync("offline", "Sin conexión — usando cache");
    return;
  }

  // si no hay token válido, no tocar remoto
  if (!isTokenValid()) {
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
    return;
  }

  try {
    const resp = await apiCall("get", {}, { allowInteractive: false });
    if (!resp?.ok) throw new Error(resp?.error || "get_failed");

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
  } catch {
    setSync("offline", "No se pudo cargar — usando cache");
    btnRefresh.style.display = "inline-block";
    if (showToast) toast("No se pudo cargar", "warn", "Mostrando la última versión guardada.");
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
    trySyncPending();
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

async function reconnectAndRefresh() {
  try {
    setSync("saving", "Conectando…");
    await ensureOAuthToken(false);
    const who = await verifyBackendAccessOrThrow(false);
    const email = (who?.email || "").toString();
    if (email) saveStoredOAuthEmail(email);
    setAccountUI(email);
    await refreshFromRemote(true);
  } catch {
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
  }
}

btnConnect.addEventListener("click", async () => {
  try {
    setSync("saving", "Conectando…");

    if (btnConnect.dataset.mode === "switch") {
      await forceSwitchAccount();
    } else {
      await ensureOAuthToken(true, "consent");
    }

    // email para hint UI
    let email = "";
    try {
      email = await fetchUserEmailFromToken(oauthAccessToken);
    } catch {}
    if (email) saveStoredOAuthEmail(email);

    // valida acceso backend (audience + scope)
    const who = await verifyBackendAccessOrThrow(true);
    const finalEmail = (who?.email || email || "").toString();
    if (finalEmail) saveStoredOAuthEmail(finalEmail);

    setAccountUI(finalEmail);
    btnRefresh.style.display = "none";
    await refreshFromRemote(true);
  } catch (e) {
    console.error("CONNECT ERROR:", e);
    setSync("offline", "Necesita Conectar");
    btnRefresh.style.display = "inline-block";
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
    if (!oauthAccessToken) return;
    if (Date.now() < (oauthExpiresAt - 120_000)) return; // faltan más de 2 min
    await ensureOAuthToken(false);
  } catch {}
}, 20_000);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    if (syncPill.querySelector(".sync-text")?.textContent?.includes("Necesita Conectar")) {
      reconnectAndRefresh();
    }
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
        setSync(isOnline() ? "saving" : "offline", isOnline() ? "Cargando… (cache)" : "Sin conexión — usando cache");
    } else {
        setSync(isOnline() ? "saving" : "offline", isOnline() ? "Cargando…" : "Sin conexión");
    }

    // 2) pending
    const pending = loadPending();
    if (pending?.items) {
        listaItems = dedupNormalize(pending.items);
        render();
        if (!isOnline()) {
            setSync("offline", "Sin conexión — Cambios pendientes");
        } else {
            await trySyncPending();
        }
        return;
    }

    // 3) remoto (solo si hay token válido)
    if (isTokenValid()) {
      await refreshFromRemote(false);
      if (!cached?.items) toast("Lista lista ✅", "ok", "Cargada desde Drive");
    } else {
      setSync("offline", isOnline() ? "Necesita Conectar" : "Sin conexión");
      btnRefresh.style.display = isOnline() ? "inline-block" : "none";
      // mantenemos cache/pending y no hacemos popup solo
    }
});
