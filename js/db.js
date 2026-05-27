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
