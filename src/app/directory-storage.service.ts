import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const DB_NAME = 'DriverXpertTelemetryDB';
const DB_VERSION = 2;
const STORE_NAME = 'directory_handles';
const SESSIONS_STORE = 'cached_sessions';
const HANDLE_KEY = 'telemetry_dir_handle';
const SESSIONS_KEY = 'telemetry_sessions_cache';
const DIR_NAME_KEY = 'dx_linked_dir_name';

export interface FileEntryItem {
  file: File;
  relativePath: string;
}

interface FileHandleLike {
  name: string;
  kind: 'file' | 'directory';
  getFile?(): Promise<File>;
}

interface DirectoryHandleLike {
  values(): AsyncIterable<FileHandleLike>;
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

@Injectable({
  providedIn: 'root'
})
export class DirectoryStorageService {
  private platformId = inject(PLATFORM_ID);

  isSupported(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  }

  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!isPlatformBrowser(this.platformId) || typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveDirectoryHandle(handle: FileSystemDirectoryHandle): Promise<void> {
    if (!this.isSupported()) return;
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(handle, HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DIR_NAME_KEY, handle.name);
      }
    } catch (err) {
      console.warn('Could not save directory handle to IndexedDB:', err);
    }
  }

  async getDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.isSupported()) return null;
    try {
      const db = await this.openDB();
      return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(HANDLE_KEY);
        req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Could not retrieve directory handle from IndexedDB:', err);
      return null;
    }
  }

  getSavedDirectoryName(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(DIR_NAME_KEY) || null;
    }
    return null;
  }

  async clearDirectoryHandle(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DIR_NAME_KEY);
    }
    await this.clearCachedSessions();
    if (!this.isSupported()) return;
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(HANDLE_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Could not delete directory handle from IndexedDB:', err);
    }
  }

  async saveCachedSessions(sessions: unknown[], dirName: string): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const serializableSessions = (sessions as {
        id: string;
        driver: string;
        track: string;
        date: string;
        time: string;
        laps?: unknown[];
        resumeData?: unknown;
        bestLapTime?: number;
        lapCount?: number;
      }[]).map(s => ({
        id: s.id,
        driver: s.driver,
        track: s.track,
        date: s.date,
        time: s.time,
        laps: s.laps || [],
        resumeData: s.resumeData || null,
        bestLapTime: s.bestLapTime,
        lapCount: s.lapCount || (s.laps ? s.laps.length : 0),
        isLoaded: true
      }));

      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        const store = tx.objectStore(SESSIONS_STORE);
        store.put({ sessions: serializableSessions, dirName, timestamp: Date.now() }, SESSIONS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(DIR_NAME_KEY, dirName);
      }
    } catch (err) {
      console.warn('Could not save cached sessions to IndexedDB:', err);
    }
  }

  async getCachedSessions(): Promise<{ sessions: unknown[]; dirName: string } | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    try {
      const db = await this.openDB();
      return await new Promise<{ sessions: unknown[]; dirName: string } | null>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readonly');
        const store = tx.objectStore(SESSIONS_STORE);
        const req = store.get(SESSIONS_KEY);
        req.onsuccess = () => resolve((req.result as { sessions: unknown[]; dirName: string }) || null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn('Could not retrieve cached sessions from IndexedDB:', err);
      return null;
    }
  }

  async clearCachedSessions(): Promise<void> {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(DIR_NAME_KEY);
    }
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const db = await this.openDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(SESSIONS_STORE, 'readwrite');
        const store = tx.objectStore(SESSIONS_STORE);
        store.delete(SESSIONS_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('Could not clear cached sessions from IndexedDB:', err);
    }
  }

  async verifyPermission(handle: FileSystemDirectoryHandle, requestIfPrompt = false): Promise<boolean> {
    try {
      const handleLike = handle as unknown as DirectoryHandleLike;
      if (typeof handleLike.queryPermission === 'function') {
        const state = await handleLike.queryPermission({ mode: 'read' });
        if (state === 'granted') {
          return true;
        }
        if (requestIfPrompt && typeof handleLike.requestPermission === 'function') {
          const reqState = await handleLike.requestPermission({ mode: 'read' });
          return reqState === 'granted';
        }
      }
      return false;
    } catch (err) {
      console.warn('Error checking directory permission:', err);
      return false;
    }
  }

  async scanDirectoryHandle(
    dirHandle: FileSystemDirectoryHandle,
    currentPath = ''
  ): Promise<FileEntryItem[]> {
    const fileEntries: FileEntryItem[] = [];
    const handleLike = dirHandle as unknown as DirectoryHandleLike;

    if (typeof handleLike.values === 'function') {
      for await (const entry of handleLike.values()) {
        const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
        if (entry.kind === 'file') {
          if (entry.name.toLowerCase().endsWith('.json') && typeof entry.getFile === 'function') {
            try {
              const file = await entry.getFile();
              fileEntries.push({ file, relativePath: entryPath });
            } catch (e) {
              console.warn('Failed to read file from handle:', entry.name, e);
            }
          }
        } else if (entry.kind === 'directory') {
          try {
            const subFiles = await this.scanDirectoryHandle(entry as unknown as FileSystemDirectoryHandle, entryPath);
            fileEntries.push(...subFiles);
          } catch (e) {
            console.warn('Failed to scan subfolder:', entry.name, e);
          }
        }
      }
    }
    return fileEntries;
  }
}
