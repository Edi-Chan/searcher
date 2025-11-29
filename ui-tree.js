// ui-tree.js
// Rendering des Dateibaums, Breadcrumbs & Such-Highlighting

import { findById, getPath, filterTree } from "./model.js";

// DOM-Elemente
const treeContainer = document.getElementById("treeContainer");
const breadcrumbsEl = document.getElementById("breadcrumbs");
const selectedIconEl = document.getElementById("selectedIcon");
const selectedNameEl = document.getElementById("selectedName");
const selectedTypeBadgeEl = document.getElementById("selectedTypeBadge");
const searchResultInfo = document.getElementById("searchResultInfo");
const viewMode = document.getElementById("viewMode");

// Übergangs-States (werden vom Controller gesetzt)
export let tree = null;
export let selectedId = null;
export let searchQuery = "";

// Setter für externen Zugriff
export function setTree(newTree) {
  tree = newTree;
}
export function setSelectedId(id) {
  selectedId = id;
}
export function setSearchQuery(q) {
  searchQuery = q;
}

// -------------------------------------------------------------
// Hilfsfunktionen
// -------------------------------------------------------------

export function highlightText(text) {
  if (!searchQuery || !searchQuery.trim()) {
    return escapeHtml(text);
  }
  const qRaw = searchQuery.trim();
  const q = qRaw.toLowerCase();
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) {
    return escapeHtml(text);
  }
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + qRaw.length));
  const after = escapeHtml(text.slice(idx + qRaw.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -------------------------------------------------------------
// TREE RENDERING
// -------------------------------------------------------------

function renderTreeItem(node, container, depth = 0, isLast = false, onSelect, onToggle, onIconPicker) {
  const item = document.createElement("div");
  item.className = "tree-item" + (node.id === selectedId ? " selected" : "");
  item.dataset.depth = String(depth);
  item.dataset.last = isLast ? "1" : "0";
  item.style.setProperty("--tree-depth", depth);

  const inner = document.createElement("div");
  inner.className = "tree-item-inner";

  const isFolder = node.type === "folder";
  const expanded = node.expanded !== false;

  const expand = document.createElement("span");
  expand.className = "tree-expand";

  if (isFolder) {
    expand.textContent = expanded ? "▼" : "▶";
    expand.addEventListener("click", (e) => {
      e.stopPropagation();
      onToggle(node.id);
    });
  } else {
    expand.textContent = "•";
    expand.classList.add("tree-expand-placeholder");
  }

  const icon = document.createElement("span");
  icon.className = "node-icon";
  const fallback = node.type === "folder" ? "📁" : "📄";
  icon.textContent = node.icon || fallback;
  icon.addEventListener("click", (e) => {
    e.stopPropagation();
    const rect = icon.getBoundingClientRect();
    onIconPicker(node.id, rect);
  });

  const name = document.createElement("span");
  name.className = "tree-name";
  name.innerHTML = highlightText(node.name);

  inner.appendChild(expand);
  inner.appendChild(icon);
  inner.appendChild(name);

  item.appendChild(inner);
  item.addEventListener("click", () => onSelect(node.id));

  container.appendChild(item);

  if (isFolder && expanded && Array.isArray(node.children)) {
    node.children.forEach((child, index) => {
      const last = index === node.children.length - 1;
      renderTreeItem(child, container, depth + 1, last, onSelect, onToggle, onIconPicker);
    });
  }
}

// -------------------------------------------------------------
// Breadcrumbs
// -------------------------------------------------------------

export function renderBreadcrumbs(tree, selectedId, onSelect) {
  const chain = getPath(tree, selectedId);
  breadcrumbsEl.innerHTML = "";
  if (!chain.length) return;

  chain.forEach((node, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.textContent = "›";
      sep.style.opacity = "0.6";
      breadcrumbsEl.appendChild(sep);
    }

    const btn = document.createElement("button");
    btn.textContent = node.name;
    btn.addEventListener("click", () => onSelect(node.id));
    breadcrumbsEl.appendChild(btn);
  });
}

// -------------------------------------------------------------
// Details Panel Schreibrechte
// -------------------------------------------------------------

export function renderDetails(tree, selectedId, noteInput, onNoteChange) {
  const found = findById(tree, selectedId);
  const selected = found ? found.node : tree;

  const fallbackIcon = selected.type === "folder" ? "📁" : "📄";
  selectedIconEl.textContent = selected.icon || fallbackIcon;
  selectedNameEl.textContent = selected.name;
  selectedTypeBadgeEl.textContent =
    selected.type === "folder" ? "Ordner" : "Datei (Referenz)";

  noteInput.value = selected.note || "";
}

// -------------------------------------------------------------
// Haupt-Renderfunktion
// -------------------------------------------------------------

export function renderTreeSection(tree, selectedId, searchQuery, onSelect, onToggle, onIconPicker) {
  treeContainer.innerHTML = "";
  const effectiveTree = searchQuery ? filterTree(tree, searchQuery) : tree;

  viewMode.textContent = searchQuery
    ? "Gefilterte Ansicht (inkl. Dokumentinhalten)"
    : "Vollständige Ansicht";

  renderTreeItem(effectiveTree, treeContainer, 0, true, onSelect, onToggle, onIconPicker);

  updateSearchResultInfo();
}

function updateSearchResultInfo() {
  if (!searchResultInfo) return;

  const q = searchQuery && searchQuery.trim();
  if (!q) {
    searchResultInfo.textContent = "";
    return;
  }

  const count = treeContainer.querySelectorAll(".tree-item").length;

  if (count === 0) {
    searchResultInfo.textContent = "keine Einträge";
  } else if (count === 1) {
    searchResultInfo.textContent = "1 Eintrag";
  } else {
    searchResultInfo.textContent = `${count} Einträge`;
  }
}
