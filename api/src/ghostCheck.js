'use strict';

/**
 * Ghosted status checker.
 *
 * Moves applications that have been in "Applied" status for 30+ days
 * to "Ghosted" status automatically.
 *
 * This runs:
 *   - Once at startup
 *   - Periodically every hour via setInterval
 *   - Before returning results on GET /applications
 */

const GHOST_THRESHOLD_DAYS = 30;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Update all applications that are still "Applied" and older than 30 days
 * to "Ghosted" status.
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @returns {Promise<number>} Number of applications moved to Ghosted
 */
async function markGhostedApplications(db) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - GHOST_THRESHOLD_DAYS);

  const result = await db.collection('applications').updateMany(
    {
      status: 'Applied',
      appliedAt: { $lte: cutoffDate },
    },
    {
      $set: { status: 'Ghosted' },
    }
  );

  return result.modifiedCount;
}

/**
 * Start the periodic ghost check interval.
 * Also runs an initial check immediately.
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @returns {NodeJS.Timeout} The interval ID (for cleanup if needed)
 */
function startGhostChecker(db) {
  // Run immediately on startup
  markGhostedApplications(db).then((count) => {
    if (count > 0) {
      process.stdout.write(`Ghost check: moved ${count} application(s) to Ghosted status\n`);
    }
  }).catch((err) => {
    process.stderr.write(`Ghost check error: ${err.message}\n`);
  });

  // Run periodically
  const intervalId = setInterval(async () => {
    try {
      const count = await markGhostedApplications(db);
      if (count > 0) {
        process.stdout.write(`Ghost check: moved ${count} application(s) to Ghosted status\n`);
      }
    } catch (err) {
      process.stderr.write(`Ghost check error: ${err.message}\n`);
    }
  }, CHECK_INTERVAL_MS);

  return intervalId;
}

module.exports = { markGhostedApplications, startGhostChecker, GHOST_THRESHOLD_DAYS };
