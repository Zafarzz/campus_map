import type { PhotoAttachment } from '../domain/types';

const ATTACH_DB_NAME = 'campus_map_attachments_db_v1';
const ATTACH_DB_VERSION = 1;
const STORE_ATTACHMENTS = 'attachments';
const LS_ATTACH_KEY = 'campus_map_attachments_ls_v1';
const MAX_LS_FALLBACK_BYTES = 1.5 * 1024 * 1024; // 1.5 MB cap for localStorage fallback

export interface StoredAttachmentBlob {
  fileId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  bytes: Uint8Array;
  createdAt: string;
}

// Primary in-memory cache synced with IndexedDB / localStorage
const memoryBlobs = new Map<string, StoredAttachmentBlob>();
const previewUrlCache = new Map<string, string>();
// Separate persistent simulated store for environments without IDB (e.g. Vitest node environment)
const simulatedDiskBlobs = new Map<string, StoredAttachmentBlob>();

function isIDBAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.indexedDB !== 'undefined' &&
      window.indexedDB !== null
    );
  } catch {
    return false;
  }
}

function isLocalStorageAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.localStorage !== 'undefined' &&
      window.localStorage !== null
    );
  } catch {
    return false;
  }
}

function openAttachmentDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIDBAvailable()) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(ATTACH_DB_NAME, ATTACH_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ATTACHMENTS)) {
        db.createObjectStore(STORE_ATTACHMENTS, { keyPath: 'fileId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

function syncToLocalStorageFallback(): void {
  if (!isLocalStorageAvailable()) return;
  try {
    const serialized: Record<
      string,
      {
        fileId: string;
        fileName: string;
        mimeType: string;
        byteSize: number;
        b64: string;
        createdAt: string;
      }
    > = {};
    let totalBytes = 0;
    for (const [fileId, rec] of memoryBlobs.entries()) {
      if (totalBytes + rec.byteSize > MAX_LS_FALLBACK_BYTES) {
        break;
      }
      serialized[fileId] = {
        fileId: rec.fileId,
        fileName: rec.fileName,
        mimeType: rec.mimeType,
        byteSize: rec.byteSize,
        b64: uint8ToBase64(rec.bytes),
        createdAt: rec.createdAt,
      };
      totalBytes += rec.byteSize;
    }
    window.localStorage.setItem(LS_ATTACH_KEY, JSON.stringify(serialized));
  } catch (err) {
    // Gracefully ignore QuotaExceededError; IndexedDB is the primary store for large files
    console.warn('Attachment localStorage fallback quota exceeded (using IndexedDB/memory)', err);
  }
}

/**
 * Initializes the attachment storage and hydrates the in-memory cache from IndexedDB / localStorage
 * so synchronous lookups and thumbnails work immediately after page reload.
 */
export async function initAttachmentStorage(): Promise<void> {
  // 1. Hydrate from simulated disk store (used in headless test environments)
  for (const [fileId, rec] of simulatedDiskBlobs.entries()) {
    if (!memoryBlobs.has(fileId)) {
      memoryBlobs.set(fileId, {
        ...rec,
        bytes: new Uint8Array(rec.bytes),
      });
    }
  }

  // 2. Hydrate from localStorage fallback if present
  if (isLocalStorageAvailable()) {
    try {
      const raw = window.localStorage.getItem(LS_ATTACH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<
          string,
          {
            fileId: string;
            fileName: string;
            mimeType: string;
            byteSize: number;
            b64: string;
            createdAt: string;
          }
        >;
        for (const item of Object.values(parsed)) {
          if (item && item.fileId && item.b64 && !memoryBlobs.has(item.fileId)) {
            const bytes = base64ToUint8(item.b64);
            memoryBlobs.set(item.fileId, {
              fileId: item.fileId,
              fileName: item.fileName,
              mimeType: item.mimeType,
              byteSize: item.byteSize || bytes.byteLength,
              bytes,
              createdAt: item.createdAt,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  // 3. Hydrate from IndexedDB (authoritative for large images)
  if (isIDBAvailable()) {
    try {
      const db = await openAttachmentDB();
      const records = await new Promise<StoredAttachmentBlob[]>((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readonly');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result as StoredAttachmentBlob[]) || []);
        req.onerror = () => reject(req.error);
      });
      for (const rec of records) {
        if (rec && rec.fileId && rec.bytes) {
          const bytes =
            rec.bytes instanceof Uint8Array
              ? rec.bytes
              : new Uint8Array(rec.bytes as ArrayBufferLike);
          memoryBlobs.set(rec.fileId, {
            ...rec,
            bytes,
            byteSize: rec.byteSize || bytes.byteLength,
          });
        }
      }
    } catch {
      // Ignore IDB errors
    }
  }
}

/**
 * Saves an original binary image into attachment storage.
 */
export async function saveAttachmentBlob(
  fileIdOrRecord: string | StoredAttachmentBlob,
  bytes?: Uint8Array,
  mimeType?: string,
  fileName?: string,
): Promise<StoredAttachmentBlob> {
  const isObj = typeof fileIdOrRecord === 'object' && fileIdOrRecord !== null;
  const resolvedFileId = isObj ? fileIdOrRecord.fileId : fileIdOrRecord;
  const resolvedBytes = isObj ? fileIdOrRecord.bytes : bytes ?? new Uint8Array(0);
  const resolvedMime = isObj ? fileIdOrRecord.mimeType : mimeType || 'image/jpeg';
  const resolvedName = isObj ? fileIdOrRecord.fileName : fileName || `${resolvedFileId}.jpg`;
  const resolvedCreatedAt = isObj && fileIdOrRecord.createdAt ? fileIdOrRecord.createdAt : new Date().toISOString();

  const copyBytes = new Uint8Array(resolvedBytes);
  const record: StoredAttachmentBlob = {
    fileId: resolvedFileId,
    fileName: resolvedName,
    mimeType: resolvedMime || 'image/jpeg',
    byteSize: copyBytes.byteLength,
    bytes: copyBytes,
    createdAt: resolvedCreatedAt,
  };

  memoryBlobs.set(resolvedFileId, record);
  simulatedDiskBlobs.set(resolvedFileId, {
    ...record,
    bytes: new Uint8Array(copyBytes),
  });

  // Invalidate any stale preview URL
  const oldUrl = previewUrlCache.get(resolvedFileId);
  if (oldUrl && oldUrl.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    try {
      URL.revokeObjectURL(oldUrl);
    } catch {
      // Ignore
    }
  }
  previewUrlCache.delete(resolvedFileId);

  syncToLocalStorageFallback();

  if (isIDBAvailable()) {
    try {
      const db = await openAttachmentDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readwrite');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('IndexedDB saveAttachmentBlob error', err);
    }
  }

  return record;
}

/**
 * Reads a browser File/Blob and stores it as a PhotoAttachment + StoredAttachmentBlob.
 */
export async function createPhotoAttachmentFromFile(
  file: File,
  order: number = 0,
): Promise<{ attachment: PhotoAttachment; blobRecord: StoredAttachmentBlob }> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const rand = Math.random().toString(36).slice(2, 8);
  const timestamp = Date.now().toString(36);
  const id = `photo_${timestamp}_${rand}`;
  const fileId = `blob_${timestamp}_${rand}`;
  const mimeType = file.type || guessMimeTypeFromFileName(file.name);

  const blobRecord = await saveAttachmentBlob(fileId, bytes, mimeType, file.name);

  const attachment: PhotoAttachment = {
    id,
    fileId,
    fileName: file.name || `photo-${order + 1}.jpg`,
    mimeType,
    byteSize: bytes.byteLength,
    createdAt: blobRecord.createdAt,
    order,
  };

  return { attachment, blobRecord };
}

export function guessMimeTypeFromFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

export function extensionFromMimeOrName(mimeType: string, fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const match = lowerName.match(/\.(jpg|jpeg|png|webp|gif|svg)$/);
  if (match) return match[1];
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'jpg';
}

/**
 * Synchronous check whether the binary image exists in attachment storage.
 */
export function hasAttachmentBlob(fileId: string): boolean {
  return memoryBlobs.has(fileId);
}

/**
 * Synchronous retrieval of an attachment's binary record.
 */
export function getAttachmentBlobSync(fileId: string): StoredAttachmentBlob | null {
  return memoryBlobs.get(fileId) ?? null;
}

/**
 * Async retrieval of an attachment's binary record (checks IndexedDB if not in memory).
 */
export async function getAttachmentBlob(fileId: string): Promise<StoredAttachmentBlob | null> {
  const cached = memoryBlobs.get(fileId);
  if (cached) return cached;
  await initAttachmentStorage();
  return memoryBlobs.get(fileId) ?? null;
}

/**
 * Returns a preview URL (`blob:` or `data:`) for rendering thumbnails and full-size modals.
 */
export function getAttachmentPreviewUrl(fileId: string): string | null {
  if (previewUrlCache.has(fileId)) {
    return previewUrlCache.get(fileId)!;
  }
  const rec = memoryBlobs.get(fileId);
  if (!rec) return null;

  try {
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function' && typeof Blob !== 'undefined') {
      const blob = new Blob([rec.bytes as unknown as BlobPart], { type: rec.mimeType });
      const url = URL.createObjectURL(blob);
      previewUrlCache.set(fileId, url);
      return url;
    }
  } catch {
    // Fallback to data URI below
  }

  const dataUrl = `data:${rec.mimeType};base64,${uint8ToBase64(rec.bytes)}`;
  previewUrlCache.set(fileId, dataUrl);
  return dataUrl;
}

/**
 * Deletes a binary blob from storage by fileId.
 */
export async function deleteAttachmentBlob(fileId: string): Promise<void> {
  memoryBlobs.delete(fileId);
  simulatedDiskBlobs.delete(fileId);
  const url = previewUrlCache.get(fileId);
  if (url && url.startsWith('blob:') && typeof URL !== 'undefined' && URL.revokeObjectURL) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignore
    }
  }
  previewUrlCache.delete(fileId);

  syncToLocalStorageFallback();

  if (isIDBAvailable()) {
    try {
      const db = await openAttachmentDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_ATTACHMENTS, 'readwrite');
        const store = tx.objectStore(STORE_ATTACHMENTS);
        const req = store.delete(fileId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Ignore
    }
  }
}

/**
 * Clears only the in-memory runtime cache (simulating a browser page reload in tests)
 * while leaving persisted storage intact so `initAttachmentStorage()` can re-hydrate it.
 */
export function simulatePageReloadForAttachments(): void {
  memoryBlobs.clear();
  previewUrlCache.clear();
}

/**
 * Clears all attachment blobs from memory and persistent storage (used in unit tests).
 */
export async function clearAllAttachmentBlobs(): Promise<void> {
  memoryBlobs.clear();
  simulatedDiskBlobs.clear();
  previewUrlCache.clear();
  syncToLocalStorageFallback();
}

