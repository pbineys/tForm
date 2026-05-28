/**
 * Core UI Logic: Consent, Theme, Geolocation, Pagination, Validation, Submission, Draft Auto-save
 */

// ─── Global State ──────────────────────────────────────────────────────────────
let userCoordinates = null;
let locationStatus = 'pending'; // 'pending' | 'granted' | 'denied'

// Pagination state
const TOTAL_STEPS = 5;
let currentStep = 1;

// Draft auto-save debounce timer
let draftSaveTimer = null;
const DRAFT_DEBOUNCE_MS = 1500;

// ─── DOMContentLoaded Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  checkConsent();
  setupEventListeners();
  updateOfflineSubmissionsUI();
});

// ─── Theme Manager ─────────────────────────────────────────────────────────────
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
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  updateThemeToggleButton(!isDark);
}

function updateThemeToggleButton(isDark) {
  const toggleBtn = document.getElementById('theme-toggle');
  if (toggleBtn) {
    toggleBtn.innerHTML = isDark
      ? '<span aria-hidden="true">☀️</span><span class="sr-only">Switch to Light Theme</span>'
      : '<span aria-hidden="true">🌙</span><span class="sr-only">Switch to Dark Theme</span>';
  }
}

// ─── Consent Gatekeeper ────────────────────────────────────────────────────────
function checkConsent() {
  const hasConsented = localStorage.getItem('field_reports_consent_given');
  const consentOverlay = document.getElementById('consent-overlay');
  const mainContent = document.getElementById('main-content');

  if (hasConsented === 'true') {
    if (consentOverlay) consentOverlay.classList.add('hidden');
    if (mainContent) mainContent.style.display = 'block';
    requestGeolocation();
    setDefaultVisitDate();
    initPagination();
    tryRestoreDraft();
  } else if (hasConsented === 'false') {
    if (consentOverlay) consentOverlay.classList.add('hidden');
    showLockScreen();
  } else {
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
  setDefaultVisitDate();
  initPagination();
  tryRestoreDraft();
}

function handleDeclineConsent() {
  localStorage.setItem('field_reports_consent_given', 'false');
  const consentOverlay = document.getElementById('consent-overlay');
  if (consentOverlay) consentOverlay.classList.add('hidden');
  showLockScreen();
}

function showLockScreen() {
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  mainContent.style.display = 'block';

  // Build lock screen without using inline onclick — we attach the listener after
  const lockEl = document.createElement('main');
  lockEl.className = 'lock-screen';
  lockEl.setAttribute('role', 'alert');
  lockEl.innerHTML = `
    <div class="lock-icon" aria-hidden="true">🔒</div>
    <h2>Access Denied</h2>
    <p>You have declined data collection and geolocation consent. To use this reporting system, consent is required under educational reporting compliance.</p>
    <button class="btn btn-primary" id="btn-reset-lock">Clear Decision and Try Again</button>
  `;
  // Replace only the inner content, preserving the container
  mainContent.innerHTML = '';
  mainContent.appendChild(lockEl);

  document.getElementById('btn-reset-lock').addEventListener('click', resetConsent);
}

function resetConsent() {
  localStorage.removeItem('field_reports_consent_given');
  window.location.reload();
}

// ─── Geolocation Manager ───────────────────────────────────────────────────────
function requestGeolocation() {
  updateLocationBadge('pending', 'Requesting Geolocation coordinates...');

  if (!navigator.geolocation) {
    updateLocationBadge('denied', 'Geolocation is not supported by your browser.');
    showToast('Geolocation is not supported by this browser.', 'error');
    return;
  }

  const options = { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 };
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 500;

  let bestPos = null;
  let bestAccuracy = Infinity;

  const getPos = () => new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });

  const attempt = async (attemptsLeft) => {
    try {
      const pos = await getPos();
      if (pos.coords.accuracy < bestAccuracy) {
        bestAccuracy = pos.coords.accuracy;
        bestPos = pos;
      }
    } catch (_) {
      // Ignore per-attempt errors; handle after all attempts
    }

    if (attemptsLeft > 1) {
      await new Promise(res => setTimeout(res, RETRY_DELAY_MS));
      return attempt(attemptsLeft - 1);
    }
  };

  attempt(MAX_ATTEMPTS).then(() => {
    if (bestPos) {
      userCoordinates = {
        lat: bestPos.coords.latitude.toFixed(6),
        lng: bestPos.coords.longitude.toFixed(6),
        accuracy: bestPos.coords.accuracy.toFixed(1)
      };
      locationStatus = 'granted';
      updateLocationBadge('granted', `Location captured: ${userCoordinates.lat}, ${userCoordinates.lng} (±${userCoordinates.accuracy}m)`);
      showToast('Device location acquired.', 'success');
    } else {
      locationStatus = 'denied';
      updateLocationBadge('denied', 'Unable to obtain location. Tap to retry.');
      showToast('Location capture failed. You can still submit — location will be marked unavailable.', 'warning');
    }
  });
}

function updateLocationBadge(status, text) {
  const badge = document.getElementById('location-badge');
  if (!badge) return;
  badge.className = `location-status-badge ${status}`;
  const icon = status === 'granted' ? '🟢' : status === 'denied' ? '🔴' : '🟡';
  badge.innerHTML = `<span aria-hidden="true">${icon}</span> <span>${text}</span>`;
}

// ─── Default Date Helper ───────────────────────────────────────────────────────
function setDefaultVisitDate() {
  const visitDateInput = document.getElementById('visit-date');
  if (visitDateInput && !visitDateInput.value) {
    // Format as YYYY-MM-DD in local time (avoid UTC midnight parse issue)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    visitDateInput.value = `${yyyy}-${mm}-${dd}`;
  }
}

// ─── Pagination Engine ─────────────────────────────────────────────────────────
const STEP_META = [
  { label: 'Officer Details', icon: '👤' },
  { label: 'Objectives',      icon: '🎯' },
  { label: 'Headcount',       icon: '👥' },
  { label: 'Context',         icon: '📋' },
  { label: 'Timeframe',       icon: '⏱️' },
];

function initPagination() {
  currentStep = 1;
  renderStepIndicator();
  showStep(1);
}

function renderStepIndicator() {
  const indicator = document.getElementById('step-indicator');
  if (!indicator) return;

  indicator.innerHTML = STEP_META.map((meta, i) => {
    const stepNum = i + 1;
    const isCompleted = stepNum < currentStep;
    const isActive = stepNum === currentStep;
    const classes = ['step-dot', isCompleted ? 'completed' : '', isActive ? 'active' : ''].filter(Boolean).join(' ');
    return `
      <div class="${classes}" aria-label="Step ${stepNum}: ${meta.label}" ${isActive ? 'aria-current="step"' : ''}>
        <div class="step-dot-circle">
          ${isCompleted ? '✓' : stepNum}
        </div>
        <span class="step-dot-label">${meta.label}</span>
      </div>
      ${stepNum < TOTAL_STEPS ? '<div class="step-connector ' + (isCompleted ? 'completed' : '') + '"></div>' : ''}
    `;
  }).join('');
}

function showStep(step) {
  currentStep = step;

  // Show/hide pages
  document.querySelectorAll('.form-page').forEach(page => {
    const pageStep = parseInt(page.dataset.step, 10);
    page.classList.toggle('active', pageStep === step);
  });

  // Update nav buttons
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const btnSubmit = document.getElementById('submit-btn');

  if (btnPrev) btnPrev.style.display = step > 1 ? 'inline-flex' : 'none';
  if (btnNext) btnNext.style.display = step < TOTAL_STEPS ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display = step === TOTAL_STEPS ? 'inline-flex' : 'none';

  // Render review summary on last step
  if (step === TOTAL_STEPS) renderReviewPanel();

  // Update attendance summary on step 3
  if (step === 3) updateAttendanceSummary();

  renderStepIndicator();

  // Scroll form card into view smoothly
  document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function goNextStep() {
  if (!validateStep(currentStep)) return;
  if (currentStep < TOTAL_STEPS) showStep(currentStep + 1);
}

function goPrevStep() {
  if (currentStep > 1) showStep(currentStep - 1);
}

// ─── Per-Step Validation ───────────────────────────────────────────────────────

// Field-level validator helper: returns true if valid
function validateField(id, checkFn, errorMsg) {
  const input = document.getElementById(id);
  if (!input) return true; // Field not in DOM — skip

  const group = input.closest('.form-group');
  if (!group) return true;

  const value = input.value.trim();
  const valid = checkFn(value, input);

  group.classList.toggle('has-error', !valid);
  const errEl = document.getElementById(`${id}-error`);
  if (errEl) errEl.textContent = valid ? '' : errorMsg;

  return valid;
}

// Validates only the fields belonging to the given step number
function validateStep(step) {
  let valid = true;
  let firstInvalidId = null;

  const check = (id, fn, msg) => {
    const result = validateField(id, fn, msg);
    if (!result && !firstInvalidId) firstInvalidId = id;
    if (!result) valid = false;
  };

  if (step === 1) {
    check('officer-name',
      v => v.length > 0 && /^[a-zA-Z0-9\s.\-']+$/.test(v),
      'Officer name is required and should contain valid characters.');
    check('schedule',   v => v.length > 0, 'Please select a schedule.');
    check('visit-date', v => {
      if (!v) return false;
      // Parse as local date to avoid UTC midnight issue
      const d = new Date(v + 'T00:00:00');
      const today = new Date(); today.setHours(23, 59, 59, 999);
      return !isNaN(d.getTime()) && d <= today;
    }, 'Date of Visit is required and cannot be in the future.');
    check('school-visited', v => v.length > 0, 'School/Station/Office visited is required.');
    check('circuit',        v => v.length > 0, 'Please select a circuit/location.');
    check('activity-name',  v => v.length > 0, 'Please select an activity type.');
  }

  if (step === 2) {
    check('purpose',         v => v.length >= 20, 'Purpose is required and must be at least 20 characters.');
    check('major-activities',v => v.length > 0,   'Please list major activities performed.');
  }

  if (step === 3) {
    check('teachers-present', v => { const n = parseInt(v, 10); return !isNaN(n) && n > 0; },
      'Number of participants present must be a positive integer greater than 0.');
    check('teachers-absent',  v => { const n = parseInt(v, 10); return !isNaN(n) && n >= 0; },
      'Number of participants absent must be an integer greater than or equal to 0.');
  }

  if (step === 5) {
    check('start-date', v => v.length > 0, 'Start Date and Time are required.');
    check('closing-time', v => {
      if (!v) return false;
      const start = document.getElementById('start-date').value;
      if (!start) return true; // start-date will show its own error
      return new Date(v) > new Date(start);
    }, 'Closing Time is required and must be after the Start Date.');
  }

  if (!valid && firstInvalidId) {
    const firstEl = document.getElementById(firstInvalidId);
    if (firstEl) {
      firstEl.focus();
      firstEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast('Please correct the highlighted fields before continuing.', 'error');
  }

  return valid;
}

// Full validation across all steps (called on final submit)
function validateAllSteps() {
  let isValid = true;
  for (let s = 1; s <= TOTAL_STEPS; s++) {
    if (!validateStep(s)) isValid = false;
  }
  return isValid;
}

// ─── Attendance Summary ────────────────────────────────────────────────────────
function updateAttendanceSummary() {
  const presentInput = document.getElementById('teachers-present');
  const absentInput = document.getElementById('teachers-absent');
  const summaryGroup = document.getElementById('attendance-summary-group');
  const summaryEl = document.getElementById('attendance-summary');

  if (!presentInput || !absentInput || !summaryGroup || !summaryEl) return;

  const present = parseInt(presentInput.value, 10) || 0;
  const absent = parseInt(absentInput.value, 10) || 0;

  if (present > 0 || absent > 0) {
    const total = present + absent;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    summaryEl.innerHTML = `
      <div class="attendance-stat"><span class="stat-label">Total Expected</span><span class="stat-value">${total}</span></div>
      <div class="attendance-stat"><span class="stat-label">Present</span><span class="stat-value success">${present}</span></div>
      <div class="attendance-stat"><span class="stat-label">Absent</span><span class="stat-value error">${absent}</span></div>
      <div class="attendance-stat"><span class="stat-label">Attendance Rate</span><span class="stat-value">${pct}%</span></div>
    `;
    summaryGroup.style.display = 'block';
  } else {
    summaryGroup.style.display = 'none';
  }
}

// ─── Review Panel (Step 5) ─────────────────────────────────────────────────────
function renderReviewPanel() {
  const panel = document.getElementById('review-grid');
  if (!panel) return;

  const fields = [
    ['Officer Name', 'officer-name'],
    ['Schedule', 'schedule'],
    ['Date of Visit', 'visit-date'],
    ['School/Station', 'school-visited'],
    ['Circuit', 'circuit'],
    ['Activity', 'activity-name'],
    ['Present', 'teachers-present'],
    ['Absent', 'teachers-absent'],
    ['Organizers', 'organizers'],
    ['Venue', 'venue'],
  ];

  panel.innerHTML = fields.map(([label, id]) => {
    const el = document.getElementById(id);
    const val = el ? (el.value.trim() || '—') : '—';
    return `<div class="review-item"><span class="review-label">${label}</span><span class="review-value">${escapeHTML(val)}</span></div>`;
  }).join('');
}

// ─── Duration Auto-Calculator ──────────────────────────────────────────────────
function calculateDuration() {
  const startVal = document.getElementById('start-date')?.value;
  const closeVal = document.getElementById('closing-time')?.value;
  const durationInput = document.getElementById('duration');
  const closingGroup = document.getElementById('closing-time')?.closest('.form-group');

  if (!durationInput) return;
  if (closingGroup) closingGroup.classList.remove('has-error');

  if (!startVal || !closeVal) { durationInput.value = ''; return; }

  const start = new Date(startVal);
  const close = new Date(closeVal);

  if (isNaN(start.getTime()) || isNaN(close.getTime())) { durationInput.value = ''; return; }

  if (close <= start) {
    durationInput.value = '';
    if (closingGroup) {
      closingGroup.classList.add('has-error');
      const err = closingGroup.querySelector('.error-message');
      if (err) err.textContent = 'Closing Time must be after the Start Date.';
    }
    return;
  }

  const diffMins = Math.round((close - start) / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  let text = '';
  if (hours > 0) text += `${hours} hour${hours !== 1 ? 's' : ''} `;
  if (mins > 0 || hours === 0) text += `${mins} min${mins !== 1 ? 's' : ''}`;
  durationInput.value = text.trim();
}

// ─── Draft Auto-Save ───────────────────────────────────────────────────────────
function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    const data = collectFormData();
    saveDraft(data).catch(err => console.warn('Draft save failed:', err));
  }, DRAFT_DEBOUNCE_MS);
}

function tryRestoreDraft() {
  loadDraft().then(data => {
    if (!data) return;
    const fields = ['officer-name', 'schedule', 'visit-date', 'school-visited', 'circuit',
      'activity-name', 'purpose', 'major-activities', 'teachers-present', 'teachers-absent',
      'organizers', 'venue', 'topic-area', 'summary', 'start-date', 'closing-time'];

    const keyMap = {
      'officer-name': 'officerName', 'school-visited': 'schoolVisited',
      'activity-name': 'activityName', 'major-activities': 'majorActivities',
      'teachers-present': 'presentCount', 'teachers-absent': 'absentCount',
      'topic-area': 'topicArea', 'start-date': 'startDate', 'closing-time': 'closingTime',
      'visit-date': 'visitDate'
    };

    let restored = false;
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const key = keyMap[id] || id;
      if (data[key] !== undefined && data[key] !== null && String(data[key]).trim()) {
        el.value = data[key];
        restored = true;
      }
    });

    if (restored) {
      calculateDuration();
      showToast('Draft restored from your previous session.', 'info');
    }
  }).catch(err => console.warn('Draft restore failed:', err));
}

function clearDraft() {
  saveDraft({}).catch(() => {});
}

// ─── Form Submission ───────────────────────────────────────────────────────────
function collectFormData() {
  const coordsString = userCoordinates
    ? `${userCoordinates.lat}, ${userCoordinates.lng}`
    : 'Unavailable (GPS Failed)';
  const coordsAccuracy = userCoordinates ? `${userCoordinates.accuracy}m` : 'N/A';

  return {
    officerName:    document.getElementById('officer-name')?.value.trim()     || '',
    schedule:       document.getElementById('schedule')?.value                 || '',
    visitDate:      document.getElementById('visit-date')?.value               || '',
    schoolVisited:  document.getElementById('school-visited')?.value.trim()   || '',
    circuit:        document.getElementById('circuit')?.value                  || '',
    activityName:   document.getElementById('activity-name')?.value            || '',
    purpose:        document.getElementById('purpose')?.value.trim()           || '',
    majorActivities:document.getElementById('major-activities')?.value.trim() || '',
    presentCount:   parseInt(document.getElementById('teachers-present')?.value, 10) || 0,
    absentCount:    parseInt(document.getElementById('teachers-absent')?.value, 10)  || 0,
    organizers:     document.getElementById('organizers')?.value.trim()        || 'N/A',
    venue:          document.getElementById('venue')?.value.trim()             || 'N/A',
    topicArea:      document.getElementById('topic-area')?.value.trim()       || 'N/A',
    summary:        document.getElementById('summary')?.value.trim()           || 'N/A',
    startDate:      document.getElementById('start-date')?.value               || '',
    closingTime:    document.getElementById('closing-time')?.value             || '',
    duration:       document.getElementById('duration')?.value                 || '',
    coordinates:    coordsString,
    coordinatesAccuracy: coordsAccuracy
  };
}

async function handleFormSubmit(e) {
  e.preventDefault();

  // Re-run full validation across all steps
  if (!validateAllSteps()) {
    showToast('Please correct all validation errors before submitting.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  if (!userCoordinates) {
    showToast('Warning: GPS coordinates unavailable. Submitting as "Unavailable".', 'warning');
  }

  const reportData = collectFormData();

  // Case A: Offline
  if (!isOnline()) {
    try {
      await saveSubmission(reportData);
      showToast('Report queued locally. Will auto-sync when connection is restored.', 'info');
      resetForm();
      updateOfflineSubmissionsUI();
    } catch (err) {
      showToast('Failed to queue report locally. Please try again.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
    return;
  }

  // Case B: Online and configured
  showToast('Submitting report...', 'info');

  try {
    const response = await fetch(appsScriptUrl, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(reportData)
    });

    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (_) {
      throw new Error('Invalid response from server. Verify your Apps Script deployment access setting.');
    }

    if (result.status === 'success') {
      showToast('✅ Report submitted successfully!', 'success');
      clearDraft();
      resetForm();
    } else {
      throw new Error(result.message || 'Server returned an error status');
    }

  } catch (err) {
    console.error('Submission error:', err);
    try {
      await saveSubmission(reportData);
      showToast(`Submission failed: ${err.message}. Report saved to offline queue.`, 'warning');
      clearDraft();
      resetForm();
      updateOfflineSubmissionsUI();
    } catch (dbErr) {
      showToast('Critical error: Could not save report offline. Please try again.', 'error');
    }
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function resetForm() {
  const form = document.getElementById('report-form');
  if (form) form.reset();
  const durationInput = document.getElementById('duration');
  if (durationInput) durationInput.value = '';
  // Re-apply today's date default
  setDefaultVisitDate();
  // Reset pagination to step 1
  initPagination();
  // Only re-request geo if previous attempt failed
  if (locationStatus !== 'granted') requestGeolocation();
}

// ─── Offline Queue UI ──────────────────────────────────────────────────────────
async function updateOfflineSubmissionsUI() {
  const countBadge = document.getElementById('offline-count-badge');
  const container = document.getElementById('submissions-queue');
  if (!container) return;

  try {
    const queuedList = await getQueuedSubmissions();
    const count = queuedList.length;

    if (countBadge) {
      countBadge.textContent = count;
      countBadge.className = count > 0 ? 'badge offline-count' : 'badge';
    }

    if (count === 0) {
      container.innerHTML = `
        <div class="queue-empty">No reports currently in the offline queue.</div>
      `;
      return;
    }

    container.innerHTML = queuedList.map(item => {
      const date = new Date(item.createdAt).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      return `
        <div class="submission-item" id="queue-item-${item.id}">
          <div class="submission-info">
            <h4>${escapeHTML(item.schoolVisited)}</h4>
            <p>${escapeHTML(item.officerName)} &bull; ${item.visitDate} &bull; Queued: ${date}</p>
          </div>
          <div class="submission-status">
            <span class="queue-badge">⏳ Queued</span>
            <button class="btn btn-secondary btn-xs"
              data-id="${item.id}"
              aria-label="Delete queued report for ${escapeHTML(item.schoolVisited)}">
              Delete
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Attach delete listeners (avoid inline onclick)
    container.querySelectorAll('button[data-id]').forEach(btn => {
      btn.addEventListener('click', () => deleteLocalReport(Number(btn.dataset.id)));
    });

  } catch (err) {
    console.error('Failed to render queued submission list:', err);
  }
}

async function deleteLocalReport(id) {
  if (!confirm('Are you sure you want to delete this locally queued report? This cannot be undone.')) return;
  try {
    await deleteSubmission(id);
    showToast('Local report deleted.', 'info');
    updateOfflineSubmissionsUI();
  } catch (_) {
    showToast('Could not delete local report.', 'error');
  }
}

// ─── Toast Notification ────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const toast = document.getElementById('global-toast');
  if (!toast) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  toast.className = `global-toast visible ${type}`;
  toast.innerHTML = `<span aria-hidden="true">${icons[type] || 'ℹ️'}</span> <span>${message}</span>`;

  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), 5000);
}

// ─── Event Listeners ───────────────────────────────────────────────────────────
function setupEventListeners() {
  // Theme
  document.getElementById('theme-toggle')?.addEventListener('click', toggleTheme);

  // Consent
  document.getElementById('btn-accept-consent')?.addEventListener('click', handleAcceptConsent);
  document.getElementById('btn-decline-consent')?.addEventListener('click', handleDeclineConsent);

  // Location badge retry
  document.getElementById('location-badge')?.addEventListener('click', requestGeolocation);

  // Pagination
  document.getElementById('btn-next')?.addEventListener('click', goNextStep);
  document.getElementById('btn-prev')?.addEventListener('click', goPrevStep);

  // Duration auto-calc
  document.getElementById('start-date')?.addEventListener('change', calculateDuration);
  document.getElementById('closing-time')?.addEventListener('change', calculateDuration);

  // Attendance summary live update
  document.getElementById('teachers-present')?.addEventListener('input', updateAttendanceSummary);
  document.getElementById('teachers-absent')?.addEventListener('input', updateAttendanceSummary);

  // Form submission
  document.getElementById('report-form')?.addEventListener('submit', handleFormSubmit);

  // Sync Now button
  document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
    const { successCount, failCount } = await syncQueuedReports();
    const queued = await getQueuedSubmissions();
    if (queued.length === 0 && successCount === 0 && failCount === 0) {
      showToast('Queue is empty — nothing to sync.', 'info');
    }
    updateOfflineSubmissionsUI();
  });

  // Draft auto-save on any form input change
  document.getElementById('report-form')?.addEventListener('input', scheduleDraftSave);

  // Network status change events (from sync.js)
  document.addEventListener('networkStatusChange', (e) => {
    const online = e.detail.online;
    const netBar = document.getElementById('network-bar');
    if (netBar) netBar.classList.toggle('offline', !online);
    showToast(
      online ? 'Connection restored. Back online.' : 'Network offline. Submissions will queue locally.',
      online ? 'success' : 'warning'
    );
  });

  // Sync state change events (from sync.js)
  document.addEventListener('syncStateChange', (e) => {
    const statusText = document.getElementById('sync-status-text');
    if (!statusText) return;
    if (e.detail.syncing) {
      statusText.innerHTML = `<span class="sync-spinner" aria-hidden="true"></span> Syncing queue with Sheets...`;
    } else {
      statusText.textContent = '';
      if (e.detail.successCount > 0) showToast(`Synced ${e.detail.successCount} report(s) to Sheets.`, 'success');
      if (e.detail.failCount > 0)    showToast(`Sync warning: ${e.detail.failCount} report(s) failed to upload.`, 'warning');
    }
  });

  // Queue updated event
  document.addEventListener('queueUpdated', updateOfflineSubmissionsUI);
}

// ─── XSS Protection ────────────────────────────────────────────────────────────
function escapeHTML(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
