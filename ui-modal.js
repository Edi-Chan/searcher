// ui-modal.js
// Zentrales Popup-/Modal-System (Alert, Confirm, Prompt)

const modalEl = document.getElementById("appModal");
const modalTitleEl = document.getElementById("appModalTitle");
const modalMessageEl = document.getElementById("appModalMessage");
const modalInputEl = document.getElementById("appModalInput");
const modalCancelBtn = document.getElementById("appModalCancelBtn");
const modalOkBtn = document.getElementById("appModalOkBtn");

let modalResolve = null;
let modalMode = null;
let modalPrevOverflow = "";

/**
 * Interne Basis-Funktion, öffnet das Modal.
 * mode: "alert" | "confirm" | "prompt"
 */
function openModal({ title, message, mode, defaultValue }) {
  return new Promise((resolve) => {
    modalMode = mode;
    modalResolve = resolve;

    if (modalTitleEl) modalTitleEl.textContent = title || "";
    if (modalMessageEl) modalMessageEl.textContent = message || "";

    if (mode === "prompt") {
      modalInputEl.classList.remove("hidden");
      modalInputEl.value = defaultValue || "";
      modalCancelBtn.classList.remove("hidden");
      modalOkBtn.textContent = "OK";
      setTimeout(() => {
        modalInputEl.focus();
        modalInputEl.select();
      }, 0);
    } else if (mode === "confirm") {
      modalInputEl.classList.add("hidden");
      modalCancelBtn.classList.remove("hidden");
      modalOkBtn.textContent = "Ja";
      setTimeout(() => modalOkBtn.focus(), 0);
    } else {
      // alert
      modalInputEl.classList.add("hidden");
      modalCancelBtn.classList.add("hidden");
      modalOkBtn.textContent = "OK";
      setTimeout(() => modalOkBtn.focus(), 0);
    }

    modalPrevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    modalEl.classList.remove("hidden");
  });
}

function closeModal() {
  modalEl.classList.add("hidden");
  document.body.style.overflow = modalPrevOverflow || "";
  modalMode = null;
  modalResolve = null;
}

function handleModalOk() {
  if (!modalResolve) return;
  const mode = modalMode;
  const value = mode === "prompt" ? modalInputEl.value : undefined;
  const resolve = modalResolve;
  closeModal();

  if (mode === "alert") {
    resolve();
  } else if (mode === "confirm") {
    resolve(true);
  } else if (mode === "prompt") {
    resolve(value);
  }
}

function handleModalCancel() {
  if (!modalResolve) return;
  const mode = modalMode;
  const resolve = modalResolve;
  closeModal();

  if (mode === "alert") {
    resolve();
  } else if (mode === "confirm") {
    resolve(false);
  } else if (mode === "prompt") {
    resolve(null);
  }
}

// Event-Listener nur einmal registrieren
if (modalOkBtn) {
  modalOkBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleModalOk();
  });
}
if (modalCancelBtn) {
  modalCancelBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleModalCancel();
  });
}
if (modalEl) {
  modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) {
      handleModalCancel();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (!modalMode) return;
  if (e.key === "Escape") {
    e.preventDefault();
    handleModalCancel();
  } else if (e.key === "Enter") {
    if (modalMode === "prompt" || modalMode === "confirm" || modalMode === "alert") {
      e.preventDefault();
      handleModalOk();
    }
  }
});

// -------------------------------------------------------------
// Öffentliche Helper-Funktionen
// -------------------------------------------------------------

/**
 * Einfaches Hinweis-Fenster (OK).
 */
export function appAlert(title, message) {
  return openModal({ title, message, mode: "alert" });
}

/**
 * Ja/Nein-Bestätigung.
 * Resolvt mit true/false.
 */
export function appConfirm(title, message) {
  return openModal({ title, message, mode: "confirm" });
}

/**
 * Texteingabe-Popup.
 * Resolvt mit string oder null (bei Abbrechen).
 */
export function appPrompt(title, message, defaultValue) {
  return openModal({ title, message, mode: "prompt", defaultValue });
}
