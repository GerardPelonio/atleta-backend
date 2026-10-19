/**
 * Persistent Client-Side Scoresheet Storage Engine (IndexedDB)
 * Ensures uploaded multi-page scoresheet files persist across browser reloads,
 * tab closures, and navigation without expiring like ephemeral blob URLs and
 * without hitting Firestore's 1MB document limit or localStorage's 5MB quota.
 */

const DB_NAME = 'atleta_scoresheet_cache';
const STORE_NAME = 'scoresheet_files';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB not available in current environment.'));
    }
    const req = window.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'matchId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface StoredScoresheetRecord {
  matchId: string;
  files: Array<{
    name: string;
    type: string;
    blob: Blob;
    dataUrl?: string;
  }>;
  updatedAt: number;
}

/**
 * Persist match scoresheet files into IndexedDB so they never turn into errors.
 */
export async function saveScoresheetFilesToIndexedDB(
  matchId: string,
  inputFiles: (File | Blob)[]
): Promise<void> {
  if (!matchId || !inputFiles || inputFiles.length === 0) return;
  const cleanId = matchId.replace(/^#/, '');

  try {
    const db = await openDb();
    const storedFiles = await Promise.all(
      inputFiles.map(async (file, idx) => {
        const name = (file as File).name || `scoresheet_page_${idx + 1}`;
        const type = file.type || 'image/jpeg';
        return {
          name,
          type,
          blob: file,
        };
      })
    );

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        matchId: cleanId,
        files: storedFiles,
        updatedAt: Date.now(),
      });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[ScoresheetStorage] Could not persist files to IndexedDB:', err);
  }
}

/**
 * Retrieve persistent scoresheet files and generate fresh, active Object URLs.
 */
export async function getScoresheetFilesFromIndexedDB(
  matchId: string
): Promise<Array<{ name: string; type: string; url: string; isPdf: boolean }>> {
  if (!matchId) return [];
  const cleanId = matchId.replace(/^#/, '');

  try {
    const db = await openDb();
    const record = await new Promise<StoredScoresheetRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(cleanId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!record || !Array.isArray(record.files) || record.files.length === 0) {
      return [];
    }

    return record.files.map((item, idx) => {
      const isPdf = item.type === 'application/pdf' || (item.name || '').toLowerCase().endsWith('.pdf');
      const freshUrl = URL.createObjectURL(item.blob);
      return {
        name: item.name || `Scoresheet Page ${idx + 1}`,
        type: item.type,
        url: freshUrl,
        isPdf,
      };
    });
  } catch {
    return [];
  }
}
