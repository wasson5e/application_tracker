'use strict';

const { Router } = require('express');

/**
 * Returns an Express Router for the user filter preferences endpoints.
 *
 * Stores filter state in a `filters` collection as a single document
 * (upserted by a fixed key: { _key: 'default' }).
 *
 * @param {import('mongodb').Db} db - Connected MongoDB database handle
 * @returns {import('express').Router}
 */
function createFiltersRouter(db) {
  const router = Router();

  const col = () => db.collection('filters');

  // ---------------------------------------------------------------------------
  // GET /filters — retrieve the current saved filter state
  // ---------------------------------------------------------------------------
  router.get('/', async (_req, res) => {
    try {
      const doc = await col().findOne({ _key: 'default' });
      if (!doc) {
        // No filters saved yet — return empty filters
        return res.status(200).json({ company: '', location: '', status: '' });
      }
      return res.status(200).json({
        company: doc.company || '',
        location: doc.location || '',
        status: doc.status || '',
      });
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // PUT /filters — save/update the filter state
  // ---------------------------------------------------------------------------
  router.put('/', async (req, res) => {
    const body = req.body || {};

    const update = {
      company: body.company !== undefined ? String(body.company) : '',
      location: body.location !== undefined ? String(body.location) : '',
      status: body.status !== undefined ? String(body.status) : '',
    };

    try {
      await col().updateOne(
        { _key: 'default' },
        { $set: update },
        { upsert: true }
      );
      return res.status(200).json(update);
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable. Please try again later.',
      });
    }
  });

  return router;
}

module.exports = { createFiltersRouter };
