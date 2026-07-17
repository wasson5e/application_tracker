'use strict';

/**
 * Validation helpers for the Job Application Tracker API.
 *
 * Exports:
 *   WORK_ARRANGEMENTS  – allowed work arrangement strings
 *   STATUS_VALUES      – allowed Application_Status enum strings
 *   validateApplication(body, isUpdate) – validate a create/update payload
 *   validateStatus(value)              – validate a standalone status value
 */

/** Allowed work arrangement values (Requirement 1.5, 1.7, 7.5). */
const WORK_ARRANGEMENTS = ['Remote', 'Hybrid', 'On-site'];

/**
 * Allowed Application_Status enum values
 * (Requirements 3.2, 3.4, 5.6).
 */
const STATUS_VALUES = [
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

/**
 * Validates an application request body.
 *
 * Required fields (company, jobTitle, jobDescription, jobLocation,
 * workArrangement) must be present and non-empty.  When `isUpdate` is true
 * the check only fires for fields that are explicitly included in `body`
 * (partial updates are permitted), so an absent key is not treated as an
 * error; an explicitly blank value still is.
 *
 * Additionally validates:
 *   – workArrangement must be one of WORK_ARRANGEMENTS
 *   – payscale, if provided, must be ≤ 500 characters
 *
 * @param {object}  body     – parsed request body
 * @param {boolean} isUpdate – true for PUT (partial update), false for POST
 * @returns {{ valid: boolean, fields: Object.<string, string> }}
 */
function validateApplication(body, isUpdate = false) {
  const fields = {};

  const REQUIRED = [
    'company',
    'jobTitle',
    'jobDescription',
    'jobLocation',
    'workArrangement',
  ];

  for (const field of REQUIRED) {
    if (isUpdate && !(field in body)) {
      // Field not supplied in partial update — nothing to validate.
      continue;
    }

    const value = body[field];

    if (value === undefined || value === null || String(value).trim() === '') {
      fields[field] = 'This field is required and cannot be empty.';
    }
  }

  // workArrangement enum check (only when value is present and not already
  // flagged as missing).
  if (!fields.workArrangement && 'workArrangement' in body) {
    const wa = body.workArrangement;
    if (wa !== undefined && wa !== null && !WORK_ARRANGEMENTS.includes(wa)) {
      fields.workArrangement =
        `Must be one of: ${WORK_ARRANGEMENTS.join(', ')}.`;
    }
  }

  // payscale length check (optional field — only validated when provided).
  if (body.payscale !== undefined && body.payscale !== null) {
    if (String(body.payscale).length > 500) {
      fields.payscale = 'Must be 500 characters or fewer.';
    }
  }

  // mlMatch validation (optional field — must be a number between 0 and 100 when provided).
  if (body.mlMatch !== undefined && body.mlMatch !== null) {
    const mlVal = Number(body.mlMatch);
    if (!Number.isFinite(mlVal) || mlVal < 0 || mlVal > 100) {
      fields.mlMatch = 'Must be a number between 0 and 100.';
    }
  }

  return {
    valid: Object.keys(fields).length === 0,
    fields,
  };
}

/**
 * Validates a standalone Application_Status value.
 *
 * @param {*} value – the status string to check
 * @returns {boolean} true when value is one of the seven defined statuses
 */
function validateStatus(value) {
  return STATUS_VALUES.includes(value);
}

module.exports = {
  WORK_ARRANGEMENTS,
  STATUS_VALUES,
  validateApplication,
  validateStatus,
};
