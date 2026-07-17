/**
 * Status / Progress view — status.html
 *
 * Responsibilities:
 *  - Load all applications via GET /api/applications
 *  - Group them into the seven Application_Status buckets (including empty ones)
 *  - Render one section per status with heading + count + application cards
 *  - Each card has an inline <select> pre-set to the current status
 *  - On <select> change: PUT /api/applications/:id { status: newValue }
 *      • Success → move/update the card in the DOM without a full reload
 *      • Failure → show inline error toast and revert <select> to previous value
 */

import { apiFetch } from './api.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUSES = [
  'Applied',
  'Phone Screen',
  'Interview',
  'Interviewing',
  'Offer',
  'Moving Forward',
  'Passed On',
  'Rescinded',
  'Pulled',
  'Withdrawn',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Escape a value for safe insertion into HTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Convert a status string to its CSS badge class.
 * e.g. "Phone Screen" → "status-phone-screen"
 * @param {string} status
 * @returns {string}
 */
function statusClass(status) {
  return 'status-' + status.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Group an array of application objects by their status field.
 * Returns a Map<string, application[]> keyed by each of the seven status values
 * in canonical order; groups with no applications have an empty array.
 * @param {object[]} applications
 * @returns {Map<string, object[]>}
 */
function groupByStatus(applications) {
  const groups = new Map(STATUSES.map((s) => [s, []]));
  for (const app of applications) {
    const bucket = groups.get(app.status);
    if (bucket) {
      bucket.push(app);
    }
  }
  return groups;
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

/**
 * Show a transient error toast.
 * Appended to a singleton .toast-container; removed after 4 s.
 * @param {string} message
 */
function showErrorToast(message) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast toast-error';
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast-icon" aria-hidden="true">✕</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  // Auto-remove after 4 s with a fade-out transition
  setTimeout(() => {
    toast.classList.add('toast--leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Build the HTML for a single application card.
 * @param {object} application  — full application document from the API
 * @returns {string} HTML string
 */
function renderCard(application) {
  const statusOptions = STATUSES.map(
    (s) =>
      `<option value="${escapeHtml(s)}"${s === application.status ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  return `
    <article class="app-card" data-id="${escapeHtml(application._id)}">
      <p class="app-card-title">${escapeHtml(application.jobTitle)}</p>
      <p class="app-card-company">${escapeHtml(application.company)}</p>
      <p class="app-card-meta">${escapeHtml(application.jobLocation)} &middot; ${escapeHtml(application.workArrangement)}</p>
      <div class="app-card-footer">
        <span class="status-badge ${escapeHtml(statusClass(application.status))}">${escapeHtml(application.status)}</span>
        <select
          class="status-select"
          aria-label="Change status for ${escapeHtml(application.jobTitle)} at ${escapeHtml(application.company)}"
          data-id="${escapeHtml(application._id)}"
          data-current="${escapeHtml(application.status)}"
        >
          ${statusOptions}
        </select>
      </div>
    </article>
  `;
}

/**
 * Build the HTML for one status section (heading + card grid).
 * @param {string}   status       — one of the seven status values
 * @param {object[]} applications — applications in this bucket
 * @returns {string} HTML string
 */
function renderStatusSection(status, applications) {
  const sectionId = 'section-' + statusClass(status);

  const cardsHtml =
    applications.length > 0
      ? `<div class="status-group-cards" id="${sectionId}-cards">
          ${applications.map(renderCard).join('')}
        </div>`
      : `<div class="status-group-cards" id="${sectionId}-cards"></div>`;

  return `
    <section class="status-group" id="${sectionId}" aria-label="${escapeHtml(status)}">
      <div class="status-group-header">
        <span class="status-badge ${escapeHtml(statusClass(status))}">${escapeHtml(status)}</span>
        <h2 class="status-group-title">${escapeHtml(status)}</h2>
        <span class="status-count" id="${sectionId}-count" aria-label="${applications.length} application${applications.length === 1 ? '' : 's'}">${applications.length}</span>
      </div>
      ${cardsHtml}
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Status update (inline <select> change handler)
// ---------------------------------------------------------------------------

/**
 * Handle a change on one of the inline status <select> elements.
 * Issues PUT /api/applications/:id { status: newValue }.
 * On success, moves the card to the correct section in the DOM.
 * On failure, reverts the <select> and shows an error toast.
 * @param {Event} event
 */
async function handleStatusChange(event) {
  const select = event.target;
  const id = select.dataset.id;
  const newStatus = select.value;
  const previousStatus = select.dataset.current;

  if (newStatus === previousStatus) return;

  // Optimistically disable the select while the request is in flight
  select.disabled = true;

  try {
    const updated = await apiFetch(`/applications/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });

    // Move the card to the new status section without a full reload
    moveCardToSection(updated);
  } catch (err) {
    // Revert the select to its previous value
    select.value = previousStatus;
    showErrorToast(
      err.message || 'Failed to update status. Please try again.'
    );
  } finally {
    select.disabled = false;
  }
}

/**
 * Re-render a card and move it to the correct status section.
 * Updates the counts on both the old and new sections.
 * @param {object} updatedApplication — the updated document returned by the API
 */
function moveCardToSection(updatedApplication) {
  const id = updatedApplication._id;
  const newStatus = updatedApplication.status;

  // Find the existing card
  const existingCard = document.querySelector(`.app-card[data-id="${CSS.escape(id)}"]`);

  // Determine the old status from the card's select[data-current] (before we re-render)
  const oldStatus = existingCard
    ? existingCard.querySelector('.status-select')?.dataset.current
    : null;

  // Remove the old card
  if (existingCard) {
    existingCard.remove();
  }

  // Update old section count
  if (oldStatus && oldStatus !== newStatus) {
    updateSectionCount(oldStatus);
  }

  // Insert new card into the new section
  const newSectionId = 'section-' + statusClass(newStatus);
  const cardsContainer = document.getElementById(`${newSectionId}-cards`);
  if (cardsContainer) {
    cardsContainer.insertAdjacentHTML('beforeend', renderCard(updatedApplication));
    // Wire the change listener on the newly-inserted card
    const newSelect = cardsContainer.querySelector(
      `.status-select[data-id="${CSS.escape(id)}"]`
    );
    if (newSelect) {
      newSelect.addEventListener('change', handleStatusChange);
    }
  }

  // Update new section count
  updateSectionCount(newStatus);
}

/**
 * Recalculate and update the displayed count badge for a status section.
 * @param {string} status
 */
function updateSectionCount(status) {
  const sectionId = 'section-' + statusClass(status);
  const cardsContainer = document.getElementById(`${sectionId}-cards`);
  const countEl = document.getElementById(`${sectionId}-count`);
  if (!cardsContainer || !countEl) return;

  const count = cardsContainer.querySelectorAll('.app-card').length;
  countEl.textContent = count;
  countEl.setAttribute(
    'aria-label',
    `${count} application${count === 1 ? '' : 's'}`
  );
}

// ---------------------------------------------------------------------------
// Full page render
// ---------------------------------------------------------------------------

/**
 * Render the complete status view from an array of applications.
 * @param {object[]} applications
 */
function renderStatusView(applications) {
  const app = document.getElementById('app');
  const groups = groupByStatus(applications);

  const sectionsHtml = STATUSES.map((status) =>
    renderStatusSection(status, groups.get(status))
  ).join('');

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Application Status</h1>
    </div>
    ${sectionsHtml}
  `;

  // Wire change listeners on all status selects
  app.querySelectorAll('.status-select').forEach((select) => {
    select.addEventListener('change', handleStatusChange);
  });
}

/**
 * Render an error banner and stop.
 * @param {string} message
 */
function renderErrorBanner(message) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="error-banner" role="alert">
      <span>⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const applications = await apiFetch('/applications');
    renderStatusView(applications);
  } catch (err) {
    renderErrorBanner('Failed to load applications. Please try again.');
  }
});
