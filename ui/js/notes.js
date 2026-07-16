/**
 * Notes view — notes.html
 *
 * Responsibilities:
 *  - Fetch all applications on DOMContentLoaded
 *  - Render one notes card per application with company name, job title,
 *    and an editable <textarea> pre-populated with the current notes value
 *  - "Save" button per card issues PUT /api/applications/:id with { notes }
 *  - On success: display "Saved ✓" inline near the button, auto-hide after 3 s
 *  - On failure: display error message near the button, leave textarea unchanged
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { apiFetch } from './api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a string for safe insertion into HTML attribute values or text nodes.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Derive a CSS badge class name from a status string.
 * e.g. "Phone Screen" → "status-phone-screen"
 * @param {string} status
 * @returns {string}
 */
function statusClass(status) {
  return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Render the error banner HTML string.
 * @param {string} message
 * @returns {string}
 */
function renderErrorBanner(message) {
  return `
    <div class="error-banner" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

/**
 * Render a single notes card for an application.
 * @param {{ _id: string, company: string, jobTitle: string, status: string, notes?: string }} application
 * @returns {string}
 */
function renderNotesCard(application) {
  const notes = application.notes ?? '';
  const id = escapeHtml(application._id);

  return `
    <div class="notes-card" data-id="${id}">
      <div class="notes-card-header">
        <p class="notes-card-title">${escapeHtml(application.jobTitle)}</p>
        <p class="notes-card-company">
          ${escapeHtml(application.company)}
          <span class="status-badge ${statusClass(application.status)}">${escapeHtml(application.status)}</span>
        </p>
      </div>
      <div class="form-group">
        <label for="notes-textarea-${id}" class="visually-hidden">Notes for ${escapeHtml(application.jobTitle)} at ${escapeHtml(application.company)}</label>
        <textarea
          id="notes-textarea-${id}"
          class="notes-textarea"
          rows="5"
          aria-label="Notes for ${escapeHtml(application.jobTitle)} at ${escapeHtml(application.company)}"
        >${escapeHtml(notes)}</textarea>
      </div>
      <div class="notes-card-actions">
        <button
          class="btn btn-primary btn-sm btn-save-notes"
          data-id="${id}"
          aria-label="Save notes for ${escapeHtml(application.jobTitle)} at ${escapeHtml(application.company)}"
        >Save</button>
        <span class="inline-feedback" data-feedback-id="${id}" aria-live="polite"></span>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

/**
 * Render the full notes page structure into #app.
 * @param {Array} applications
 */
function renderPage(applications) {
  const app = document.getElementById('app');

  if (applications.length === 0) {
    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">Notes</h1>
      </div>
      <div class="empty-state">
        <p>No applications recorded yet.</p>
      </div>
    `;
    return;
  }

  const cards = applications
    .map((application) => renderNotesCard(application))
    .join('');

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Notes</h1>
    </div>
    <div class="notes-grid" id="notes-grid">
      ${cards}
    </div>
  `;

  // Attach save button event listeners
  app.querySelectorAll('.btn-save-notes').forEach((btn) => {
    btn.addEventListener('click', () => handleSave(btn.dataset.id));
  });
}

// ---------------------------------------------------------------------------
// Save handler
// ---------------------------------------------------------------------------

/**
 * Show inline feedback near a card's Save button.
 * @param {string} id          - Application _id
 * @param {'success'|'error'} type
 * @param {string} message
 * @param {number} [autoHideMs] - If provided, hide after this many milliseconds
 */
function showFeedback(id, type, message, autoHideMs) {
  const feedbackEl = document.querySelector(`[data-feedback-id="${id}"]`);
  if (!feedbackEl) return;

  feedbackEl.textContent = message;
  feedbackEl.className = `inline-feedback inline-feedback--${type}`;

  if (autoHideMs) {
    setTimeout(() => {
      // Fade out gracefully
      feedbackEl.textContent = '';
      feedbackEl.className = 'inline-feedback';
    }, autoHideMs);
  }
}

/**
 * Handle the Save button click for a specific application card.
 * @param {string} id - Application _id
 */
async function handleSave(id) {
  const card = document.querySelector(`.notes-card[data-id="${id}"]`);
  if (!card) return;

  const textarea = card.querySelector('.notes-textarea');
  const saveBtn = card.querySelector('.btn-save-notes');
  const notesValue = textarea.value;

  // Disable button during the request to prevent double-submission
  saveBtn.disabled = true;

  try {
    await apiFetch(`/applications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: notesValue }),
    });

    // Requirement 4.4 — display visible confirmation on success
    showFeedback(id, 'success', 'Saved ✓', 3000);
  } catch (err) {
    // Requirement 4.5 — display error, do NOT clear textarea
    const message = err.message || 'Failed to save notes. Please try again.';
    showFeedback(id, 'error', message);
    // textarea content is left unchanged (we never modified it)
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');

  try {
    // Requirement 4.1 — fetch all applications and display notes
    const applications = await apiFetch('/applications');
    renderPage(applications);
  } catch (err) {
    app.innerHTML = renderErrorBanner(
      'Failed to load applications. Please try again.'
    );
  }
});
