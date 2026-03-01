// IndexedDB utility for offline check-in storage

const DB_NAME = 'checkin-offline-db';
const DB_VERSION = 1;
const STORE_NAME = 'pending-checkins';

export interface PendingCheckIn {
  id: string;
  ticketId: string | null;
  userId: string;
  eventId: string;
  adminId: string;
  name: string;
  isWalkIn: boolean;
  timestamp: string;
  synced: boolean;
}

let dbInstance: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('eventId', 'eventId', { unique: false });
        store.createIndex('synced', 'synced', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
  });
};

export const addPendingCheckIn = async (checkIn: Omit<PendingCheckIn, 'id' | 'synced'>): Promise<PendingCheckIn> => {
  const db = await openDB();
  const id = `${checkIn.eventId}-${checkIn.userId}-${Date.now()}`;
  const record: PendingCheckIn = { ...checkIn, id, synced: false };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(record);

    request.onsuccess = () => resolve(record);
    request.onerror = () => reject(request.error);
  });
};

export const getPendingCheckIns = async (eventId?: string): Promise<PendingCheckIn[]> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    
    if (eventId) {
      const index = store.index('eventId');
      const request = index.getAll(eventId);
      request.onsuccess = () => resolve(request.result.filter(r => !r.synced));
      request.onerror = () => reject(request.error);
    } else {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.filter(r => !r.synced));
      request.onerror = () => reject(request.error);
    }
  });
};

export const markAsSynced = async (id: string): Promise<void> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const record = getRequest.result;
      if (record) {
        record.synced = true;
        const putRequest = store.put(record);
        putRequest.onsuccess = () => resolve();
        putRequest.onerror = () => reject(putRequest.error);
      } else {
        resolve();
      }
    };
    getRequest.onerror = () => reject(getRequest.error);
  });
};

export const clearSyncedCheckIns = async (): Promise<void> => {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('synced');
    const request = index.openCursor(IDBKeyRange.only(true));

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    request.onerror = () => reject(request.error);
  });
};

export const isUserPendingCheckIn = async (eventId: string, userId: string): Promise<boolean> => {
  const pending = await getPendingCheckIns(eventId);
  return pending.some(p => p.userId === userId);
};

export const getPendingCount = async (eventId?: string): Promise<number> => {
  const pending = await getPendingCheckIns(eventId);
  return pending.length;
};
