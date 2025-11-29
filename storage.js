// storage.js
// LocalStorage + Supabase-Persistenz für den Dokumenten-Baum

import { defaultTree } from "./model.js";

// Key für lokalen Tree (Backup + Offline)
export const STORAGE_KEY = "doc-structure-v1";

// Supabase-Client & Status für aktuelle Sitzung
let supabaseClient = window.supabaseClient || null;
let currentUserId = null;      // auth.uid()
let currentTreeRowId = null;   // doc_trees.id (Zeile des Users)
let saveTimeout = null;        // für debounce beim Speichern

// -------------------------------------------------------------
// Konfiguration / Auth-Status
// -------------------------------------------------------------

/**
 * Supabase-Client setzen (falls nicht direkt aus window genutzt).
 */
export function configureSupabase(client) {
  supabaseClient = client || null;
}

/**
 * Aktuellen User setzen (z.B. nach Login).
 * Setzt auch die aktuelle Tree-Zeilen-ID zurück, damit sie neu ermittelt wird.
 */
export function setCurrentUser(userId) {
  currentUserId = userId || null;
  currentTreeRowId = null;
}

/**
 * Auth-Status zurücksetzen (z.B. nach Logout).
 */
export function clearCurrentUser() {
  currentUserId = null;
  currentTreeRowId = null;
}

// -------------------------------------------------------------
// Lokale Speicherung (Browser)
// -------------------------------------------------------------

/**
 * Nur lokal im Browser speichern (Backup / Offline).
 */
export function saveTreeLocal(tree) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tree));
  } catch (e) {
    console.error("Konnte Tree nicht in localStorage speichern:", e);
  }
}

/**
 * Nur lokal aus dem Browser laden.
 * Fällt auf defaultTree zurück, wenn nichts oder Fehler.
 */
export function loadTreeLocalOnly() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.error("Konnte Tree nicht aus localStorage laden:", e);
  }
  if (!raw) return defaultTree;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return defaultTree;
  }
}

/**
 * Bequeme Kombi-Funktion: lokal speichern + Supabase (debounced).
 */
export function saveTree(tree) {
  saveTreeLocal(tree);
  scheduleSaveToSupabase(tree);
}

// -------------------------------------------------------------
// Supabase: Tree laden / speichern
// -------------------------------------------------------------

/**
 * Debounced speichern – ruft saveTreeToSupabase max. alle ~500ms auf.
 */
function scheduleSaveToSupabase(tree) {
  if (!currentUserId || !supabaseClient) return;
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    saveTreeToSupabase(tree).catch((e) =>
      console.error("Fehler beim Speichern nach Supabase:", e)
    );
  }, 500);
}

/**
 * Tree aus Supabase holen oder neuen Datensatz anlegen.
 * Gibt den geladenen/angelegten Tree zurück.
 */
export async function loadTreeFromSupabaseOrInitialize() {
  if (!currentUserId || !supabaseClient) {
    // kein Supabase → nur lokal
    const tree = loadTreeLocalOnly();
    saveTreeLocal(tree);
    return tree;
  }

  try {
    const { data, error } = await supabaseClient
      .from("doc_trees")
      .select("id, tree")
      .eq("user_id", currentUserId)
      .limit(1);

    if (error) {
      console.error("Fehler beim Laden aus doc_trees:", error);
    }

    let tree;

    if (data && data.length > 0 && data[0].tree) {
      // vorhandenen Tree benutzen
      currentTreeRowId = data[0].id;
      tree = data[0].tree;
    } else {
      // noch kein Datensatz: neuen mit Default/LocalTree anlegen
      tree = loadTreeLocalOnly();
      const { data: insertData, error: insertError } = await supabaseClient
        .from("doc_trees")
        .insert([{ user_id: currentUserId, tree }])
        .select("id")
        .limit(1);

      if (insertError) {
        console.error("Fehler beim Anlegen von doc_trees:", insertError);
      } else if (insertData && insertData.length > 0) {
        currentTreeRowId = insertData[0].id;
      }
    }

    // lokales Backup aktualisieren
    saveTreeLocal(tree);
    return tree;
  } catch (e) {
    console.error("Exception bei loadTreeFromSupabaseOrInitialize:", e);
    const tree = loadTreeLocalOnly();
    saveTreeLocal(tree);
    return tree;
  }
}

/**
 * Tree in Supabase speichern (INSERT oder UPDATE).
 * Nutzt currentUserId + currentTreeRowId intern.
 */
export async function saveTreeToSupabase(tree) {
  if (!currentUserId || !supabaseClient) return;

  try {
    if (!currentTreeRowId) {
      // falls aus irgendeinem Grund noch keine Zeile existiert
      const { data, error } = await supabaseClient
        .from("doc_trees")
        .insert([{ user_id: currentUserId, tree }])
        .select("id")
        .limit(1);

      if (error) {
        console.error("Fehler beim INSERT in doc_trees:", error);
        return;
      }
      if (data && data.length > 0) {
        currentTreeRowId = data[0].id;
      }
    } else {
      const { error } = await supabaseClient
        .from("doc_trees")
        .update({
          tree,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentTreeRowId)
        .eq("user_id", currentUserId);

      if (error) {
        console.error("Fehler beim UPDATE in doc_trees:", error);
      }
    }
  } catch (e) {
    console.error("Exception bei saveTreeToSupabase:", e);
  }
}
