'use strict';

const express = require('express');
const morgan = require('morgan');
const { createRouter } = require('./routes/applications');
const { createFiltersRouter } = require('./routes/filters');
const { createResumeRouter } = require('./routes/resume');

/**
 * Creates and returns a configured Express application.
 *
 * Middleware stack (in order):
 *   1. express.json()        – parse JSON request bodies
 *   2. morgan                – HTTP request logger (stdout)
 *   3. /applications router  – all five CRUD endpoints
 *   3b. /filters router      – filter preferences
 *   3c. /applications/:id/resume – resume upload/download
 *   4. 404 catch-all         – returns { "error": "Not Found" }
 *   5. Global error handler  – logs stack to stderr, returns { "error": "Internal server error" }
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @param {{ resumePath?: string }} [options] - Additional config options
 * @returns {import('express').Express}
 */
function createApp(db, options = {}) {
  const app = express();

  // 1. Parse JSON bodies.
  app.use(express.json());

  // 2. HTTP request logger — writes combined log to stdout.
  app.use(morgan('combined'));

  // 3. Application CRUD routes.
  app.use('/applications', createRouter(db));

  // 3b. Filter preferences routes.
  app.use('/filters', createFiltersRouter(db));

  // 3c. Resume upload/download routes.
  if (options.resumePath) {
    app.use('/applications', createResumeRouter(db, options.resumePath));
  }

  // 4. 404 catch-all — any request that didn't match a route above.
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // 5. Global error handler — must have four parameters for Express to treat it
  //    as an error-handling middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    process.stderr.write(`Unhandled error: ${err.stack || err}\n`);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
