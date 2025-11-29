// main.js
// Zentrales „Orchester“: State, Event-Handler, Render-Flow

import {
  uid,
  sanitizeName,
  walkTree,
  updateNode,
  insertNode,
  removeNode,
  findById,
} from "./model.js";
import {
  STORAGE_KEY,
  loadTreeLocalOnly,
  saveTree,
} from "./storage.js";
import { initAuth } from "./auth.js";
import { appAlert, appConfirm, appPrompt } from "./ui-modal.js";
import { initTheme, initThemeToggle } from "./ui-theme.js";
import {
  renderTreeSection,
  renderBreadcrumbs,
  renderDetails,
} from "./ui-tree.js";
import {
  initUploads,
  renderUploadsForFileNode,
  renderGlobalUploads,
  getSelectedUploadId,
  setSelectedUploadId,
  getSessionUploads,
} from "./uploads.js";

// --- DOM-Elemente -------------------------------------------------

const searchInput = document.getElementById("searchInput");
const searchGoBtn = document.getElementById("searchGoBtn");
const searchResetBtn = document.getElementById("searchResetBtn");

const addRootFolderBtn = document.getElementById("addRootFolderBtn");
const resetDemoBtn = document.getElementById("resetDemoBtn");

const collapseAllBtn = document.getElementById("collapseAllBtn");
const expandAllBtn = document.getElementById("expandAllBtn");

const renameBtn = document.getElementById("renameBtn");
const deleteBtn = document.getElementById("deleteBtn");

const noteInput = document.getElementById("noteInput");
const folderActions = document.getElementById("folderActions");
const fileActions = document.getElementById("fileActions");
const addSubfolderBtn = document.getElementById("addSubfolderBtn");
const addFileBtn = document.getElementById("addFileBtn");

// --- App-State ----------------------------------------------------

let tree = loadTreeLocalOnly();   // wird nach Login ggf. aus Supabase ersetzt
let selectedId = tree.id;
let searchQuery = "";

// User-ID für Uploads (wird über Auth befüllt)
let currentUserId = null;

// THEME_KEY hier nochmal, damit Reset funktioniert
const THEME_KEY = "doc-organizer-theme";

// --- Icon-Picker --------------------------------------------------

const ICON_CHOICES = [
  "📄", "🗂️", "📁", "🗃️", "🗄️", "🗳️", "📝", "📑", "📋", "🔖",
  "🔍", "📥", "📤", "🧾", "📇", "📦", "✉️", "📬", "📮",
  "🏠", "🏡", "🏘️", "🔑", "🧱", "🏚️", "🏗️", "📜", "🔧", "🪛", "🛠️",
  "🚗", "🚙", "🏎️", "🛻", "🚌", "🚐", "🛵", "🏍️", "🚲", "🅿️", "🛣️",
  "⚡", "🔥", "💧", "📡", "☎️", "📞", "🌐", "💻",
  "🛡️", "🏥", "🧳", "❤️‍🩹",
  "💰", "💳", "🏦", "📈", "📉", "💵", "💶", "💷", "🧮", "🧾",
  "👤", "🪪", "🛂", "🎓", "🩺", "💊", "🩹", "🐾",
  "💼", "📅", "📂", "💬", "🤝", "📊",
  "🎉", "🎫", "✈️", "🚉", "🧳", "🎁", "🎀", "🛒", "🛍️",
];

let iconPickerEl = null;
let currentIconTargetNodeId = null;

function ensureIconPicker() {
  if (iconPickerEl) return;
  iconPickerEl = document.createElement("div");
  iconPickerEl.className = "icon-picker";
  iconPickerEl.style.display = "none";

  const grid = document.createElement("div");
  grid.className = "icon-picker-grid";

  ICON_CHOICES.forEach((icn) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "icon-picker-option";
    btn.textContent = icn;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentIconTargetNodeId) return;
      tree = updateNode(tree, currentIconTargetNodeId, (n) => {
        n.icon = icn;
      });
      saveTree(tree);
      hideIconPicker();
      renderAll();
    });
    grid.appendChild(btn);
  });

  iconPickerEl.appendChild(grid);
  document.body.appendChild(iconPickerEl);
}

function showIconPicker(nodeId, anchorRect) {
  ensureIconPicker();
  currentIconTargetNodeId = nodeId;

  const top = anchorRect.bottom + window.scrollY + 4;
  const left = anchorRect.left + window.scrollX;

  iconPickerEl.style.top = `${top}px`;
  iconPickerEl.style.left = `${left}px`;
  iconPickerEl.style.display = "block";
}

function hideIconPicker() {
  if (!iconPickerEl) return;
  iconPickerEl.style.display = "none";
  currentIconTargetNodeId = null;
}

document.addEventListener("click", (e) => {
  if (!iconPickerEl || iconPickerEl.style.display === "none") return;
  if (e.target.closest(".icon-picker")) return;
  if (e.target.classList && e.target.classList.contains("node-icon")) return;
  hideIconPicker();
});

// --- Render-Controller --------------------------------------------

function handleSelectNode(id) {
  selectedId = id;
  setSelectedUploadId(null);
  renderAll();
}

function handleToggleFolder(id) {
  tree = updateNode(tree, id, (n) => {
    n.expanded = !(n.expanded !== false);
  });
  saveTree(tree);
  renderAll();
}

function handleIconPicker(nodeId, rect) {
  showIconPicker(nodeId, rect);
}

function renderAll() {
  // Fallback: wenn gewählte ID nicht mehr existiert, auf Root
  if (!findById(tree, selectedId)) {
    selectedId = tree.id;
  }

  renderTreeSection(
    tree,
    selectedId,
    searchQuery,
    handleSelectNode,
    handleToggleFolder,
    handleIconPicker
  );

  renderBreadcrumbs(tree, selectedId, handleSelectNode);
  renderDetails(tree, selectedId, noteInput);

  const found = findById(tree, selectedId);
  const selected = found ? found.node : tree;

  if (selected.type === "folder") {
    folderActions.classList.remove("hidden");
    fileActions.classList.add("hidden");
  } else {
    folderActions.classList.add("hidden");
    fileActions.classList.remove("hidden");
    renderUploadsForFileNode(selected);
  }

  renderGlobalUploads();
}

// --- Event-Handler ------------------------------------------------

// Suche
if (searchInput) {
  searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTreeSection(
      tree,
      selectedId,
      searchQuery,
      handleSelectNode,
      handleToggleFolder,
      handleIconPicker
    );
  });
}

if (searchGoBtn) {
  searchGoBtn.addEventListener("click", () => {
    searchQuery = searchInput.value;
    renderAll();
    const treeContainer = document.getElementById("treeContainer");
    const firstMark = treeContainer.querySelector("mark");
    if (firstMark) {
      firstMark.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

if (searchResetBtn) {
  searchResetBtn.addEventListener("click", () => {
    searchQuery = "";
    searchInput.value = "";
    renderTreeSection(
      tree,
      selectedId,
      searchQuery,
      handleSelectNode,
      handleToggleFolder,
      handleIconPicker
    );
  });
}

// Top-Ordner hinzufügen
if (addRootFolderBtn) {
  addRootFolderBtn.addEventListener("click", async () => {
    const raw = await appPrompt(
      "Neuer Top-Ordner",
      "Name des neuen Top-Ordners:",
      ""
    );
    const name = sanitizeName(raw);
    if (!name) return;
    const newNode = {
      id: uid(),
      type: "folder",
      name,
      icon: "📁",
      expanded: true,
      note: null,
      children: [],
    };
    tree = insertNode(tree, tree.id, newNode);
    saveTree(tree);
    renderAll();
  });
}

// Demo zurücksetzen
if (resetDemoBtn) {
  resetDemoBtn.addEventListener("click", async () => {
    const ok = await appConfirm(
      "Demo zurücksetzen",
      "Demo zurücksetzen? Alle aktuellen Daten in diesem Browser gehen verloren."
    );
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(THEME_KEY);

    const sessionUploads = getSessionUploads();
    for (const key in sessionUploads) {
      delete sessionUploads[key];
    }

    tree = loadTreeLocalOnly();
    selectedId = tree.id;
    searchQuery = "";
    setSelectedUploadId(null);
    if (searchInput) searchInput.value = "";
    saveTree(tree);
    renderAll();
    initTheme();
  });
}

// Umbenennen
if (renameBtn) {
  renameBtn.addEventListener("click", async () => {
    const found = findById(tree, selectedId);
    if (!found) return;
    const currentName = found.node.name;
    const raw = await appPrompt("Umbenennen", "Neuer Name:", currentName);
    const newName = sanitizeName(raw);
    if (!newName) return;
    tree = updateNode(tree, selectedId, (n) => {
      n.name = newName;
    });
    saveTree(tree);
    renderAll();
  });
}

// Löschen
if (deleteBtn) {
  deleteBtn.addEventListener("click", async () => {
    if (selectedId === tree.id) return;
    const found = findById(tree, selectedId);
    if (!found) return;
    const label = found.node.type === "folder" ? "diesen Ordner" : "diese Datei";

    const ok = await appConfirm(
      "Löschen bestätigen",
      `Möchten Sie ${label} wirklich löschen? Dieser Vorgang kann nicht rückgängig gemacht werden.`
    );
    if (!ok) return;

    if (found.node.type === "file") {
      const sessionUploads = getSessionUploads();
      if (sessionUploads[found.node.id]) {
        delete sessionUploads[found.node.id];
      }
    }

    tree = removeNode(tree, selectedId);
    selectedId = tree.id;
    setSelectedUploadId(null);
    saveTree(tree);
    renderAll();
  });
}

// Notiz-Änderungen
if (noteInput) {
  noteInput.addEventListener("input", (e) => {
    const value = e.target.value;
    tree = updateNode(tree, selectedId, (n) => {
      n.note = value;
    });
    saveTree(tree);
  });
}

// Unterordner hinzufügen
if (addSubfolderBtn) {
  addSubfolderBtn.addEventListener("click", async () => {
    const found = findById(tree, selectedId);
    if (!found || found.node.type !== "folder") return;
    const raw = await appPrompt("Neuer Ordner", "Name des neuen Ordners:", "");
    const name = sanitizeName(raw);
    if (!name) return;
    const newNode = {
      id: uid(),
      type: "folder",
      name,
      icon: "📁",
      expanded: true,
      note: null,
      children: [],
    };
    tree = insertNode(tree, selectedId, newNode);
    saveTree(tree);
    renderAll();
  });
}

// Datei (Referenz) hinzufügen
if (addFileBtn) {
  addFileBtn.addEventListener("click", async () => {
    const found = findById(tree, selectedId);
    if (!found || found.node.type !== "folder") return;
    const raw = await appPrompt(
      "Neue Datei (Referenz)",
      "Name der neuen Datei (nur Referenz):",
      ""
    );
    const name = sanitizeName(raw);
    if (!name) return;
    const newNode = {
      id: uid(),
      type: "file",
      name,
      icon: "📄",
      note: null,
    };
    tree = insertNode(tree, selectedId, newNode);
    saveTree(tree);
    renderAll();
  });
}

// Alle einklappen / ausklappen
if (collapseAllBtn) {
  collapseAllBtn.addEventListener("click", () => {
    walkTree(tree, (n) => {
      if (n.type === "folder") n.expanded = false;
    });
    tree.expanded = true;
    saveTree(tree);
    renderAll();
  });
}

if (expandAllBtn) {
  expandAllBtn.addEventListener("click", () => {
    walkTree(tree, (n) => {
      if (n.type === "folder") n.expanded = true;
    });
    saveTree(tree);
    renderAll();
  });
}

// --- Init ---------------------------------------------------------

// Theme immer initialisieren (auch auf Login-Seite)
initTheme();
initThemeToggle();

// Uploads initialisieren – User-ID kommt aus Auth (currentUserId)
initUploads({
  getUserId: () => currentUserId,
  getTreeFn: () => tree,
  getSelectedIdFn: () => selectedId,
  onRenderAll: () => renderAll(),
});

// Auth initialisieren (Login / Session prüfen)
initAuth({
  onTreeLoaded: (loadedTree) => {
    // Wird von auth.js nach Login / Session-Erkennung aufgerufen
    tree = loadedTree || loadTreeLocalOnly();
    selectedId = tree.id;
    searchQuery = "";
    setSelectedUploadId(null);
  },
  onRenderApp: async () => {
    // App wird sichtbar – hier User-ID holen und dann rendern
    try {
      const supabaseClient = window.supabaseClient;
      if (supabaseClient) {
        const { data } = await supabaseClient.auth.getUser();
        if (data && data.user) {
          currentUserId = data.user.id;
        }
      }
    } catch (e) {
      console.error("Konnte User-ID nicht holen:", e);
    }
    renderAll();
  },
});

// Optional: einmal rendern für den Fall, dass später offline-Modus gewünscht ist.
// Aktuell sieht der Nutzer die App aber erst nach Login.
