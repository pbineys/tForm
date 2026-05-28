/**
 * Connection Status and Sync Manager for Field Reporting Form
 */

// Embedded Google Apps Script Web App URL
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyMDNF2DOGG2j2CGwbbqSFKPkq50bcKxghNYQ0TROM53bH_26I7t8-H_CCg_LjBSV9D/exec';

let isSyncing = false;

/**
 * Gets the embedded Google Apps Script Web App URL.
 * @returns {string}
 */
function getScriptUrl() {
  return SCRIPT_URL;
}

/**
 * Checks if the browser is currently online.
 * @returns {boolean}
 */
function isOnline() {
  return navigator.onLine;
}

/**
 * Performs synchronization of queued submissions from IndexedDB to Google Sheets.
 * @returns {Promise<{successCount: number, failCount: number}>}
 */
async function syncQueuedReports() {
  const scriptUrl = getScriptUrl();

  if (!scriptUrl) {
    console.warn('Sync aborted: Google Apps Script URL is not configured.');
    return { successCount: 0, failCount: 0 };
  }

  if (!isOnline()) {
    console.log('Sync aborted: Offline.');
    return { successCount: 0, failCount: 0 };
  }

  if (isSyncing) {
    console.log('Sync already in progress...');
    return { successCount: 0, failCount: 0 };
  }

  isSyncing = true;
  document.dispatchEvent(new CustomEvent('syncStateChange', { detail: { syncing: true } }));

  let successCount = 0;
  let failCount = 0;

  try {
    const queuedSubmissions = await getQueuedSubmissions();

    if (queuedSubmissions.length === 0) {
      console.log('Sync completed: No queued submissions to upload.');
      return { successCount, failCount };
    }

    console.log(`Starting sync for ${queuedSubmissions.length} submissions...`);

    for (const submission of queuedSubmissions) {
      // Strip out metadata not needed by the spreadsheet (like the local IndexedDB ID)
      const { id, ...dataToUpload } = submission;

      // Add absolute date of upload for sheet integrity
      dataToUpload.uploadedAt = new Date().toISOString();

      try {
        // Send as text/plain to bypass CORS preflight checks (Apps Script POST best-practice)
        const response = await fetch(scriptUrl, {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify(dataToUpload)
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const responseText = await response.text();
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          throw new Error('Invalid response from server. Check Apps Script deployment access.');
        }

        if (result.status === 'success') {
          await deleteSubmission(id);
          successCount++;
        } else {
          throw new Error(result.message || 'Apps Script returned failure status');
        }

      } catch (syncErr) {
        // Log the error for this item and stop the queue to avoid hammering the endpoint
        console.error(`Sync failed for submission ID ${id}:`, syncErr);
        failCount++;
        break;
      }
    }

  } catch (err) {
    console.error('Error during sync routine:', err);
  } finally {
    isSyncing = false;
    document.dispatchEvent(new CustomEvent('syncStateChange', {
      detail: { syncing: false, successCount, failCount }
    }));
    // Refresh the submission queue UI
    document.dispatchEvent(new CustomEvent('queueUpdated'));
  }

  return { successCount, failCount };
}

// Set up connection event listeners
window.addEventListener('online', () => {
  console.log('Connection restored. Network status is ONLINE.');
  document.dispatchEvent(new CustomEvent('networkStatusChange', { detail: { online: true } }));
  // Wait briefly to ensure stable connection before initiating sync
  setTimeout(syncQueuedReports, 2000);
});

window.addEventListener('offline', () => {
  console.log('Connection lost. Network status is OFFLINE.');
  document.dispatchEvent(new CustomEvent('networkStatusChange', { detail: { online: false } }));
});
