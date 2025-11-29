// auth.js
// Supabase-Authentifizierung + Umschalten zwischen Login-Page (auth.html) und App-Page (index.html)

import {
  configureSupabase,
  setCurrentUser,
  clearCurrentUser,
  loadTreeFromSupabaseOrInitialize,
} from "./storage.js";

// Supabase-Client aus auth.html
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
  authMessageEl.textContent = msg || "";
  authMessageEl.style.color = color;
}

function switchToRegisterMode() {
  isRegisterMode = true;

  authTitleEl.textContent = "🆕 Registrierung";

  authNameLabel.style.display = "block";
  authNameInput.style.display = "block";

  loginBtn.style.display = "none";
  registerBtn.textContent = "Registrierung abschließen";

  passwordHintEl.style.display = "block";
  backToLoginBtn.style.display = "block";

  setAuthMessage("Bitte Name, E-Mail und Passwort eingeben.", "#a5f3fc");
}

function switchToLoginMode() {
  isRegisterMode = false;

  authTitleEl.textContent = "🔐 Anmeldung";

  authNameLabel.style.display = "none";
  authNameInput.style.display = "none";
  authNameInput.value = "";

  loginBtn.style.display = "block";
  registerBtn.textContent = "Registrieren";

  passwordHintEl.style.display = "none";
  backToLoginBtn.style.display = "none";

  passwordStatusEl.style.display = "none";

  authEmailInput.value = "";
  authPasswordInput.value = "";

  setAuthMessage("");
}

function showAuthUI() {
  if (!authContainer) return gotoAuthPage();
  switchToLoginMode();
  authContainer.style.display = "block";
}

function showAppUI() {
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
// Event Listener
// -------------------------------------------------------------

function setupEventListeners() {
  // Registrierung
  registerBtn.addEventListener("click", () => {
    if (!isRegisterMode) switchToRegisterMode();
    else handleRegisterClick();
  });

  // Login
  loginBtn.addEventListener("click", handleLoginClick);

  // Zurück zum Login
  backToLoginBtn.addEventListener("click", switchToLoginMode);

  // Passwort anzeigen
  togglePasswordBtn.addEventListener("click", () => {
    const isPw = authPasswordInput.type === "password";
    authPasswordInput.type = isPw ? "text" : "password";
    togglePasswordBtn.textContent = isPw ? "🙈" : "👁️";
  });

  // LIVE Passwort Check (Variante C)
  authPasswordInput.addEventListener("input", () => {
    const pw = authPasswordInput.value;

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

  // Logout
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogoutClick);
  }
}

// -------------------------------------------------------------
// Registrierung
// -------------------------------------------------------------

async function handleRegisterClick() {
  const name = authNameInput.value.trim();
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

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
  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value;

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
  // Prüfen ob User eingeloggt ist
  const { data } = await supabaseClient.auth.getUser();

  if (data?.user) {
    // Wenn eingeloggt → direkt zur App (index.html)
    window.location.href = "index.html";
    return;
  }

  // Wenn NICHT eingeloggt → Login/Registrierung anzeigen
  showAuthUI();
}
