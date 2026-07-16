/**
 * Shared API fetch wrapper.
 * All UI modules import this instead of calling fetch() directly.
 */

/**
 * Make an authenticated fetch call to the API.
 *
 * @param {string} path      - Path relative to /api, e.g. "/applications"
 * @param {RequestInit} [options] - Standard fetch options (method, body, headers, …)
 * @returns {Promise<any>}   - Parsed JSON response body (or undefined for 204)
 * @throws {{ status: number, message: string, fields?: object }} Structured error on non-ok responses
 */
export async function apiFetch(path, options = {}) {
  const response = await fetch('/api' + path, options);

  // 204 No Content — nothing to parse
  if (response.status === 204) {
    return undefined;
  }

  let body;
  try {
    body = await response.json();
  } catch {
    // Response was not JSON (e.g. empty body on an unexpected status)
    body = null;
  }

  if (!response.ok) {
    const err = new Error(
      (body && (body.error || body.message)) || `HTTP ${response.status}`
    );
    err.status = response.status;
    err.fields = (body && body.fields) || null;
    throw err;
  }

  return body;
}
