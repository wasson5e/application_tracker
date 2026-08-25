/**
 * ML Match view — mlmatch.html
 *
 * Responsibilities:
 *  - Fetch all applications on DOMContentLoaded
 *  - Filter to those with a non-null mlMatch value
 *  - Sort descending by mlMatch percentage
 *  - Render a table showing "Company - Job Title" and the match %
 */

import { apiFetch } from './api.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderErrorBanner(message) {
  return `
    <div class="error-banner" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render the ML Match table.
 * @param {Array} applications - sorted by mlMatch descending, all have non-null mlMatch
 */
function renderPage(applications) {
  const app = document.getElementById('app');

  if (applications.length === 0) {
    app.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">ML Match</h1>
      </div>
      <div class="empty-state">
        <p>No applications with ML Match scores yet.</p>
      </div>
    `;
    return;
  }

  const rows = applications
    .map(
      (a) => `
      <tr>
        <td>${escapeHtml(a.company)} – ${escapeHtml(a.jobTitle)}</td>
        <td class="mlmatch-cell">
          <span class="mlmatch-bar" style="width: ${a.mlMatch}%;" aria-hidden="true"></span>
          <span class="mlmatch-value">${a.mlMatch}%</span>
        </td>
      </tr>`
    )
    .join('');

  app.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">ML Match</h1>
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Application</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async () => {
  const app = document.getElementById('app');

  try {
    const allApplications = await apiFetch('/applications');

    // Keep only those with a valid mlMatch, sort descending
    const withMatch = allApplications
      .filter((a) => a.mlMatch != null)
      .sort((a, b) => b.mlMatch - a.mlMatch);

    renderPage(withMatch);
  } catch (err) {
    app.innerHTML = renderErrorBanner(
      'Failed to load applications. Please try again.'
    );
  }
});
