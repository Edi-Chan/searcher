// model.js
// Reines Datenmodell + Baum-Helfer für den Dokumenten-Organizer

// -------------------------------------------------------------
// ID & Name-Helfer
// -------------------------------------------------------------

/**
 * Erzeugt eine zufällige ID (8 Zeichen).
 */
export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Schneidet Namen auf 20 Zeichen und entfernt Leerzeichen.
 * Gibt null zurück, wenn der Name leer ist.
 */
export function sanitizeName(input) {
  if (input === null || input === undefined) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const maxLen = 20;
  if (trimmed.length > maxLen) {
    return trimmed.slice(0, maxLen);
  }
  return trimmed;
}

// -------------------------------------------------------------
// Standard-Baum (Default-Struktur)
// -------------------------------------------------------------

/**
 * Standard-Struktur: Root > Ordner 1 > Dokument 1
 */
export const defaultTree = {
  id: uid(),
  type: "folder",
  name: "Root",
  icon: "📁",
  expanded: true,
  note: "Dies ist Ihr Wurzelordner. Fügen Sie darunter Ordner/Dateien hinzu.",
  children: [
    {
      id: uid(),
      type: "folder",
      name: "Ordner 1",
      icon: "📁",
      expanded: true,
      note: null,
      children: [
        {
          id: uid(),
          type: "file",
          name: "Dokument 1",
          icon: "📄",
          note: "Beispiel-Dokument (nur Referenz)",
        },
      ],
    },
  ],
};

// -------------------------------------------------------------
// Baum-Utilities (pure functions, keine DOM-Zugriffe)
// -------------------------------------------------------------

/**
 * Tief-Kopie eines Baums.
 */
export function cloneTree(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Läuft rekursiv durch den Baum und ruft fn(node, parent) auf.
 */
export function walkTree(node, fn, parent = null) {
  fn(node, parent);
  if (node.type === "folder" && Array.isArray(node.children)) {
    node.children.forEach((child) => walkTree(child, fn, node));
  }
}

/**
 * Sucht einen Knoten per ID.
 * Gibt { node, parent } oder null zurück.
 */
export function findById(root, id) {
  let found = null;
  walkTree(root, (n, parent) => {
    if (n.id === id) {
      found = { node: n, parent };
    }
  });
  return found;
}

/**
 * Aktualisiert einen Knoten per ID mit einer Updater-Funktion.
 * Gibt einen NEUEN Baum zurück (immutabel).
 */
export function updateNode(root, id, updater) {
  const copy = cloneTree(root);
  walkTree(copy, (n) => {
    if (n.id === id) {
      updater(n);
    }
  });
  return copy;
}

/**
 * Fügt einem Ordner (parentId) einen neuen Knoten als erstes Kind hinzu.
 * Gibt einen neuen Baum zurück.
 */
export function insertNode(root, parentId, newNode) {
  const copy = cloneTree(root);
  walkTree(copy, (n) => {
    if (n.id === parentId && n.type === "folder") {
      if (!Array.isArray(n.children)) n.children = [];
      n.children.unshift(newNode);
    }
  });
  return copy;
}

/**
 * Entfernt einen Knoten per ID.
 * Die Root wird NICHT gelöscht (wenn id === root.id -> unverändert).
 */
export function removeNode(root, id) {
  const copy = cloneTree(root);
  if (copy.id === id) {
    return copy;
  }

  walkTree(copy, (n) => {
    if (n.type === "folder" && Array.isArray(n.children)) {
      n.children = n.children.filter((c) => c.id !== id);
    }
  });

  return copy;
}

/**
 * Liefert den Pfad (Array von Knoten) von Root bis zu id.
 * Wenn nicht gefunden: leeres Array.
 */
export function getPath(root, id) {
  const result = [];

  function recur(node, chain) {
    if (node.id === id) {
      result.push(...chain, node);
      return true;
    }
    if (node.type === "folder" && Array.isArray(node.children)) {
      for (const child of node.children) {
        if (recur(child, chain.concat(node))) return true;
      }
    }
    return false;
  }

  recur(root, []);
  return result;
}

// -------------------------------------------------------------
// Filtern / Suchen im Baum
// -------------------------------------------------------------

/**
 * Filtert den Baum nach Name/Notiz + optional Upload-Inhalten.
 *
 * @param {Object} root - Wurzel des vollständigen Baums
 * @param {string} query - Suchbegriff
 * @param {Function} [fileUploadMatcher] - optionale Funktion
 *        (nodeId: string, q: string) => boolean
 *        -> soll true liefern, wenn zu dieser Datei ein Upload passt.
 *
 * WICHTIG: Diese Funktion kennt NICHT sessionUploads direkt.
 * Die Logik dafür wird später z.B. in uploads.js implementiert
 * und hier nur als Callback übergeben.
 */
export function filterTree(root, query, fileUploadMatcher) {
  if (!query || !query.trim()) return root;
  const q = query.toLowerCase();

  function recur(node) {
    if (node.type === "folder") {
      const children = (node.children || [])
        .map(recur)
        .filter((x) => x !== null);

      const matchesSelf =
        node.name.toLowerCase().includes(q) ||
        (node.note || "").toLowerCase().includes(q);

      if (matchesSelf || children.length > 0) {
        return {
          ...node,
          children,
        };
      }
      return null;
    } else {
      const baseMatch =
        node.name.toLowerCase().includes(q) ||
        (node.note || "").toLowerCase().includes(q);

      const uploadMatch = fileUploadMatcher
        ? !!fileUploadMatcher(node.id, q)
        : false;

      const matches = baseMatch || uploadMatch;
      return matches ? { ...node } : null;
    }
  }

  const filtered = recur(root);
  if (!filtered) {
    return {
      ...root,
      children: [],
    };
  }
  return filtered;
}
