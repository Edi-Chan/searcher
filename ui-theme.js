// ui-theme.js
// Dark/Light-Theme-Verwaltung + Toggle-Button

const THEME_KEY = "doc-organizer-theme";
const themeToggleBtn = document.getElementById("themeToggleBtn");

/**
 * Wendet ein Theme an ("light" oder "dark").
 */
export function applyTheme(theme) {
  if (theme === "light") {
    document.body.classList.add("light-mode");
    if (themeToggleBtn) themeToggleBtn.textContent = "🌙 Dark";
  } else {
    document.body.classList.remove("light-mode");
    if (themeToggleBtn) themeToggleBtn.textContent = "🌞 Hell";
  }
}

/**
 * Initialisiert das Theme (liest aus localStorage, Standard: "dark").
 */
export function initTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    const defaultTheme = "dark";
    const theme = stored || defaultTheme;
    applyTheme(theme);
  } catch (e) {
    applyTheme("dark");
  }
}

/**
 * Registriert den Theme-Toggle-Button (soll nach DOM-Load aufgerufen werden).
 */
export function initThemeToggle() {
  if (!themeToggleBtn) return;

  themeToggleBtn.addEventListener("click", () => {
    const isLight = document.body.classList.contains("light-mode");
    const newTheme = isLight ? "dark" : "light";
    applyTheme(newTheme);
    try {
      localStorage.setItem(THEME_KEY, newTheme);
    } catch (e) {
      // Ignorieren, wenn localStorage nicht verfügbar ist
    }
  });
}
