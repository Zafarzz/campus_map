import { createInitialDocument } from '../domain/adapter';
import type { CampusVersion, EditorDocument, VersionType } from '../domain/types';
import { initAttachmentStorage } from './attachmentStorage';

const DB_NAME = 'campus_map_editor_db_v3';
const DB_VERSION = 1;
const STORE_DRAFTS = 'drafts';
const STORE_VERSIONS = 'versions';

const DRAFT_KEY = 'current_draft_v3';
const LS_DRAFT_KEY = 'campus_map_draft_v3';
const LS_VERSIONS_KEY = 'campus_map_versions_v3';

// In-memory fallback if neither IDB nor localStorage are available
let memoryDraft: EditorDocument | null = null;
let memoryVersions: CampusVersion[] = [];

function isIDBAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined' && window.indexedDB !== null;
  } catch {
    return false;
  }
}

function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined' && window.localStorage !== null;
  } catch {
    return false;
  }
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIDBAvailable()) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
        db.createObjectStore(STORE_DRAFTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_VERSIONS)) {
        db.createObjectStore(STORE_VERSIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function cloneDocument(doc: EditorDocument): EditorDocument {
  if (typeof structuredClone === 'function') {
    return structuredClone(doc);
  }
  return JSON.parse(JSON.stringify(doc)) as EditorDocument;
}

/**
 * Loads current draft document.
 */
export async function loadDraft(): Promise<EditorDocument | null> {
  if (isIDBAvailable()) {
    try {
      const db = await openDB();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_DRAFTS, 'readonly');
        const store = tx.objectStore(STORE_DRAFTS);
        const req = store.get(DRAFT_KEY);
        req.onsuccess = () => {
          if (req.result && req.result.doc) {
            resolve(req.result.doc as EditorDocument);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Fallback below
    }
  }

  if (isLocalStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(LS_DRAFT_KEY);
      if (raw) {
        return JSON.parse(raw) as EditorDocument;
      }
    } catch {
      // Fallback
    }
  }

  return memoryDraft ? cloneDocument(memoryDraft) : null;
}

/**
 * Saves current draft document.
 */
export async function saveDraft(doc: EditorDocument): Promise<void> {
  const cloned = cloneDocument(doc);
  cloned.lastModified = new Date().toISOString();

  // Save to memory
  memoryDraft = cloneDocument(cloned);

  // Save to localStorage
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(cloned));
    } catch (e) {
      console.warn('localStorage saveDraft error', e);
    }
  }

  // Save to IDB
  if (isIDBAvailable()) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_DRAFTS, 'readwrite');
        const store = tx.objectStore(STORE_DRAFTS);
        const req = store.put({ key: DRAFT_KEY, doc: cloned });
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB saveDraft error', e);
    }
  }
}

/**
 * Loads all saved versions.
 */
export async function loadVersions(): Promise<CampusVersion[]> {
  if (isIDBAvailable()) {
    try {
      const db = await openDB();
      const versions = await new Promise<CampusVersion[]>((resolve, reject) => {
        const tx = db.transaction(STORE_VERSIONS, 'readonly');
        const store = tx.objectStore(STORE_VERSIONS);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as CampusVersion[]) || []);
        req.onerror = () => reject(req.error);
      });
      if (versions.length > 0) {
        // Sort descending by timestamp
        return versions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    } catch {
      // Fallback
    }
  }

  if (isLocalStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(LS_VERSIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CampusVersion[];
        return parsed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      }
    } catch {
      // Fallback
    }
  }

  return [...memoryVersions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Saves a version to storage.
 */
export async function saveVersion(version: CampusVersion): Promise<void> {
  const cloned = {
    ...version,
    document: cloneDocument(version.document),
  };

  // Memory
  const memIndex = memoryVersions.findIndex((v) => v.id === version.id);
  if (memIndex >= 0) {
    memoryVersions[memIndex] = cloned;
  } else {
    memoryVersions.push(cloned);
  }

  // localStorage
  if (isLocalStorageAvailable()) {
    try {
      const all = await loadVersions();
      const idx = all.findIndex((v) => v.id === version.id);
      if (idx >= 0) {
        all[idx] = cloned;
      } else {
        all.unshift(cloned);
      }
      window.localStorage.setItem(LS_VERSIONS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('localStorage saveVersion error', e);
    }
  }

  // IndexedDB
  if (isIDBAvailable()) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_VERSIONS, 'readwrite');
        const store = tx.objectStore(STORE_VERSIONS);
        const req = store.put(cloned);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB saveVersion error', e);
    }
  }
}

/**
 * Deletes a version by ID. Initial versions cannot be deleted.
 */
export async function deleteVersion(versionId: string): Promise<boolean> {
  const versions = await loadVersions();
  const target = versions.find((v) => v.id === versionId);
  if (!target || target.type === 'initial') {
    return false;
  }

  // Memory
  memoryVersions = memoryVersions.filter((v) => v.id !== versionId);

  // localStorage
  if (isLocalStorageAvailable()) {
    try {
      const remaining = versions.filter((v) => v.id !== versionId);
      window.localStorage.setItem(LS_VERSIONS_KEY, JSON.stringify(remaining));
    } catch {
      // Ignore
    }
  }

  // IndexedDB
  if (isIDBAvailable()) {
    try {
      const db = await openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_VERSIONS, 'readwrite');
        const store = tx.objectStore(STORE_VERSIONS);
        const req = store.delete(versionId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore
    }
  }

  return true;
}

/**
 * Creates and persists a named version snapshot.
 */
export async function createNamedVersion(
  doc: EditorDocument,
  name: string,
  reason: string = '',
  type: VersionType = 'manual',
): Promise<CampusVersion> {
  const version: CampusVersion = {
    id: `ver_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name,
    timestamp: new Date().toISOString(),
    type,
    reason: reason || (type === 'initial' ? 'Начальный снимок кампуса' : 'Сохранение пользователем'),
    document: cloneDocument(doc),
  };
  await saveVersion(version);
  return version;
}

/**
 * Initializes storage, guaranteeing a valid draft and an initial version snapshot.
 */
export async function initStorage(): Promise<{ doc: EditorDocument; versions: CampusVersion[] }> {
  await initAttachmentStorage();
  let doc = await loadDraft();
  let versions = await loadVersions();

  if (!doc) {
    doc = createInitialDocument();
    await saveDraft(doc);
  }

  if (versions.length === 0) {
    const initialVer = await createNamedVersion(
      doc,
      'Начальное состояние кампуса',
      'Автоматический начальный снимок из проектных данных',
      'initial',
    );
    versions = [initialVer];
  }

  return { doc, versions };
}

/**
 * Resets storage to initial demo campus state.
 */
export async function resetToDefaults(): Promise<{ doc: EditorDocument; versions: CampusVersion[] }> {
  const doc = createInitialDocument();
  await saveDraft(doc);
  const initialVer = await createNamedVersion(
    doc,
    'Сброс к базовому плану',
    'Возврат к исходным проектным данным кампуса',
    'manual',
  );
  const versions = await loadVersions();
  return { doc, versions: [initialVer, ...versions] };
}
