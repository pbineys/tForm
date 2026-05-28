/**
 * Offline-First IndexedDB Manager for Field Reporting Form
 */

const DB_NAME = 'field-reports-db';
const DB_VERSION = 1;
const STORE_NAME = 'submissions';

let dbInstance = null;

/**
 * Initializes the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function initDB() {
  if (dbInstance) return Promise.resolve(dbInstance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database failed to open:', event.target.error);
      reject(event.target.error);
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('Database initialized successfully');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        console.log(`Object store '${STORE_NAME}' created`);
      }
      // Drafts store for auto‑save of in‑progress form
      const DRAFT_STORE = 'drafts';
      if (!db.objectStoreNames.contains(DRAFT_STORE)) {
        db.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
        console.log(`Object store '${DRAFT_STORE}' created`);
      }
    };
  });
}

/**
 * Saves a new submission to the offline queue.
 * @param {Object} submissionData 
 * @returns {Promise<number>} The ID of the inserted submission
 */
async function saveSubmission(submissionData) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    // Add metadata for syncing
    const record = {
      ...submissionData,
      createdAt: new Date().toISOString(),
      synced: false
    };

    const request = store.add(record);

    request.onsuccess = (event) => {
      console.log('Submission queued locally. ID:', event.target.result);
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('Error queueing submission:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Retrieves all queued (unsynced) submissions.
 * @returns {Promise<Array<Object>>}
 */
async function getQueuedSubmissions() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      console.error('Error fetching queued submissions:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Deletes a submission from the store by its ID.
 * @param {number} id 
 * @returns {Promise<void>}
 */
async function deleteSubmission(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      console.log('Submission cleared from local queue. ID:', id);
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error deleting submission:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Initialize database on load
initDB().catch(err => console.error('Auto-initialization of DB failed:', err));

/**
 * Save a draft of the current form state.
 * @param {Object} data
 * @returns {Promise<void>}
 */
function saveDraft(data) {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts'], 'readwrite');
      const store = tx.objectStore('drafts');
      const request = store.put({ id: 'current', data });
      request.onsuccess = () => resolve();
      request.onerror = e => reject(e);
    });
  });
}

/**
 * Load the saved draft, if any.
 * @returns {Promise<Object|null>}
 */
function loadDraft() {
  return initDB().then(db => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['drafts'], 'readonly');
      const store = tx.objectStore('drafts');
      const request = store.get('current');
      request.onsuccess = e => {
        const result = e.target.result;
        resolve(result ? result.data : null);
      };
      request.onerror = e => reject(e);
    });
  });
}
