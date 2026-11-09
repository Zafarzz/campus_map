export const HAS_EDITOR_DRAFT_KEY = 'campus_map_has_draft_v10';
export const LS_EDITOR_DRAFT_KEY = 'campus_map_draft_v10';

const memoryStore = new Map<string, string>();

export function getRawStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(key);
      if (value !== null) return value;
    }
  } catch {
    // Fallback to in-memory store when localStorage is unavailable or blocked
  }
  return memoryStore.get(key) ?? null;
}

export function setRawStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Fallback to in-memory store when quota is exceeded or blocked
  }
  memoryStore.set(key, value);
}

export function removeRawStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage removal errors
  }
  memoryStore.delete(key);
}

export function getJsonStorageItem<T>(key: string, fallback: T): T {
  const raw = getRawStorageItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJsonStorageItem<T>(key: string, value: T): void {
  setRawStorageItem(key, JSON.stringify(value));
}
