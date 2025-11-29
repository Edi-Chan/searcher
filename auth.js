// auth.js
// Supabase-Authentifizierung + Umschalten zwischen Login-Page (auth.html) und App-Page (index.html)

import {
  configureSupabase,
  setCurrentUser,
  clearCurrentUser,
  loadTreeFromSupabaseOrInitialize,
} from "./storage.js";

// Supabase-Client aus auth.html / index.html
const supabaseClient = window.supabaseClient || null;
if (supabaseClient) configureSupabase(supabaseClient);

// -------------------------------------------------------------
// DOM Elemente
// -------------------------------------------------------------

const authContainer = document.getElementById("authContainer");

const authTitleEl = document.getElementById("authTitle");
const authNameInput = document.getElementById("authName");
const authNameLabel = document.getElementById("authNameLabel");

const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");

const togglePasswordBtn = document.getElementById("togglePassword");
const passwordStatusEl = document.getElementById("passwordStatus");
const passwordHintEl = document.getElementById("passwordHint");

const authMessageEl = document.getElementById("authMessage");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");

const logoutBtn = document.getElementById("logoutBtn");
const appRoot = document.getElementById("appRoot");

let onTreeLoadedCallback = null;
let onRenderAppCallback = null;

let isRegisterMode = false;

// -------------------------------------------------------------
// Navigation
// -------------------------------------------------------------

function gotoAppPage() {
  window.location.href = "index.html";
}

function gotoAuthPage() {
  window.location.href = "auth.html";
}

export function initAuth({ onTreeLoaded, onRenderApp } = {}) {
  onTreeLoadedCallback = typeof onTreeLoaded === "function" ? onTreeLoaded : null;
  onRenderAppCallback = typeof onRenderApp === "function" ? onRenderApp : null;

  setupEventListeners();
  initAuthOnLoad();
}

// -------------------------------------------------------------
// UI-Helfer
// -------------------------------------------------------------

function setAuthMessage(msg, color = "red") {
  if (!authMessageEl) return;
  authMessageEl.textContent = msg || "";
  authMessageEl.style.color = color;
}

function switchToRegisterMode() {
  isRegisterMode = true;

  if (authTitleEl) authTitleEl.textContent = "🆕 Registrierung";

  if (authNameLabel) authNameLabel.style.display = "block";
  if (authNameInput) authNameInput.style.display = "block";

  if (loginBtn) loginBtn.style.display = "none";
  if (registerBtn) registerBtn.textContent = "Registrierung abschließen";

  if (passwordHintEl) passwordHintEl.style.display = "block";
  if (backToLoginBtn) backToLoginBtn.style.display = "block";

  setAuthMessage("Bitte Name, E-Mail und Passwort eingeben.", "#a5f3fc");
}

function switchToLoginMode() {
  isRegisterMode = false;

  if (authTitleEl) authTitleEl.textContent = "🔐 Anmeldung";

  if (authNameLabel) authNameLabel.style.display = "none";
  if (authNameInput) {
    authNameInput.style.display = "none";
    authNameInput.value = "";
  }

  if (loginBtn) loginBtn.style.display = "block";
  if (registerBtn) registerBtn.textContent = "Registrieren";

  if (passwordHintEl) passwordHintEl.style.display = "none";
  if (backToLoginBtn) backToLoginBtn.style.display = "none";

  if (passwordStatusEl) passwordStatusEl.style.display = "none";

  if (authEmailInput) authEmailInput.value = "";
  if (authPasswordInput) authPasswordInput.value = "";

  setAuthMessage("");
}

function showAuthUI() {
  // Wenn wir auf index.html sind (kein authContainer) → auf auth.html umleiten
  if (!authContainer) return gotoAuthPage();
  switchToLoginMode();
  authContainer.style.display = "block";
}

function showAppUI() {
  // Wenn wir auf auth.html sind (kein appRoot) → auf index.html umleiten
  if (!appRoot) return gotoAppPage();

  appRoot.style.display = "block";
  if (logoutBtn) logoutBtn.style.display = "inline-block";

  if (onRenderAppCallback) onRenderAppCallback();
}

// -------------------------------------------------------------
// Passwort-Stärke
// -------------------------------------------------------------

function isStrongPassword(pw) {
  if (!pw || pw.length < 8) return false;

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  const hasSpecial = /[^A-Za-z0-9]/.test(pw);

  return hasLower && hasUpper && hasDigit && hasSpecial;
}

// -------------------------------------------------------------
// Event Listener (safe auf beiden Seiten)
// -------------------------------------------------------------

function setupEventListeners() {
  // Registrierung
  if (registerBtn) {
    registerBtn.addEventListener("click", () => {
      if (!isRegisterMode) switchToRegisterMode();
      else handleRegisterClick();
    });
  }

  // Login
  if (loginBtn) {
    loginBtn.addEventListener("click", handleLoginClick);
  }

  // Zurück zum Login
  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", switchToLoginMode);
  }

  // Passwort anzeigen
  if (togglePasswordBtn && authPasswordInput) {
    togglePasswordBtn.addEventListener("click", () => {
      const isPw = authPasswordInput.type === "password";
      authPasswordInput.type = isPw ? "text" : "password";
      togglePasswordBtn.textContent = isPw ? "🙈" : "👁️";
    });
  }

  // LIVE Passwort Check
  if (authPasswordInput && passwordStatusEl) {
  authPasswordInput.addEventListener("input", () => {
    const pw = authPasswordInput.value;

    // Nur im REGISTRIERMODUS prüfen!
    if (!isRegisterMode) {
      passwordStatusEl.style.display = "none";
      return;
    }

    if (!pw.length) {
      passwordStatusEl.style.display = "none";
      return;
    }

    passwordStatusEl.style.display = "block";

    if (isStrongPassword(pw)) {
      passwordStatusEl.textContent = "✔ Passwort erfüllt alle Bedingungen";
      passwordStatusEl.classList.add("valid");
    } else {
      passwordStatusEl.textContent = "❌ Passwort erfüllt noch nicht alle Bedingungen";
      passwordStatusEl.classList.remove("valid");
    }
  });
}


  // Logout (nur auf index.html vorhanden)
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogoutClick);
  }
}

// -------------------------------------------------------------
// Registrierung
// -------------------------------------------------------------

async function handleRegisterClick() {
  const name = authNameInput ? authNameInput.value.trim() : "";
  const email = authEmailInput ? authEmailInput.value.trim() : "";
  const password = authPasswordInput ? authPasswordInput.value : "";

  if (!name || !email || !password) {
    return setAuthMessage("Bitte alle Felder ausfüllen.");
  }

  if (!isStrongPassword(password)) {
    return setAuthMessage(
      "Passwort muss alle Anforderungen erfüllen."
    );
  }

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (error.code === "user_already_exists" || msg.includes("already")) {
        return setAuthMessage("Diese E-Mail-Adresse ist bereits vergeben.");
      }
      return setAuthMessage(error.message);
    }

    if (data?.user?.identities?.length === 0) {
      return setAuthMessage("Diese E-Mail-Adresse ist bereits vergeben.");
    }

    if (data.session) {
      setCurrentUser(data.user.id);
      const tree = await loadTreeFromSupabaseOrInitialize();
      if (onTreeLoadedCallback) onTreeLoadedCallback(tree);
      setAuthMessage("Registrierung erfolgreich. Weiterleitung...", "green");
      return gotoAppPage();
    }

    setAuthMessage("Registrierung erfolgreich. Bitte E-Mail bestätigen.", "green");
  } catch (e) {
    setAuthMessage("Fehler bei der Registrierung.");
  }
}

// -------------------------------------------------------------
// Login
// -------------------------------------------------------------

async function handleLoginClick() {
  const email = authEmailInput ? authEmailInput.value.trim() : "";
  const password = authPasswordInput ? authPasswordInput.value : "";

  if (!email || !password) {
    return setAuthMessage("Bitte E-Mail und Passwort eingeben.");
  }

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) return setAuthMessage(error.message);

    if (data.session) {
      setCurrentUser(data.user.id);
      const tree = await loadTreeFromSupabaseOrInitialize();
      if (onTreeLoadedCallback) onTreeLoadedCallback(tree);
      setAuthMessage("Login erfolgreich. Weiterleitung...", "green");
      return gotoAppPage();
    }

    setAuthMessage("Login fehlgeschlagen.");
  } catch (e) {
    setAuthMessage("Login Fehler.");
  }
}

// -------------------------------------------------------------
// Logout
// -------------------------------------------------------------

async function handleLogoutClick() {
  try {
    await supabaseClient.auth.signOut();
  } catch {}
  clearCurrentUser();
  showAuthUI();
}

// -------------------------------------------------------------
// Auth prüfen beim Laden
// -------------------------------------------------------------

async function initAuthOnLoad() {
  if (!supabaseClient) {
    showAuthUI();
    return;
  }

  const { data } = await supabaseClient.auth.getUser();

  if (data?.user) {
    setCurrentUser(data.user.id);
    const tree = await loadTreeFromSupabaseOrInitialize();
    if (onTreeLoadedCallback) onTreeLoadedCallback(tree);
    return showAppUI();
  }

  showAuthUI();
}
