/**
 * Applications list view — index.html
 *
 * Responsibilities:
 *  - Render the page header + "Add Application" button
 *  - Load and display the applications table (sorted by appliedAt desc)
 *  - Add Application modal (POST /api/applications)
 *  - Edit Application modal (PUT  /api/applications/:id)
 *  - Delete confirmation dialog (DELETE /api/applications/:id)
 */

import { apiFetch } from './api.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORK_ARRANGEMENTS = ['Remote', 'Hybrid', 'On-site'];

const STATUSES = [
  'Applied',
  'Phone Screen',
  'Interview',
  'Offer',
  'Moving Forward',
  'Passed On',
  'Withdrawn',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format an ISO date string as "YYYY-MM-DD HH:MM"
 * @param {string} isoString
 * @returns {string}
 */
function formatTimestamp(isoString) {
  const d = new Date(isoString);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * Derive the CSS badge class from a status string.
 * e.g. "Phone Screen" → "status-phone-screen"
 * @param {string} status
 * @returns {string}
 */
function statusClass(status) {
  return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
}

// ---------------------------------------------------------------------------
// DOM references (populated after mount)
// ---------------------------------------------------------------------------

const app = document.getElementById('app');

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderErrorBanner(message) {
  return `
    <div class="error-banner" role="alert">
      <span>⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// Page skeleton
// ---------------------------------------------------------------------------

function renderSkeleton() {
  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Applications</h1>
      <button class="btn btn-primary" id="btn-add-application">+ Add Application</button>
    </div>
    <div id="list-area"></div>

    <!-- Add / Edit modal -->
    <div class="modal-overlay" id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title" id="modal-title">Add Application</span>
          <button class="modal-close" id="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body" id="modal-body">
          ${renderApplicationForm()}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" id="modal-cancel">Cancel</button>
          <button class="btn btn-primary" id="modal-submit">Save</button>
        </div>
      </div>
    </div>

    <!-- Delete confirmation dialog -->
    <dialog id="delete-dialog">
      <div class="dialog-header">
        <p class="dialog-title">Delete Application</p>
      </div>
      <div class="dialog-body" id="delete-dialog-body">
        Are you sure you want to delete this application? This action cannot be undone.
      </div>
      <div class="dialog-footer">
        <button class="btn btn-secondary" id="dialog-cancel">Cancel</button>
        <button class="btn btn-danger" id="dialog-confirm">Confirm Delete</button>
      </div>
    </dialog>
  `;
}

// ---------------------------------------------------------------------------
// Application form HTML
// ---------------------------------------------------------------------------

function renderApplicationForm(app = {}) {
  return `
    <form id="application-form" novalidate>
      <div class="form-group" id="fg-company">
        <label for="f-company">Company <span class="required-mark">*</span></label>
        <input type="text" id="f-company" name="company" value="${escapeHtml(app.company || '')}" />
        <span class="field-error" id="err-company" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-jobTitle">
        <label for="f-jobTitle">Job Title <span class="required-mark">*</span></label>
        <input type="text" id="f-jobTitle" name="jobTitle" value="${escapeHtml(app.jobTitle || '')}" />
        <span class="field-error" id="err-jobTitle" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-jobDescription">
        <label for="f-jobDescription">Job Description <span class="required-mark">*</span></label>
        <textarea id="f-jobDescription" name="jobDescription">${escapeHtml(app.jobDescription || '')}</textarea>
        <span class="field-error" id="err-jobDescription" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-jobLocation">
        <label for="f-jobLocation">Location <span class="required-mark">*</span></label>
        <input type="text" id="f-jobLocation" name="jobLocation" value="${escapeHtml(app.jobLocation || '')}" />
        <span class="field-error" id="err-jobLocation" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-workArrangement">
        <label for="f-workArrangement">Work Arrangement <span class="required-mark">*</span></label>
        <select id="f-workArrangement" name="workArrangement">
          ${WORK_ARRANGEMENTS.map(
            (wa) =>
              `<option value="${wa}" ${app.workArrangement === wa ? 'selected' : ''}>${wa}</option>`
          ).join('')}
        </select>
        <span class="field-error" id="err-workArrangement" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-payscale">
        <label for="f-payscale">Payscale <span style="font-weight:400;color:var(--color-text-muted)">(optional)</span></label>
        <input type="text" id="f-payscale" name="payscale" value="${escapeHtml(app.payscale || '')}" />
        <span class="field-error" id="err-payscale" aria-live="polite"></span>
      </div>
      <div class="form-group" id="fg-notes">
        <label for="f-notes">Notes <span style="font-weight:400;color:var(--color-text-muted)">(optional)</span></label>
        <textarea id="f-notes" name="notes">${escapeHtml(app.notes || '')}</textarea>
        <span class="field-error" id="err-notes" aria-live="polite"></span>
      </div>
    </form>
  `;
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function renderList(applications) {
  const listArea = document.getElementById('list-area');

  if (applications.length === 0) {
    listArea.innerHTML = `
      <div class="empty-state">
        <p>No applications recorded yet.</p>
        <button class="btn btn-primary" id="btn-add-empty">+ Add your first application</button>
      </div>
    `;
    document.getElementById('btn-add-empty').addEventListener('click', openAddModal);
    return;
  }

  // Sort descending by appliedAt (API should already return sorted, but enforce client-side too)
  const sorted = [...applications].sort(
    (a, b) => new Date(b.appliedAt) - new Date(a.appliedAt)
  );

  const rows = sorted
    .map(
      (a) => `
      <tr data-id="${escapeHtml(a._id)}">
        <td>${escapeHtml(a.company)}</td>
        <td>${escapeHtml(a.jobTitle)}</td>
        <td>${escapeHtml(a.jobLocation)}</td>
        <td>${escapeHtml(a.workArrangement)}</td>
        <td><span class="status-badge ${statusClass(a.status)}">${escapeHtml(a.status)}</span></td>
        <td>${escapeHtml(formatTimestamp(a.appliedAt))}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-secondary btn-sm btn-edit" data-id="${escapeHtml(a._id)}" aria-label="Edit ${escapeHtml(a.company)}">Edit</button>
            <button class="btn btn-danger btn-sm btn-delete" data-id="${escapeHtml(a._id)}" aria-label="Delete ${escapeHtml(a.company)}">Delete</button>
          </div>
        </td>
      </tr>
    `
    )
    .join('');

  listArea.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Job Title</th>
            <th>Location</th>
            <th>Arrangement</th>
            <th>Status</th>
            <th>Applied At</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="applications-tbody">
          ${rows}
        </tbody>
      </table>
    </div>
  `;

  // Attach row-level event listeners
  listArea.querySelectorAll('.btn-edit').forEach((btn) => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id, sorted));
  });
  listArea.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', () => openDeleteDialog(btn.dataset.id, sorted));
  });
}

// ---------------------------------------------------------------------------
// Load & refresh
// ---------------------------------------------------------------------------

async function loadApplications() {
  const listArea = document.getElementById('list-area');
  try {
    const applications = await apiFetch('/applications');
    renderList(applications);
  } catch (err) {
    listArea.innerHTML = renderErrorBanner(
      'Failed to load applications. Please try again.'
    );
  }
}

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function getModalOverlay() {
  return document.getElementById('modal-overlay');
}

function openModal(title) {
  const overlay = getModalOverlay();
  document.getElementById('modal-title').textContent = title;
  overlay.classList.add('modal-overlay--visible');
  // Focus the first focusable element in the modal
  const first = overlay.querySelector('input, textarea, select, button');
  if (first) first.focus();
}

function closeModal() {
  const overlay = getModalOverlay();
  overlay.classList.remove('modal-overlay--visible');
  clearFormErrors();
}

function clearFormErrors() {
  document.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
  document.querySelectorAll('.has-error').forEach((el) => {
    el.classList.remove('has-error');
  });
}

function showFieldErrors(fields) {
  if (!fields) return;
  Object.entries(fields).forEach(([field, message]) => {
    const errorEl = document.getElementById(`err-${field}`);
    const inputEl = document.getElementById(`f-${field}`);
    if (errorEl) errorEl.textContent = message;
    if (inputEl) inputEl.classList.add('has-error');
  });
}

function getFormValues() {
  return {
    company: document.getElementById('f-company').value.trim(),
    jobTitle: document.getElementById('f-jobTitle').value.trim(),
    jobDescription: document.getElementById('f-jobDescription').value.trim(),
    jobLocation: document.getElementById('f-jobLocation').value.trim(),
    workArrangement: document.getElementById('f-workArrangement').value,
    payscale: document.getElementById('f-payscale').value.trim() || undefined,
    notes: document.getElementById('f-notes').value.trim() || undefined,
  };
}

// ---------------------------------------------------------------------------
// Add Application
// ---------------------------------------------------------------------------

function openAddModal() {
  document.getElementById('modal-body').innerHTML = renderApplicationForm();
  document.getElementById('modal-title').textContent = 'Add Application';

  // Wire submit button
  document.getElementById('modal-submit').onclick = submitAddForm;
  openModal('Add Application');
}

async function submitAddForm() {
  clearFormErrors();
  const payload = getFormValues();

  try {
    await apiFetch('/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal();
    await loadApplications();
  } catch (err) {
    if (err.status === 400 && err.fields) {
      showFieldErrors(err.fields);
    } else {
      // Show a general error as a banner inside the modal body
      const generalErr = document.createElement('div');
      generalErr.innerHTML = renderErrorBanner(
        err.message || 'An unexpected error occurred. Please try again.'
      );
      document.getElementById('modal-body').prepend(generalErr.firstElementChild);
    }
  }
}

// ---------------------------------------------------------------------------
// Edit Application
// ---------------------------------------------------------------------------

function openEditModal(id, applications) {
  const application = applications.find((a) => a._id === id);
  if (!application) {
    document.getElementById('list-area').innerHTML = renderErrorBanner(
      'Application not found.'
    );
    return;
  }

  document.getElementById('modal-body').innerHTML = renderApplicationForm(application);
  document.getElementById('modal-title').textContent = 'Edit Application';

  // Wire submit button
  document.getElementById('modal-submit').onclick = () => submitEditForm(id);
  openModal('Edit Application');
}

async function submitEditForm(id) {
  clearFormErrors();
  const payload = getFormValues();

  try {
    await apiFetch(`/applications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal();
    await loadApplications();
  } catch (err) {
    if (err.status === 400 && err.fields) {
      showFieldErrors(err.fields);
    } else if (err.status === 404) {
      closeModal();
      document.getElementById('list-area').innerHTML = renderErrorBanner(
        'Application not found.'
      );
    } else {
      const generalErr = document.createElement('div');
      generalErr.innerHTML = renderErrorBanner(
        err.message || 'An unexpected error occurred. Please try again.'
      );
      document.getElementById('modal-body').prepend(generalErr.firstElementChild);
    }
  }
}

// ---------------------------------------------------------------------------
// Delete Application
// ---------------------------------------------------------------------------

let _pendingDeleteId = null;

function openDeleteDialog(id, applications) {
  const application = applications.find((a) => a._id === id);
  const label = application
    ? `"${application.jobTitle}" at ${application.company}`
    : 'this application';

  document.getElementById(
    'delete-dialog-body'
  ).textContent = `Are you sure you want to delete ${label}? This action cannot be undone.`;

  _pendingDeleteId = id;

  const dialog = document.getElementById('delete-dialog');
  dialog.showModal();
}

async function confirmDelete() {
  const id = _pendingDeleteId;
  if (!id) return;

  const dialog = document.getElementById('delete-dialog');
  dialog.close();
  _pendingDeleteId = null;

  try {
    await apiFetch(`/applications/${id}`, { method: 'DELETE' });
    await loadApplications();
  } catch (err) {
    document.getElementById('list-area').insertAdjacentHTML(
      'afterbegin',
      renderErrorBanner(
        err.message || 'Failed to delete application. Please try again.'
      )
    );
  }
}

function cancelDelete() {
  _pendingDeleteId = null;
  document.getElementById('delete-dialog').close();
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------

function wireStaticEvents() {
  // "Add Application" button in page header
  document.getElementById('btn-add-application').addEventListener('click', openAddModal);

  // Modal close / cancel
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  // Close modal on backdrop click
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) {
      closeModal();
    }
  });

  // Close modal on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const overlay = document.getElementById('modal-overlay');
      if (overlay && overlay.classList.contains('modal-overlay--visible')) {
        closeModal();
      }
    }
  });

  // Delete dialog buttons
  document.getElementById('dialog-confirm').addEventListener('click', confirmDelete);
  document.getElementById('dialog-cancel').addEventListener('click', cancelDelete);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  renderSkeleton();
  wireStaticEvents();
  await loadApplications();
});
