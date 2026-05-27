/**
 * Core UI Logic, Validation, Consent Screen, and Geolocation Manager
 */

// Global State
let userCoordinates = null;
let locationStatus = 'pending'; // 'pending' | 'granted' | 'denied'

// DOM Elements (Loaded on DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  checkConsent();
  setupEventListeners();
  updateOfflineSubmissionsUI();
  
  // Try to recover script URL in input field if present
  const scriptUrlInput = document.getElementById('settings-script-url');
  if (scriptUrlInput) {
    scriptUrlInput.value = getScriptUrl();
  }
});

/**
 * Theme Manager (Automatic matching system pref + Manual Toggle)
 */
function initializeTheme() {
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    updateThemeToggleButton(true);
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
    updateThemeToggleButton(false);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
    updateThemeToggleButton(false);
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    updateThemeToggleButton(true);
  }
}

function updateThemeToggleButton(isDark) {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = isDark 
      ? '<span aria-hidden="true">☀️</span><span class="sr-only">Switch to Light Theme</span>' 
      : '<span aria-hidden="true">🌙</span><span class="sr-only">Switch to Dark Theme</span>';
  }
}

/**
 * Consent Gatekeeper Manager
 */
function checkConsent() {
  const hasConsented = localStorage.getItem('field_reports_consent_given');
  const consentOverlay = document.getElementById('consent-overlay');
  const mainContent = document.getElementById('main-content');
  
  if (hasConsented === 'true') {
    if (consentOverlay) consentOverlay.classList.add('hidden');
    if (mainContent) mainContent.style.display = 'block';
    // Automatically trigger geolocation capture
    requestGeolocation();
  } else if (hasConsented === 'false') {
    if (consentOverlay) consentOverlay.classList.add('hidden');
    showLockScreen();
  } else {
    // Show consent overlay, hide main app interface
    if (consentOverlay) consentOverlay.classList.remove('hidden');
    if (mainContent) mainContent.style.display = 'none';
  }
}

function handleAcceptConsent() {
  localStorage.setItem('field_reports_consent_given', 'true');
  const consentOverlay = document.getElementById('consent-overlay');
  const mainContent = document.getElementById('main-content');
  
  if (consentOverlay) consentOverlay.classList.add('hidden');
  if (mainContent) mainContent.style.display = 'block';
  
  showToast('Consent accepted. Initializing application...', 'info');
  requestGeolocation();
}

function handleDeclineConsent() {
  localStorage.setItem('field_reports_consent_given', 'false');
  const consentOverlay = document.getElementById('consent-overlay');
  if (consentOverlay) consentOverlay.classList.add('hidden');
  showLockScreen();
}

function showLockScreen() {
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.style.display = 'block';
    mainContent.innerHTML = `
      <main class="lock-screen" role="alert">
        <div class="lock-icon" aria-hidden="true">🔒</div>
        <h2>Access Denied</h2>
        <p>You have declined data collection and geolocation consent. To use this reporting system, consent is required under educational reporting compliance.</p>
        <button class="btn btn-primary" onclick="resetConsent()">Clear Decision and Try Again</button>
      </main>
    `;
  }
}

function resetConsent() {
  localStorage.removeItem('field_reports_consent_given');
  window.location.reload();
}

/**
 * Geolocation Manager
 */
function requestGeolocation() {
  const badge = document.getElementById('location-badge');
  updateLocationBadge('pending', 'Requesting Geolocation coordinates...');

  if (!navigator.geolocation) {
    updateLocationBadge('denied', 'Geolocation is not supported by your browser.');
    showToast('Geolocation is not supported by this browser. Location capture failed.', 'error');
    return;
  }

  const options = {
    enableHighAccuracy: true,
    timeout: 12000,
    maximumAge: 0
  };

  // Helper returning a Promise for a single position request
  const getPos = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

  const maxAttempts = 3;
  let bestPos = null;
  let bestAccuracy = Infinity;
  let attempt = 0;

  const tryGet = async () => {
    try {
      const pos = await getPos();
      const acc = pos.coords.accuracy;
      if (acc < bestAccuracy) {
        bestAccuracy = acc;
        bestPos = pos;
      }
    } catch (err) {
      // ignore individual attempt errors, will handle after all attempts
    }
    attempt++;
    if (attempt < maxAttempts) {
      return tryGet();
    }
  };

  tryGet().then(() => {
    if (bestPos) {
      userCoordinates = {
        lat: bestPos.coords.latitude.toFixed(6),
        lng: bestPos.coords.longitude.toFixed(6),
        accuracy: bestPos.coords.accuracy.toFixed(1)
      };
      locationStatus = 'granted';
      updateLocationBadge('granted', `Location captured: ${userCoordinates.lat}, ${userCoordinates.lng} (±${userCoordinates.accuracy}m)`);
      showToast('Device location acquired with best accuracy.', 'success');
    } else {
      // All attempts failed
      locationStatus = 'denied';
      const errorMsg = 'Unable to obtain location after multiple attempts.';
      updateLocationBadge('denied', errorMsg);
      showToast(errorMsg, 'error');
    }
  });
}

function updateLocationBadge(status, text) {
  const badge = document.getElementById('location-badge');
  if (!badge) return;

  badge.className = `location-status-badge ${status}`;
  
  let icon = '🟡';
  if (status === 'granted') icon = '🟢';
  if (status === 'denied') icon = '🔴';
  
  badge.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${text}</span>`;
}

/**
 * Duration Auto-Calculator
 */
function calculateDuration() {
  const startDateInput = document.getElementById('start-date');
  const closingTimeInput = document.getElementById('closing-time');
  const durationInput = document.getElementById('duration');
  
  if (!startDateInput || !closingTimeInput || !durationInput) return;

  const startVal = startDateInput.value;
  const closeVal = closingTimeInput.value;

  // Clear previous errors
  const group = closingTimeInput.closest('.form-group');
  if (group) group.classList.remove('has-error');

  if (!startVal || !closeVal) {
    durationInput.value = '';
    return;
  }

  const start = new Date(startVal);
  const close = new Date(closeVal);

  if (isNaN(start.getTime()) || isNaN(close.getTime())) {
    durationInput.value = '';
    return;
  }

  if (close <= start) {
    durationInput.value = '';
    if (group) {
      group.classList.add('has-error');
      const err = group.querySelector('.error-message');
      if (err) err.textContent = 'Closing Time must be after the Start Date.';
    }
    return;
  }

  const diffMs = close - start;
  const diffMins = Math.round(diffMs / 60000);
  
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;

  let text = '';
  if (hours > 0) {
    text += `${hours} hour${hours > 1 ? 's' : ''} `;
  }
  if (mins > 0 || hours === 0) {
    text += `${mins} min${mins > 1 ? 's' : ''}`;
  }

  durationInput.value = text.trim();
}

/**
 * Form Validation Engine (Zod-style client rules)
 */
function validateForm() {
  let isValid = true;
  const errors = {};

  // Helper to check fields
  const validateField = (id, checkFn, errorMsg) => {
    const input = document.getElementById(id);
    if (!input) return;

    const group = input.closest('.form-group');
    if (!group) return;

    const value = input.value.trim();
    const isFieldValid = checkFn(value, input);

    if (!isFieldValid) {
      group.classList.add('has-error');
      const errEl = group.querySelector('.error-message');
      if (errEl) errEl.textContent = errorMsg;
      errors[id] = errorMsg;
      isValid = false;
    } else {
      group.classList.remove('has-error');
    }
  };

  // 1. Officer Name (Required, alphanumeric)
  validateField('officer-name', 
    (val) => val.length > 0 && /^[a-zA-Z0-9\s.\-]+$/.test(val), 
    'Officer name is required and should be alphanumeric.'
  );

  // 2. Schedule (Required dropdown)
  validateField('schedule', 
    (val) => val.length > 0, 
    'Please select a schedule.'
  );

  // 3. Date of Visit (Required, past/present date only)
  validateField('visit-date', 
    (val) => {
      if (!val) return false;
      const d = new Date(val);
      const today = new Date();
      // Reset hours to compare only date parts accurately
      d.setHours(0,0,0,0);
      today.setHours(23,59,59,999);
      return !isNaN(d.getTime()) && d <= today;
    }, 
    'Date of Visit is required and cannot be in the future.'
  );

  // 4. School Visited (Required)
  validateField('school-visited', 
    (val) => val.length > 0, 
    'School/Station/Office visited is required.'
  );

  // 5. Circuit (Required dropdown)
  validateField('circuit', 
    (val) => val.length > 0, 
    'Please select a circuit/location.'
  );

  // 6. Activity Name (Required dropdown)
  validateField('activity-name', 
    (val) => val.length > 0, 
    'Please select an activity type.'
  );

  // 7. Purpose of the Activity (Required, min 20 chars)
  validateField('purpose', 
    (val) => val.length >= 20, 
    'Purpose is required and must be at least 20 characters.'
  );

  // 8. Major Activities (Required)
  validateField('major-activities', 
    (val) => val.length > 0, 
    'Please list major activities performed.'
  );

  // 9. Teachers Present (Required, >0)
  validateField('teachers-present', 
    (val) => {
      const num = parseInt(val, 10);
      return !isNaN(num) && num > 0;
    }, 
    'Number of participants present must be a positive integer greater than 0.'
  );

  // 10. Teachers Absent (Required, >=0)
  validateField('teachers-absent', 
    (val) => {
      const num = parseInt(val, 10);
      return !isNaN(num) && num >= 0;
    }, 
    'Number of participants absent must be an integer greater than or equal to 0.'
  );

  // 11. Start Date (Required)
  validateField('start-date', 
    (val) => val.length > 0, 
    'Start Date and Time are required.'
  );

  // 12. Closing Time (Required, must be after start-date)
  validateField('closing-time', 
    (val) => {
      if (!val) return false;
      const start = document.getElementById('start-date').value;
      if (!start) return true; // Start will trigger its own error
      return new Date(val) > new Date(start);
    }, 
    'Closing Time is required and must be after the Start Date.'
  );

  // Focus the first error field for accessibility
  const errorKeys = Object.keys(errors);
  if (errorKeys.length > 0) {
    const firstErrInput = document.getElementById(errorKeys[0]);
    if (firstErrInput) {
      firstErrInput.focus();
      firstErrInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('Please correct validation errors on the form.', 'error');
  }

  // Double check geolocation coordinates availability (warn if missing but do not block)
  if (isValid && !userCoordinates) {
    showToast('Warning: Device Geolocation is active but coordinates are currently unavailable. Submitting as "Unavailable".', 'warning');
  }

  return isValid;
}

/**
 * Handle Form Submission
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  
  if (!validateForm()) return;

  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  // Retrieve coordinates safely (do not crash if null)
  const coordsString = userCoordinates 
    ? `${userCoordinates.lat}, ${userCoordinates.lng}` 
    : "Unavailable (GPS Failed)";
  const coordsAccuracy = userCoordinates 
    ? `${userCoordinates.accuracy}m` 
    : "N/A";

  // Retrieve form values
  const reportData = {
    officerName: document.getElementById('officer-name').value.trim(),
    schedule: document.getElementById('schedule').value,
    visitDate: document.getElementById('visit-date').value,
    schoolVisited: document.getElementById('school-visited').value.trim(),
    circuit: document.getElementById('circuit').value,
    activityName: document.getElementById('activity-name').value,
    purpose: document.getElementById('purpose').value.trim(),
    majorActivities: document.getElementById('major-activities').value.trim(),
    presentCount: parseInt(document.getElementById('teachers-present').value, 10),
    absentCount: parseInt(document.getElementById('teachers-absent').value, 10),
    organizers: document.getElementById('organizers').value.trim() || 'N/A',
    venue: document.getElementById('venue').value.trim() || 'N/A',
    topicArea: document.getElementById('topic-area').value.trim() || 'N/A',
    summary: document.getElementById('summary').value.trim() || 'N/A',
    startDate: document.getElementById('start-date').value,
    closingTime: document.getElementById('closing-time').value,
    duration: document.getElementById('duration').value,
    coordinates: coordsString,
    coordinatesAccuracy: coordsAccuracy
  };

  const appsScriptUrl = getScriptUrl();
  
  // Case A: App is offline or Google Apps Script is not configured yet
  if (!isOnline() || !appsScriptUrl) {
    try {
      await saveSubmission(reportData);
      
      let toastMsg = 'Report queued locally. ';
      if (!appsScriptUrl) {
        toastMsg += 'Awaiting Google Apps Script URL setup.';
      } else {
        toastMsg += 'It will automatically sync when connection is restored.';
      }

      showToast(toastMsg, 'info');
      resetForm();
      updateOfflineSubmissionsUI();
    } catch (err) {
      showToast('Failed to queue report locally.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    return;
  }

  // Case B: App is online and ready
  showToast('Submitting report to server...', 'info');
  
  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify(reportData)
    });

    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`);
    }

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      throw new Error('Invalid response from server. Check if your Apps Script is deployed with "Who has access: Anyone"');
    }

    if (result.status === 'success') {
      showToast('Report submitted successfully to Google Sheets!', 'success');
      resetForm();
    } else {
      throw new Error(result.message || 'Server error during submission');
    }
  } catch (err) {
    console.error('Submission error:', err);
    try {
      await saveSubmission(reportData);
      showToast('Failed: ' + err.message + '. Report saved to offline queue.', 'warning');
      resetForm();
      updateOfflineSubmissionsUI();
    } catch (dbErr) {
      showToast('Critical error: Could not save report offline.', 'error');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetForm() {
  const form = document.getElementById('report-form');
  if (form) form.reset();
  
  // Re-enable duration calc triggers & clear duration text
  const durationInput = document.getElementById('duration');
  if (durationInput) durationInput.value = '';

  // Trigger geo recapturing to refresh validation tokens
  requestGeolocation();
}

/**
 * Offline Submissions Queue UI Manager
 */
async function updateOfflineSubmissionsUI() {
  const countBadge = document.getElementById('offline-count-badge');
  const submissionsContainer = document.getElementById('submissions-queue');
  
  if (!submissionsContainer) return;

  try {
    const queuedList = await getQueuedSubmissions();
    const count = queuedList.length;

    // Update Dashboard Header Badge
    if (countBadge) {
      countBadge.textContent = count;
      countBadge.className = count > 0 ? 'badge offline-count' : 'badge';
    }

    // Render Queue Lists
    if (count === 0) {
      submissionsContainer.innerHTML = `
        <div style="padding: 1.5rem; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
          No reports currently in offline queue.
        </div>
      `;
      return;
    }

    let html = '';
    queuedList.forEach((item) => {
      const date = new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      html += `
        <div class="submission-item" id="queue-item-${item.id}">
          <div class="submission-info">
            <h4>${escapeHTML(item.schoolVisited)}</h4>
            <p>${escapeHTML(item.officerName)} • Visited: ${item.visitDate} • Created: ${date}</p>
          </div>
          <div class="submission-status">
            <span style="color: var(--warning-color); font-weight: 600;">⏳ Queue</span>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; border-radius: var(--border-radius-sm);" 
              onclick="deleteLocalReport(${item.id})" aria-label="Delete queued report for ${escapeHTML(item.schoolVisited)}">
              Delete
            </button>
          </div>
        </div>
      `;
    });
    
    submissionsContainer.innerHTML = html;

  } catch (err) {
    console.error('Failed to draw queued list UI:', err);
  }
}

async function deleteLocalReport(id) {
  if (confirm('Are you sure you want to delete this locally queued report? This cannot be undone.')) {
    try {
      await deleteSubmission(id);
      showToast('Local report deleted.', 'info');
      updateOfflineSubmissionsUI();
    } catch (err) {
      showToast('Could not delete local report.', 'error');
    }
  }
}

/**
 * Toast Notification System
 */
function showToast(message, type = 'info') {
  const toast = document.getElementById('global-toast');
  if (!toast) return;

  toast.className = `global-toast visible ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${message}</span>`;

  // Auto hide after 4 seconds
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

/**
 * Event Listeners & Hooks Setup
 */
function setupEventListeners() {
  // Theme Toggle Button
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

  // Consent Screen Actions
  const btnAccept = document.getElementById('btn-accept-consent');
  if (btnAccept) btnAccept.addEventListener('click', handleAcceptConsent);

  const btnDecline = document.getElementById('btn-decline-consent');
  if (btnDecline) btnDecline.addEventListener('click', handleDeclineConsent);

  // Recapture location on badge click
  const badge = document.getElementById('location-badge');
  if (badge) badge.addEventListener('click', requestGeolocation);

  // Auto Duration listeners
  const startDate = document.getElementById('start-date');
  const closingTime = document.getElementById('closing-time');
  if (startDate) startDate.addEventListener('change', calculateDuration);
  if (closingTime) closingTime.addEventListener('change', calculateDuration);

  // Form submission
  const form = document.getElementById('report-form');
  if (form) form.addEventListener('submit', handleFormSubmit);

  // Settings script URL edit UI
  const btnSaveSettings = document.getElementById('btn-save-settings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      const input = document.getElementById('settings-script-url');
      if (input) {
        saveScriptUrl(input.value);
        showToast('Google Apps Script URL updated successfully.', 'success');
        // Trigger sync immediately if online
        if (isOnline()) syncQueuedReports();
      }
    });
  }

  // Listen to network changes from sync.js
  document.addEventListener('networkStatusChange', (e) => {
    const online = e.detail.online;
    showToast(online ? 'Connection restored. Online.' : 'Network offline. submissions will queue locally.', online ? 'success' : 'warning');
    const netBar = document.getElementById('network-bar');
    if (netBar) {
      if (online) netBar.classList.remove('offline');
      else netBar.classList.add('offline');
    }
  });

  // Listen to sync events
  document.addEventListener('syncStateChange', (e) => {
    const statusText = document.getElementById('sync-status-text');
    if (!statusText) return;

    if (e.detail.syncing) {
      statusText.innerHTML = `<span class="sync-spinner" aria-hidden="true"></span> Syncing queue with Google Sheets...`;
    } else {
      statusText.textContent = '';
      if (e.detail.successCount > 0) {
        showToast(`Synced ${e.detail.successCount} local reports to Google Sheets.`, 'success');
      }
      if (e.detail.failCount > 0) {
        showToast(`Sync warning: ${e.detail.failCount} reports failed to upload.`, 'warning');
      }
    }
  });

  // Listen for generic queue update notifications
  document.addEventListener('queueUpdated', updateOfflineSubmissionsUI);
}

/**
 * XSS Protection helper
 */
function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
