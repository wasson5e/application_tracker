'use strict';

// Load .env file values as fallback; environment variables already set take precedence.
require('dotenv').config();

/**
 * Validates and returns the application configuration read from environment variables.
 *
 * Validated keys:
 *   API_PORT    – integer in the range 1–65535
 *   MONGODB_URI – non-empty string
 *   DB_NAME     – non-empty string
 *
 * On any missing or invalid value the function writes the offending key name to
 * stderr and calls process.exit(1).
 *
 * @returns {{ port: number, mongodbUri: string, dbName: string }}
 */
function loadConfig() {
  const errors = [];

  // --- API_PORT ---
  const rawPort = process.env.API_PORT;
  let port;

  if (rawPort === undefined || rawPort === '') {
    errors.push('API_PORT');
  } else {
    // Must be a whole-number string (no decimals, no leading/trailing spaces).
    const parsed = Number(rawPort);
    if (!Number.isInteger(parsed) || String(parsed) !== rawPort.trim()) {
      errors.push('API_PORT');
    } else if (parsed < 1 || parsed > 65535) {
      errors.push('API_PORT');
    } else {
      port = parsed;
    }
  }

  // --- MONGODB_URI ---
  const mongodbUri = process.env.MONGODB_URI;
  if (!mongodbUri || mongodbUri.trim() === '') {
    errors.push('MONGODB_URI');
  }

  // --- DB_NAME ---
  const dbName = process.env.DB_NAME;
  if (!dbName || dbName.trim() === '') {
    errors.push('DB_NAME');
  }

  if (errors.length > 0) {
    for (const key of errors) {
      process.stderr.write(`Missing or invalid config key: ${key}\n`);
    }
    process.exit(1);
  }

  // --- RESUME_PATH (optional, defaults to /data/resumes inside the container) ---
  const resumePath = process.env.RESUME_PATH || '/data/resumes';

  return {
    port,
    mongodbUri,
    dbName,
    resumePath,
  };
}

module.exports = { loadConfig };
