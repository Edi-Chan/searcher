// uploads.js
// Upload-Verwaltung, Dateityp-Erkennung & Vorschau

import { findById, getPath } from "./model.js";
import { highlightText } from "./ui-tree.js";
import { appAlert } from "./ui-modal.js";

const uploadBtn = document.getElementById("uploadBtn");
const uploadInput = document.getElementById("uploadInput");
const uploadList = document.getElementById("uploadList");
const globalUploadList = document.getElementById("globalUploadList");

// Supabase
const supabaseClient = window.supabaseClient || null;

// Abhängigkeiten (werden von außen gesetzt)
let getCurrentUserId = () => null;
let getTree = () => null;
let getSelectedId = () => null;
let rerenderAll = () => {};

// Session-Uploads (nicht persistent)
const sessionUploads = {};
let selectedUploadId = null;
const uploadSortState = {}; // key: fileNodeId, value: Sortiermodus

// -------------------------------------------------------------
// Init von außen
// -------------------------------------------------------------

export function initUploads({ getUserId, getTreeFn, getSelectedIdFn, onRenderAll } = {}) {
  if (typeof getUserId === "function") getCurrentUserId = getUserId;
  if (typeof getTreeFn === "function") getTree = getTreeFn;
  if (typeof getSelectedIdFn === "function") getSelectedId = getSelectedIdFn;
  if (typeof onRenderAll === "function") rerenderAll = onRenderAll;

  initDomEvents();
}

// Zugriff von außen (z.B. für Reset)
export function getSessionUploads() {
  return sessionUploads;
}

export function getSelectedUploadId() {
  return selectedUploadId;
}

export function setSelectedUploadId(id) {
  selectedUploadId = id;
}

// -------------------------------------------------------------
// Dateityp-Helfer
// -------------------------------------------------------------

function guessMimeTypeFromName(name) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".doc"))
    return "application/msword";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}

function isExcelFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    type.includes("sheet") ||
    type.includes("excel")
  );
}

function isDocxFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return (
    name.endsWith(".docx") ||
    type.includes("officedocument.wordprocessingml.document") ||
    type.includes("wordprocessingml")
  );
}

function isLegacyDocFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".doc") && !isDocxFile(file) && !type.includes("docx");
}

function isCsvFile(file) {
  const name = (file.name || "").toLowerCase();
  const type = (file.type || "").toLowerCase();
  return name.endsWith(".csv") || type.includes("csv");
}

// -------------------------------------------------------------
// CSV / HTML-Helfer
// -------------------------------------------------------------

function escapeHtmlUpload(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function csvToHtmlTable(text) {
  const rows = text.trim().split(/\r?\n/);
  let html =
    '<table style="width:100%; border-collapse:collapse; font-size:0.85rem;">';
  html += "<tbody>";
  rows.forEach((row) => {
    if (!row.trim()) return;
    const cells = row.split(/;|,/);
    html += "<tr>";
    cells.forEach((cell) => {
      html +=
        '<td style="border:1px solid rgba(148,163,184,0.4); padding:4px 6px;">' +
        escapeHtmlUpload(cell.trim()) +
        "</td>";
    });
    html += "</tr>";
  });
  html += "</tbody></table>";
  return html;
}

// -------------------------------------------------------------
// Download / Preview / Fullscreen
// -------------------------------------------------------------

function triggerDownload(file) {
  let url = file.url;
  let revokeLater = false;

  if (!url && file.previewType === "csv-html" && file.csvText) {
    const blob = new Blob([file.csvText], { type: "text/csv" });
    url = URL.createObjectURL(blob);
    revokeLater = true;
  }

  if (!url) {
    appAlert("Download nicht möglich", "Für diesen Eintrag ist kein Download verfügbar.");
    return;
  }

  const a = document.createElement("a");
  a.href = url;
  a.download = file.name || "download";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (revokeLater) {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {}
    }, 5000);
  }
}

function createPreviewElement(file) {
  const box = document.createElement("div");
  box.className = "preview-box";

  const docWrapper = document.createElement("div");
  docWrapper.className = "preview-doc";

  if (file.previewType === "excel-html" && file.previewHtml) {
    docWrapper.innerHTML = file.previewHtml;
    box.appendChild(docWrapper);
    return box;
  }

  if (file.previewType === "docx-html" && file.previewHtml) {
    docWrapper.innerHTML = file.previewHtml;
    box.appendChild(docWrapper);
    return box;
  }

  if (file.previewType === "csv-html" && file.previewHtml) {
    docWrapper.innerHTML = file.previewHtml;
    box.appendChild(docWrapper);
    return box;
  }

  if (file.type && file.type.startsWith("image/")) {
    const img = document.createElement("img");
    img.src = file.url;
    img.alt = file.name;
    box.appendChild(img);
    return box;
  }

  if (file.type === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = file.url;
    box.appendChild(iframe);
    return box;
  }

  if (file.type && file.type.startsWith("text/")) {
    const iframe = document.createElement("iframe");
    iframe.src = file.url;
    box.appendChild(iframe);
    return box;
  }

  if (isLegacyDocFile(file)) {
    const msg = document.createElement("div");
    msg.className = "preview-doc";
    msg.textContent =
      "Altes Word-Format (.doc) – bitte über „Öffnen“ im dafür vorgesehenen Programm anzeigen.";
    box.appendChild(msg);
    return box;
  }

  const msg = document.createElement("div");
  msg.className = "preview-doc";
  msg.textContent =
    "Dieser Dateityp kann nicht direkt im Browser angezeigt werden. Bitte über „Öffnen“ im passenden Programm öffnen.";
  box.appendChild(msg);

  return box;
}

function openFullPreview(file) {
  const existing = document.querySelector(".full-preview-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "full-preview-overlay";

  const inner = document.createElement("div");
  inner.className = "full-preview-inner";

  const header = document.createElement("div");
  header.className = "full-preview-header";

  const title = document.createElement("span");
  title.textContent = file.name || "Dokument";

  // Zoom
  let zoom = 1;
  const minZoom = 0.5;
  const maxZoom = 3;
  const step = 0.2;

  const zoomControls = document.createElement("div");
  zoomControls.className = "full-preview-zoom-controls";

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.type = "button";
  zoomOutBtn.className = "full-preview-zoom-btn";
  zoomOutBtn.textContent = "−";

  const zoomLabel = document.createElement("span");
  zoomLabel.className = "full-preview-zoom-label";
  zoomLabel.textContent = "100%";

  const zoomInBtn = document.createElement("button");
  zoomInBtn.type = "button";
  zoomInBtn.className = "full-preview-zoom-btn";
  zoomInBtn.textContent = "+";

  zoomControls.appendChild(zoomOutBtn);
  zoomControls.appendChild(zoomLabel);
  zoomControls.appendChild(zoomInBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "full-preview-close";
  closeBtn.textContent = "✕";

  header.appendChild(title);
  header.appendChild(zoomControls);
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "full-preview-content";

  const preview = createPreviewElement(file);

  const zoomWrapper = document.createElement("div");
  zoomWrapper.className = "full-preview-zoom-wrapper";
  zoomWrapper.appendChild(preview);
  content.appendChild(zoomWrapper);

  inner.appendChild(header);
  inner.appendChild(content);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  function applyZoom() {
    zoom = Math.max(minZoom, Math.min(maxZoom, zoom));
    zoomWrapper.style.transform = `scale(${zoom})`;
    zoomWrapper.style.transformOrigin = "top left";
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }

  zoomOutBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    zoom -= step;
    applyZoom();
  });

  zoomInBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    zoom += step;
    applyZoom();
  });

  overlay.addEventListener(
    "wheel",
    (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY > 0) zoom -= step;
        else zoom += step;
        applyZoom();
      }
    },
    { passive: false }
  );

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKeyDown);
    document.body.style.overflow = previousOverflow;
  }

  function onKeyDown(e) {
    if (e.key === "Escape") close();
  }

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  document.addEventListener("keydown", onKeyDown);

  applyZoom();
}

// -------------------------------------------------------------
// Sortierung / Größe
// -------------------------------------------------------------

function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return bytes + " B";
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + " KB";
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + " MB";
  const gb = mb / 1024;
  return gb.toFixed(1) + " GB";
}

function applyUploadSort(fileNodeId) {
  const arr = sessionUploads[fileNodeId];
  if (!arr || !arr.length) return;

  const mode = uploadSortState[fileNodeId] || "createdDesc";

  arr.sort((a, b) => {
    if (mode === "nameAsc") {
      return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
    }
    if (mode === "nameDesc") {
      return b.name.localeCompare(a.name, "de", { sensitivity: "base" });
    }
    if (mode === "createdAsc") {
      return (a.createdAt || 0) - (b.createdAt || 0);
    }
    return (b.createdAt || 0) - (a.createdAt || 0); // createdDesc
  });
}

// -------------------------------------------------------------
// Supabase: Upload-Liste für einen File-Knoten holen
// -------------------------------------------------------------

export async function loadUploadsForNode(nodeId) {
  const currentUserId = getCurrentUserId();
  if (!currentUserId || !supabaseClient) {
    sessionUploads[nodeId] = sessionUploads[nodeId] || [];
    return;
  }

  const prefix = `${currentUserId}/${nodeId}`;
  try {
    const { data, error } = await supabaseClient.storage
      .from("uploads")
      .list(prefix, {
        limit: 100,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (error) {
      console.error("Fehler beim Laden der Uploads aus Storage:", error);
      sessionUploads[nodeId] = sessionUploads[nodeId] || [];
      return;
    }

    const list = [];

    for (const obj of data || []) {
      if (obj.name === ".emptyFolderPlaceholder") continue;

      const path = `${prefix}/${obj.name}`;

      const { data: urlData, error: urlError } = await supabaseClient.storage
        .from("uploads")
        .createSignedUrl(path, 60 * 60);

      if (urlError) {
        console.error("Fehler bei createSignedUrl:", urlError);
        continue;
      }

      const url = urlData?.signedUrl || null;

      list.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        name: obj.name,
        size: obj.metadata?.size ?? null,
        type: guessMimeTypeFromName(obj.name),
        url,
        previewType: null,
        previewHtml: null,
        searchText: null,
        createdAt: obj.created_at
          ? new Date(obj.created_at).getTime()
          : Date.now(),
      });
    }

    sessionUploads[nodeId] = list;
    rerenderAll();
  } catch (e) {
    console.error("Exception bei loadUploadsForNode:", e);
    sessionUploads[nodeId] = sessionUploads[nodeId] || [];
  }
}

// -------------------------------------------------------------
// Rendering Upload-Liste (links oben, zu ausgewählter Datei)
// -------------------------------------------------------------

export function renderUploadsForFileNode(fileNode) {
  uploadList.innerHTML = "";

  const fileId = fileNode.id;

  if (sessionUploads[fileId] === undefined) {
    sessionUploads[fileId] = [];
    loadUploadsForNode(fileId);
  }

  const list = sessionUploads[fileId] || [];

  if (selectedUploadId && !list.some((f) => f.id === selectedUploadId)) {
    selectedUploadId = null;
  }

  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "Noch keine Dokumente hochgeladen.";
    empty.style.fontSize = "0.8rem";
    empty.style.color = "var(--muted)";
    uploadList.appendChild(empty);
    return;
  }

  const currentSort = uploadSortState[fileId] || "createdDesc";
  const sortBar = document.createElement("div");
  sortBar.className = "upload-sort";

  const sortLabel = document.createElement("span");
  sortLabel.textContent = "Sortieren:";

  const sortSelect = document.createElement("select");
  sortSelect.innerHTML = `
    <option value="createdDesc">Zuletzt hinzugefügt</option>
    <option value="createdAsc">Älteste zuerst</option>
    <option value="nameAsc">A–Z</option>
    <option value="nameDesc">Z–A</option>
  `;
  sortSelect.value = currentSort;

  sortSelect.addEventListener("change", (e) => {
    uploadSortState[fileId] = e.target.value;
    applyUploadSort(fileId);
    rerenderAll();
  });

  sortBar.appendChild(sortLabel);
  sortBar.appendChild(sortSelect);
  uploadList.appendChild(sortBar);

  applyUploadSort(fileId);
  const sortedList = sessionUploads[fileId];

  sortedList.forEach((file, index) => {
    const row = document.createElement("div");
    row.className = "upload-item";
    row.dataset.uploadId = file.id;

    if (file.id === selectedUploadId) row.classList.add("selected-upload");

    const icon = document.createElement("span");
    icon.textContent = "📎";

    const nameSpan = document.createElement("span");
    nameSpan.className = "upload-name";
    nameSpan.innerHTML = highlightText(file.name);
    nameSpan.title = file.name;

    const meta = document.createElement("small");
    meta.textContent = `Größe: ${formatFileSize(file.size)}`;

    row.appendChild(icon);
    row.appendChild(nameSpan);
    row.appendChild(meta);

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn-icon";
    dlBtn.textContent = "⬇️";
    dlBtn.title = "Herunterladen";
    dlBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      triggerDownload(file);
    });
    row.appendChild(dlBtn);

    if (file.url) {
      const link = document.createElement("a");
      link.href = file.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "upload-link";
      link.textContent = "Öffnen";
      row.appendChild(link);
    }

    const delBtn = document.createElement("button");
    delBtn.className = "btn-icon btn-icon-danger";
    delBtn.textContent = "✕";
    delBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      if (sessionUploads[fileId]) sessionUploads[fileId].splice(index, 1);
      if (selectedUploadId === file.id) selectedUploadId = null;
      rerenderAll();
    });

    row.appendChild(delBtn);

    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      selectedUploadId = file.id;
      rerenderAll();
    });

    uploadList.appendChild(row);
  });
}

// -------------------------------------------------------------
// Globale Übersicht rechts (mit Preview)
// -------------------------------------------------------------

export function renderGlobalUploads() {
  if (!globalUploadList) return;
  globalUploadList.innerHTML = "";

  const tree = getTree();
  const selectedId = getSelectedId();
  const info = findById(tree, selectedId);
  const node = info ? info.node : tree;

  if (!node || node.type !== "file") return;

  if (sessionUploads[node.id] === undefined) {
    sessionUploads[node.id] = [];
    loadUploadsForNode(node.id);
  }

  const list = sessionUploads[node.id] || [];
  if (!list.length) return;

  applyUploadSort(node.id);
  const sortedList = sessionUploads[node.id];

  const group = document.createElement("div");
  group.className = "upload-group";

  const title = document.createElement("div");
  title.className = "upload-group-title";

  const path = getPath(tree, node.id);
  const pathNames = path.map((n) => n.name).join(" › ");
  title.textContent = pathNames;

  group.appendChild(title);

  sortedList.forEach((file) => {
    const container = document.createElement("div");
    container.id = "preview-" + file.id;

    const row = document.createElement("div");
    row.className = "upload-item";
    row.dataset.uploadId = file.id;

    if (file.id === selectedUploadId) row.classList.add("selected-upload");

    const icon = document.createElement("span");
    icon.textContent = "📎";

    const nameSpan = document.createElement("span");
    nameSpan.className = "upload-name";
    nameSpan.innerHTML = highlightText(file.name);
    nameSpan.title = file.name;

    const meta = document.createElement("small");
    meta.textContent = `Größe: ${formatFileSize(file.size)}`;

    row.appendChild(icon);
    row.appendChild(nameSpan);
    row.appendChild(meta);

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn-icon";
    dlBtn.textContent = "⬇️";
    dlBtn.title = "Herunterladen";
    dlBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      triggerDownload(file);
    });
    row.appendChild(dlBtn);

    if (file.url) {
      const link = document.createElement("a");
      link.href = file.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "upload-link";
      link.textContent = "Öffnen";
      row.appendChild(link);
    }

    const maximizeBtn = document.createElement("button");
    maximizeBtn.type = "button";
    maximizeBtn.className = "btn-icon";
    maximizeBtn.title = "Große Vorschau anzeigen";
    maximizeBtn.textContent = "⤢";
    maximizeBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openFullPreview(file);
    });
    row.appendChild(maximizeBtn);

    row.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a")) return;
      selectedUploadId = file.id;
      rerenderAll();
    });

    container.appendChild(row);

    const preview = createPreviewElement(file);
    if (file.id === selectedUploadId) preview.classList.add("selected-preview");
    container.appendChild(preview);

    group.appendChild(container);
  });

  globalUploadList.appendChild(group);

  if (selectedUploadId && globalUploadList) {
    const el = document.getElementById("preview-" + selectedUploadId);
    if (el) {
      const parent = globalUploadList;
      const offset =
        el.offsetTop - parent.offsetTop - parent.clientHeight / 2 + el.clientHeight / 2;

      parent.scrollTo({
        top: Math.max(offset, 0),
        behavior: "smooth",
      });
    }
  }
}

// -------------------------------------------------------------
// DOM-Events für Upload-Buttons
// -------------------------------------------------------------

function initDomEvents() {
  if (uploadBtn) {
    uploadBtn.addEventListener("click", async () => {
      const tree = getTree();
      const selectedId = getSelectedId();
      const found = findById(tree, selectedId);
      if (!found || found.node.type !== "file") {
        await appAlert(
          "Kein Dokument ausgewählt",
          "Bitte zuerst eine Datei (Referenz) im Baum auswählen."
        );
        return;
      }
      uploadInput.click();
    });
  }

  if (uploadInput) {
    uploadInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;

      const tree = getTree();
      const selectedId = getSelectedId();
      const found = findById(tree, selectedId);
      if (!found || found.node.type !== "file") return;

      const currentUserId = getCurrentUserId();
      if (!currentUserId || !supabaseClient) {
        await appAlert(
          "Nicht eingeloggt",
          "Bitte loggen Sie sich erneut ein, bevor Sie Dateien hochladen."
        );
        return;
      }

      const fileId = found.node.id;
      if (!sessionUploads[fileId]) {
        sessionUploads[fileId] = [];
      }

      for (const f of files) {
        try {
          const basePath = `${currentUserId}/${fileId}`;
          const fileNameOnServer = `${Date.now()}-${f.name}`;
          const fullPath = `${basePath}/${fileNameOnServer}`;

          const { error: uploadError } = await supabaseClient
            .storage
            .from("uploads")
            .upload(fullPath, f, {
              cacheControl: "3600",
              upsert: false,
            });

          if (uploadError) {
            console.error("Fehler beim Upload nach Supabase:", uploadError);
            await appAlert(
              "Upload fehlgeschlagen",
              `Die Datei "${f.name}" konnte nicht hochgeladen werden.`
            );
            continue;
          }

          const { data: urlData, error: urlError } = await supabaseClient.storage
            .from("uploads")
            .createSignedUrl(fullPath, 60 * 60);

          if (urlError) {
            console.error("Fehler bei createSignedUrl:", urlError);
            await appAlert(
              "URL konnte nicht erstellt werden",
              `Die Datei "${f.name}" wurde hochgeladen, aber die Vorschau-URL konnte nicht erstellt werden.`
            );
            continue;
          }

          const publicUrl = urlData?.signedUrl || null;

          const entry = {
            id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
            name: f.name,
            size: f.size,
            type: f.type || guessMimeTypeFromName(f.name),
            url: publicUrl,
            previewType: null,
            previewHtml: null,
            searchText: null,
            createdAt: Date.now(),
          };

          if (isCsvFile(f)) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              try {
                const text = String(evt.target.result || "");
                const html = csvToHtmlTable(text);
                entry.previewType = "csv-html";
                entry.previewHtml = html;
                entry.csvText = text;
                entry.searchText = text.toLowerCase();
              } catch (err) {
                console.error("Fehler beim Lesen der CSV-Datei:", err);
              } finally {
                sessionUploads[fileId].push(entry);
                selectedUploadId = entry.id;
                rerenderAll();
              }
            };
            reader.readAsText(f, "utf-8");
            continue;
          }

          if (isExcelFile(f) && typeof XLSX !== "undefined") {
            const reader = new FileReader();
            reader.onload = (evt) => {
              try {
                const dataArr = evt.target.result;
                const workbook = XLSX.read(dataArr, { type: "array" });
                const firstSheetName = workbook.SheetNames[0];
                const sheet = workbook.Sheets[firstSheetName];
                const html = XLSX.utils.sheet_to_html(sheet);

                let text = "";
                try {
                  text = XLSX.utils.sheet_to_csv(sheet);
                } catch (e2) {
                  text = "";
                }

                entry.previewType = "excel-html";
                entry.previewHtml = html;
                entry.searchText = (text || "").toLowerCase();
              } catch (err) {
                console.error("Fehler beim Lesen der Excel-Datei:", err);
              } finally {
                sessionUploads[fileId].push(entry);
                selectedUploadId = entry.id;
                rerenderAll();
              }
            };
            reader.readAsArrayBuffer(f);
            continue;
          }

          if (isDocxFile(f) && typeof mammoth !== "undefined") {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const arrayBuffer = evt.target.result;
              mammoth
                .convertToHtml({ arrayBuffer })
                .then((result) => {
                  entry.previewType = "docx-html";
                  entry.previewHtml = result.value;
                  const plain = result.value
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                  entry.searchText = plain.toLowerCase();
                })
                .catch((err) => {
                  console.error("Fehler beim Lesen der DOCX-Datei:", err);
                })
                .finally(() => {
                  sessionUploads[fileId].push(entry);
                  selectedUploadId = entry.id;
                  rerenderAll();
                });
            };
            reader.readAsArrayBuffer(f);
            continue;
          }

          if (f.type && f.type.startsWith("text/")) {
            const reader = new FileReader();
            reader.onload = (evt) => {
              const text = String(evt.target.result || "");
              entry.searchText = text.toLowerCase();
              sessionUploads[fileId].push(entry);
              selectedUploadId = entry.id;
              rerenderAll();
            };
            reader.readAsText(f, "utf-8");
            continue;
          }

          sessionUploads[fileId].push(entry);
          selectedUploadId = entry.id;
          rerenderAll();
        } catch (err) {
          console.error("Allgemeiner Fehler beim Upload:", err);
        }
      }

      uploadInput.value = "";
    });
  }
}
