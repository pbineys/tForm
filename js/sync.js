/**
 * Connection Status and Sync Manager for Field Reporting Form
 */

// Default URL placeholder - user can configure this in the UI
const DEFAULT_SCRIPT_URL_KEY = 'field_reports_apps_script_url';

let isSyncing = false;

/**
 * Gets the configured Google Apps Script Web App URL.
 * @returns {string|null}
 */
function getScriptUrl() {
  return 'https://script.google.com/macros/s/AKfycbyMDNF2DOGG2j2CGwbbqSFKPkq50bcKxghNYQ0TROM53bH_26I7t8-H_CCg_LjBSV9D/exec';
}

/**
 * Saves the Google Apps Script Web App URL to localStorage.
 * @param {string} url 
 */
function saveScriptUrl(url) {
  if (url) {
    localStorage.setItem(DEFAULT_SCRIPT_URL_KEY, url.trim());
  } else {
    localStorage.removeItem(DEFAULT_SCRIPT_URL_KEY);
  }
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
      isSyncing = false;
      document.dispatchEvent(new CustomEvent('syncStateChange', { detail: { syncing: false } }));
      return { successCount, failCount };
    }

    console.log(`Starting sync for ${queuedSubmissions.length} submissions...`);

    for (const submission of queuedSubmissions) {
      try {
        // Strip out metadata not needed by the spreadsheet (like the local IndexedDB ID)
        const { id, ...dataToUpload } = submission;
        
        // Add absolute date of upload for sheet integrity
        dataToUpload.uploadedAt = new Date().toISOString();

        // Send request as text/plain to bypass CORS preflight checks (standard Apps Script POST best-practice)
        try {
          const response = await fetch(scriptUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'text/plain'
            },
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
            throw new Error('Invalid response from server. Check if your Apps Script is deployed with "Who has access: Anyone"');
          }

          if (result.status === 'success') {
            // Successfully synced, remove from IndexedDB
            await deleteSubmission(id);
            successCount++;
          } else {
            throw new Error(result.message || 'Apps Script returned failure status');
          }
        } catch (syncErr) {
          console.error(`Sync failed for ID ${id}:`, syncErr);
          failCount++;
          break; // Stop sync queue processing to prevent cascade hammering
        }

      } catch (err) {
        console.error(`Failed to sync submission ID ${submission.id}:`, err);
        failCount++;
        // Stop processing subsequent items to avoid cascading errors or hammering the endpoint
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
    // Dispatch a general event to refresh the submission list display
    document.dispatchEvent(new CustomEvent('queueUpdated'));
  }

  return { successCount, failCount };
}

// Set up connection event listeners
window.addEventListener('online', () => {
  console.log('Connection restored. Network status is ONLINE.');
  document.dispatchEvent(new CustomEvent('networkStatusChange', { detail: { online: true } }));
  // Wait a short duration to ensure stable connection before initiating sync
  setTimeout(syncQueuedReports, 2000);
});

window.addEventListener('offline', () => {
  console.log('Connection lost. Network status is OFFLINE.');
  document.dispatchEvent(new CustomEvent('networkStatusChange', { detail: { online: false } }));
});
